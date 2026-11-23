// Run against the built web client and server. All writes and replay sessions use a disposable home.
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import { chromium } from "playwright-core";
import { checkDaycrewFeed } from "./lib/check-daycrew-feed.ts";

const repo = NodePath.resolve(import.meta.dirname, "..");
const cli = NodePath.join(repo, "apps/server/dist/bin.mjs");
const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "daycrew-feed-"));
const userdata = NodePath.join(home, "userdata");
const project = NodePath.join(home, "project");
const database = NodePath.join(userdata, "statev2.sqlite");
const historySize = 300;
const reply = "Count this recovered reply once.";
const env = { ...process.env, T3CODE_TELEMETRY_ENABLED: "false", T3CODE_OTEL_SDK_DISABLED: "true" };
let server;
let exited;
let browser;

function seed() {
  NodeFS.mkdirSync(userdata);
  NodeFS.mkdirSync(project);
  NodeChildProcess.execFileSync("git", ["init", "-q", "-b", "main", project]);
  NodeFS.copyFileSync(
    NodePath.join(repo, "scripts/fixtures/desktop-launch/statev2.sqlite"),
    database,
  );
  const providers = Object.fromEntries(
    ["codex", "claudeAgent", "cursor", "grok", "muse", "pi", "opencode", "antigravity"].map(
      (id) => [id, { driver: id, enabled: false }],
    ),
  );
  providers.replay = {
    driver: "acpRegistry",
    enabled: true,
    config: {
      source: "local",
      // The CLI can reach the test server before its first ACP model probe completes.
      customModels: ["command-output", "approval"],
      commandPath: process.execPath,
      commandArgs: [NodePath.join(repo, "apps/server/scripts/dev-replay-agent.ts")],
    },
  };
  NodeFS.writeFileSync(
    NodePath.join(userdata, "settings.json"),
    JSON.stringify({ defaultRuntimeMode: "approval-required", providerInstances: providers }),
  );
  const db = new NodeSqlite.DatabaseSync(database);
  try {
    db.prepare(
      "UPDATE projection_projects SET workspace_root=? WHERE project_id='launch-check-project'",
    ).run(project);
    const template = JSON.parse(
      db
        .prepare(
          "SELECT payload_json FROM orchestration_v2_projection_threads WHERE thread_id='launch-check-thread'",
        )
        .get().payload_json,
    );
    const thread = db.prepare(`INSERT INTO orchestration_v2_projection_threads
      (thread_id,project_id,title,default_provider,provider_instance_id,runtime_mode,interaction_mode,created_at,updated_at,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const run = db.prepare(`INSERT INTO orchestration_v2_projection_runs
      (run_id,thread_id,ordinal,provider,provider_instance_id,status,requested_at,completed_at,payload_json)
      VALUES (?,?,1,'replay','replay','completed',?,?,?)`);
    db.exec("BEGIN");
    for (let i = 0; i < historySize; i++) {
      const id = "history-" + i,
        title = "Build log " + i;
      const time = new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString();
      const modelSelection = { instanceId: "replay", model: "command-output" };
      const state = {
        ...template,
        id,
        title,
        providerInstanceId: "replay",
        modelSelection,
        createdAt: time,
        updatedAt: time,
        lineage: { ...template.lineage, rootThreadId: id },
      };
      thread.run(
        id,
        state.projectId,
        title,
        "acpRegistry",
        "replay",
        state.runtimeMode,
        state.interactionMode,
        time,
        time,
        JSON.stringify(state),
      );
      const record = {
        id: "run-" + id,
        threadId: id,
        ordinal: 1,
        providerInstanceId: "replay",
        modelSelection,
        providerThreadId: null,
        userMessageId: null,
        rootNodeId: null,
        activeAttemptId: null,
        status: "completed",
        requestedAt: time,
        startedAt: time,
        completedAt: time,
        checkpointId: null,
        contextHandoffId: null,
      };
      run.run(record.id, id, time, time, JSON.stringify(record));
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}

async function start(port) {
  server = NodeChildProcess.spawn(
    process.execPath,
    [cli, "--base-dir", home, "--host", "127.0.0.1", "--port", String(port), "--no-browser"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  exited = NodeEvents.once(server, "exit");
  const ready = Promise.withResolvers();
  let log = "";
  function read(chunk) {
    log = (log + chunk).slice(-16384);
    const url = log.match(/pairingUrl:\s*(http:\/\/\S+)\s/)?.[1];
    if (url) ready.resolve(url);
  }
  server.stdout.on("data", read);
  server.stderr.on("data", read);
  const timer = setTimeout(() => ready.reject(new Error("No pairing URL from test server")), 45000);
  try {
    return await Promise.race([
      ready.promise,
      exited.then(() => {
        throw Error("Test server exited before pairing");
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function stop() {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 10000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
}
function startThread(title, model, wait = false) {
  return JSON.parse(
    NodeChildProcess.execFileSync(
      process.execPath,
      [
        cli,
        "thread",
        "start",
        "--base-dir",
        home,
        "--provider",
        "replay",
        "--model",
        model,
        "--title",
        title,
        "--json",
        ...(wait ? ["--wait"] : []),
        project,
        title,
      ],
      { encoding: "utf8", env, timeout: 60000 },
    ),
  ).threadId;
}
async function check() {
  seed();
  const probe = NodeNet.createServer();
  probe.listen(0, "127.0.0.1");
  await NodeEvents.once(probe, "listening");
  const port = probe.address().port;
  const closed = NodeEvents.once(probe, "close");
  probe.close();
  await closed;
  const url = await start(port);
  const target = startThread("Recovery target", "command-output", true);
  startThread("Approval A", "approval");
  startThread("Approval B", "approval");
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 3440, height: 1440 } });
  let withholdResponses = false;
  await page.routeWebSocket("**/*", (socket) => {
    const upstream = socket.connectToServer();
    upstream.onMessage((data) => {
      if (!withholdResponses) socket.send(data);
    });
  });
  await page.goto(url);
  await page.getByRole("link", { name: "Agent feed", exact: true }).click();
  await page.getByRole("button", { name: "Toggle main sidebar" }).click();
  const rail = page.locator('[data-slot="agent-rail"]');
  const waiting = rail.locator('[data-attention="true"]');
  await waiting.nth(1).waitFor();
  NodeAssert.equal(await waiting.count(), 2);
  const cards = page.locator(".feed-card");
  await cards.nth(19).waitFor();
  NodeAssert.equal(await cards.count(), 20);
  await page.getByRole("button", { name: "Show more" }).click();
  const deepCard = cards.nth(34);
  await deepCard.getByRole("button", { name: "Replies" }).click();
  const editor = deepCard.getByRole("textbox");
  await editor.fill("Return to this draft");
  const settleFeed = () =>
    page.locator(".feed-layout").evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ).then(() => undefined),
    );
  await settleFeed();
  const top = await editor.evaluate((el) => el.getBoundingClientRect().top);
  await rail.getByRole("link", { name: /Approval B/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await rail.getByRole("link", { name: /Approval B/ }).waitFor({ state: "detached" });
  await rail.getByRole("link", { name: /Approval A/ }).waitFor();
  await page.getByRole("button", { name: "Close details", exact: true }).click({ timeout: 5000 });
  await settleFeed();
  NodeAssert.equal(await editor.inputValue(), "Return to this draft");
  NodeAssert.ok(
    await editor.evaluate((el) => el === document.activeElement),
    "Return focus to the draft",
  );
  const restoredTop = await editor.evaluate((el) => el.getBoundingClientRect().top);
  NodeAssert.ok(Math.abs(restoredTop - top) <= 2, `Draft moved from ${top}px to ${restoredTop}px`);
  console.log(
    "300 completed threads, two simultaneous approvals, correct rail target, draft focus and scroll restored",
  );
  const card = cards.filter({
    has: page.getByRole("heading", { name: "Recovery target", exact: true }),
  });
  const replies = card.getByRole("button", { name: "Replies" });
  const composer = card.getByRole("textbox");
  const send = card.getByRole("button", { name: "Send reply" });
  await replies.click();
  await composer.fill("Count this");
  await stop();
  await card.getByText("Reconnecting. Your draft is saved.").waitFor();
  NodeAssert.ok(await send.isDisabled());
  await composer.fill(reply);
  await start(port);
  await page.reload();
  await replies.click();
  NodeAssert.equal(await composer.inputValue(), reply);

  // Withhold the acknowledgement until the backend has committed. Reload the client
  // with its actual unsent draft, then retry and count all runs on the target thread.
  const db = new NodeSqlite.DatabaseSync(database, { readOnly: true });
  try {
    const runs = db.prepare(
      "SELECT count(*) AS n FROM orchestration_v2_projection_runs WHERE thread_id=?",
    );
    const before = runs.get(target).n;
    withholdResponses = true;
    await send.click();
    await waitForRun(runs, target, before + 1);
    await page.goto("about:blank");
    withholdResponses = false;
    await page.goto(new URL("/feed", url).href);
    await replies.click();
    NodeAssert.equal(await composer.inputValue(), reply);
    await send.click();
    await card.getByText("Reply sent", { exact: true }).waitFor();
    NodeAssert.equal(await composer.inputValue(), "");
    NodeAssert.equal(runs.get(target).n, before + 1);
    NodeAssert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM orchestration_v2_projection_messages WHERE thread_id=? AND role='user' AND json_extract(payload_json,'$.text')=?",
        )
        .get(target, reply).n,
      1,
    );
  } finally {
    db.close();
  }
  console.log(
    "Offline draft survived restart; retry after a lost acknowledgement created one message and one run",
  );
  await replies.click();
  const output = NodePath.join(repo, "release", "daycrew-feed-checks");
  NodeFS.mkdirSync(output, { recursive: true });
  // A Changes transition must never mount the conversation, even for one commit.
  const observedChat = await page.evaluateHandle(() => {
    let mounted = false;
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches("[data-chat-layout]") || node.querySelector("[data-chat-layout]"))
          )
            mounted = true;
        }
    });
    observer.observe(document.querySelector(".feed-detail"), { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      return mounted;
    };
  });
  const timings = [];
  for (const width of [1366, 3440]) {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 1440 });
    timings.push(await checkDaycrewFeed(page, width, output, "Recovery target"));
  }
  NodeFS.writeFileSync(NodePath.join(output, "timing.json"), JSON.stringify(timings, null, 2));
  console.log(JSON.stringify(timings));
  NodeAssert.equal(
    await observedChat.evaluate((finish) => finish()),
    false,
    "Changes navigation mounted a conversation",
  );
  await observedChat.dispose();
}

function waitForRun(runs, id, count) {
  // Watch the WAL directory and check once after subscribing in case the commit already happened.
  const committed = Promise.withResolvers();
  const check = () => {
    if (runs.get(id).n >= count) committed.resolve();
  };
  const watcher = NodeFS.watch(userdata, check);
  watcher.on("error", committed.reject);
  const timer = setTimeout(
    () => committed.reject(new Error("Reply did not reach the server")),
    15000,
  );
  check();
  return committed.promise.finally(() => {
    watcher.close();
    clearTimeout(timer);
  });
}

try {
  await check();
} finally {
  await browser?.close();
  await stop();
  NodeFS.rmSync(home, { recursive: true, force: true });
}
