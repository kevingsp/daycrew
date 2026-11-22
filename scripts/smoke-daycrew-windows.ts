// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off
/* oxlint-disable t3code/no-global-process-runtime -- This Windows release probe runs outside Effect. */
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as NodeTimersPromises from "node:timers/promises";
import { _electron, type ElectronApplication } from "playwright-core";
import { checkDaycrewFeed } from "./lib/check-daycrew-feed.ts";

NodeAssert.equal(process.platform, "win32", "Run this check on Windows x64.");
NodeAssert.equal(process.arch, "x64");
NodeAssert.equal(
  process.env.RUNNER_ENVIRONMENT,
  "github-hosted",
  "Use a disposable GitHub-hosted runner; this probe changes installer registrations.",
);
const repo = NodePath.resolve(import.meta.dirname, "..");
const release = NodePath.join(repo, "release");
const evidence = NodePath.join(release, "daycrew-windows-check");
NodeFS.mkdirSync(evidence, { recursive: true });
const installer = NodeFS.readdirSync(release).find((name) =>
  /^Daycrew-.*-Windows-x64\.exe$/.test(name),
);
NodeAssert.ok(installer, "Windows x64 NSIS installer is missing");
const installerPath = NodePath.join(release, installer);
const temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "daycrew-install-"));
const installDir = NodePath.join(temporary, "app");
let executable = NodePath.join(installDir, "Daycrew.exe");
const localAppData = NodePath.join(temporary, "local");
const home = NodePath.join(localAppData, "T3CodeWorkspaces");
const userdata = NodePath.join(home, "userdata");
NodeFS.mkdirSync(userdata, { recursive: true });
NodeFS.copyFileSync(
  NodePath.join(repo, "scripts/fixtures/desktop-launch/statev2.sqlite"),
  NodePath.join(userdata, "statev2.sqlite"),
);
const fixture = new NodeSqlite.DatabaseSync(NodePath.join(userdata, "statev2.sqlite"));
const project = NodePath.join(temporary, "project");
NodeFS.mkdirSync(project);
NodeFS.writeFileSync(NodePath.join(project, "README.md"), "Daycrew verification workspace\n");
NodeChildProcess.execFileSync("git", ["init", "-b", "main", project], { stdio: "ignore" });
NodeChildProcess.execFileSync("git", ["-C", project, "add", "README.md"], { stdio: "ignore" });
NodeChildProcess.execFileSync(
  "git",
  [
    "-C",
    project,
    "-c",
    "user.name=Daycrew Check",
    "-c",
    "user.email=daycrew-check@example.invalid",
    "commit",
    "-m",
    "Seed verification workspace",
  ],
  { stdio: "ignore" },
);
fixture
  .prepare(
    "UPDATE projection_projects SET workspace_root = ? WHERE project_id = 'launch-check-project'",
  )
  .run(project);
const timestamp = "2026-10-27T10:01:00.000Z";
const run = {
  id: "daycrew-check-run",
  threadId: "launch-check-thread",
  ordinal: 1,
  providerInstanceId: "codex",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  providerThreadId: null,
  userMessageId: "launch-check-user",
  rootNodeId: null,
  activeAttemptId: null,
  status: "completed",
  requestedAt: timestamp,
  startedAt: timestamp,
  completedAt: timestamp,
  checkpointId: null,
  contextHandoffId: null,
};
fixture
  .prepare(
    "INSERT INTO orchestration_v2_projection_runs(run_id,thread_id,ordinal,provider,status,requested_at,completed_at,payload_json,provider_instance_id) VALUES(?,?,?,?,?,?,?,?,?)",
  )
  .run(
    run.id,
    run.threadId,
    1,
    "codex",
    "completed",
    timestamp,
    timestamp,
    JSON.stringify(run),
    "codex",
  );
fixture.close();
const settings = {
  providerInstances: {
    "daycrew-inkling": {
      driver: "pi",
      displayName: "Inkling Local",
      enabled: false,
      environment: [
        { name: "PI_CODING_AGENT_DIR", value: NodePath.join(home, "inkling/pi"), sensitive: false },
      ],
      config: { enabled: false },
    },
  },
};
NodeFS.writeFileSync(NodePath.join(userdata, "settings.json"), JSON.stringify(settings));
NodeFS.mkdirSync(NodePath.join(home, "worktrees"));
NodeFS.writeFileSync(NodePath.join(home, "worktrees", "preserved.txt"), "existing worktree marker");
const env: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
  LOCALAPPDATA: localAppData,
  T3CODE_TELEMETRY_ENABLED: "false",
  T3CODE_OTEL_SDK_DISABLED: "true",
};
// Exercise the production default path and packaged update policy.
delete env.T3CODE_HOME;
delete env.T3CODE_DISABLE_AUTO_UPDATE;
const checks: string[] = [];
const timing: unknown[] = [];
const powerShell = (script: string, extraEnv: Record<string, string> = {}) =>
  NodeChildProcess.execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; ${script}`],
    { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 120_000 },
  ).trim();
async function waitFor(test: () => boolean | Promise<boolean>, label: string, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (!(await test())) {
    NodeAssert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await NodeTimersPromises.setTimeout(200);
  }
}
function verifyPreserved() {
  const actual = JSON.parse(NodeFS.readFileSync(NodePath.join(userdata, "settings.json"), "utf8"));
  NodeAssert.deepEqual(
    actual.providerInstances["daycrew-inkling"],
    settings.providerInstances["daycrew-inkling"],
  );
  NodeAssert.equal(
    NodeFS.readFileSync(NodePath.join(home, "worktrees", "preserved.txt"), "utf8"),
    "existing worktree marker",
  );
}
let app: ElectronApplication | undefined;
try {
  NodeChildProcess.execFileSync(installerPath, ["/S", `/D=${installDir}`], {
    env,
    timeout: 180_000,
  });
  NodeAssert.ok(NodeFS.existsSync(executable));
  executable = NodeFS.realpathSync.native(executable);
  NodeAssert.match(
    NodeFS.readFileSync(NodePath.join(installDir, "resources/T3-Code-LICENSE.txt"), "utf8"),
    /Copyright \(c\) 2026 T3 Tools Inc\./,
  );
  checks.push("NSIS per-user install");
  const shortcutInventory = JSON.parse(
    powerShell(
      `$roots = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms')); $shell = New-Object -ComObject WScript.Shell; $links = @(Get-ChildItem $roots -Recurse -Filter 'Daycrew.lnk' | ForEach-Object { @{ path = $_.FullName; target = $shell.CreateShortcut($_.FullName).TargetPath } }); ConvertTo-Json -InputObject $links -Compress`,
    ),
  ) as Array<{ path: string; target: string }>;
  NodeFS.writeFileSync(
    NodePath.join(evidence, "shortcuts.json"),
    JSON.stringify({ executable, shortcutInventory }, null, 2),
  );
  const shortcut = shortcutInventory.find(
    (link) =>
      NodeFS.existsSync(link.target) &&
      NodeFS.realpathSync.native(link.target).toLowerCase() === executable.toLowerCase(),
  )?.path;
  NodeAssert.ok(shortcut, "Start menu shortcut is missing");
  const appId = powerShell(
    `$shell = New-Object -ComObject Shell.Application; $folder = $shell.NameSpace([IO.Path]::GetDirectoryName($env:DAYCREW_LINK)); $folder.ParseName([IO.Path]::GetFileName($env:DAYCREW_LINK)).ExtendedProperty('System.AppUserModel.ID')`,
    { DAYCREW_LINK: shortcut },
  );
  NodeAssert.equal(appId, "com.nyshift.daycrew");
  checks.push("Start menu shortcut and taskbar identity");
  const uninstall = powerShell(
    String.raw`Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'Daycrew' } | Select-Object -First 1 -ExpandProperty UninstallString`,
  );
  NodeAssert.ok(uninstall, "Uninstall entry is missing");
  checks.push("Daycrew uninstall entry");

  for (const pass of ["first-launch", "reinstalled"]) {
    app = await _electron.launch({ executablePath: executable, env, timeout: 60_000 });
    const launched = app;
    const page = await app.firstWindow();
    await page
      .locator("li[data-thread-item]", { hasText: "Release launch check" })
      .waitFor({ timeout: 60_000 });
    await page.locator("li[data-thread-item]", { hasText: "Release launch check" }).click();
    await page.getByText("The release opens and shows this thread.").waitFor({ timeout: 60_000 });
    NodeAssert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    NodeAssert.equal(await app.evaluate(({ app }) => app.getName()), "Daycrew Beta");
    NodeAssert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
    );
    NodeAssert.match(await page.title(), /Release launch check/);
    checks.push(`${pass}: packaged window and migrated project/thread/message`);
    const backend = JSON.parse(
      NodeFS.readFileSync(NodePath.join(userdata, "server-runtime.json"), "utf8"),
    );
    const backendPid = backend.pid as number;
    await page.getByRole("link", { name: "Agent feed", exact: true }).click();
    await page.getByRole("heading", { name: "Agent feed", exact: true }).waitFor();
    if (pass === "first-launch") {
      const reopened = NodeChildProcess.spawn(executable, [], { env, stdio: "ignore" });
      await new Promise<void>((resolve, reject) => {
        reopened.once("error", reject);
        reopened.once("exit", (code) =>
          code === 0 || code === 130 ? resolve() : reject(new Error(`reopen exited ${code}`)),
        );
      });
      NodeAssert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        1,
      );
      await waitFor(
        () =>
          launched.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused() === true,
          ),
        "reopen focuses the existing window",
      );
      checks.push("second invocation focuses the existing window");
      for (const [width, height] of [
        [1366, 768],
        [3440, 1440],
      ] as const) {
        await app.evaluate(
          ({ BrowserWindow }, size) =>
            BrowserWindow.getAllWindows()[0]?.setContentSize(size[0]!, size[1]!),
          [width, height],
        );
        timing.push(await checkDaycrewFeed(page, width, evidence));
      }
      checks.push(
        "laptop and ultrawide: replies, column enter/exit, card anchoring, focus restoration, draft retention, frame/input sampling",
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page
        .locator(".feed-card")
        .first()
        .getByRole("link", { name: "Review diff", exact: true })
        .click();
      NodeAssert.equal(
        await page
          .locator(".feed-layout")
          .evaluate((element) =>
            getComputedStyle(element).getPropertyValue("--feed-duration").trim(),
          ),
        "0ms",
      );
      await page.getByRole("button", { name: "Close details", exact: true }).click();
      checks.push("reduced motion disables feed transitions");
      await page.getByRole("button", { name: "Replies", exact: true }).first().click();
      const composer = page.getByRole("textbox", { name: "Reply to Release launch check" });
      await composer.fill("Daycrew installer verification message");
      await page.getByRole("button", { name: "Send reply", exact: true }).click();
      NodeAssert.equal(
        await composer.evaluate((element) => element === document.activeElement),
        true,
      );
      await page.getByRole("status").filter({ hasText: "Reply sent" }).waitFor({ timeout: 60_000 });
      checks.push(
        "reply command accepted without losing composer focus (no authenticated provider run)",
      );
    }
    const exited = new Promise<void>((resolve) => launched.process().once("exit", () => resolve()));
    await app
      .evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      })
      .catch(() => {});
    await Promise.race([
      exited,
      NodeTimersPromises.setTimeout(30_000).then(() => {
        throw new Error("Closing the window did not quit Daycrew");
      }),
    ]);
    app = undefined;
    await waitFor(
      () => {
        try {
          process.kill(backendPid, 0);
          return false;
        } catch {
          return true;
        }
      },
      "owned backend exits",
      30_000,
    );
    verifyPreserved();
    checks.push(
      `${pass}: close quits app and owned backend; provider settings and worktree preserved`,
    );
    if (pass === "first-launch") {
      NodeChildProcess.execFileSync(installerPath, ["/S", `/D=${installDir}`], {
        env,
        timeout: 180_000,
      });
      verifyPreserved();
      checks.push("installer replacement retains data");
    }
  }

  const preview = NodeNet.createServer();
  await new Promise<void>((resolve, reject) =>
    preview.once("error", reject).listen(47831, "127.0.0.1", resolve),
  );
  const databaseBeforeConflict = NodeCrypto.createHash("sha256")
    .update(NodeFS.readFileSync(NodePath.join(userdata, "statev2.sqlite")))
    .digest("hex");
  const blocked = NodeChildProcess.spawn(executable, [], { env, stdio: "ignore" });
  try {
    NodeAssert.ok(blocked.pid);
    await waitFor(
      () =>
        powerShell(
          `$p = Get-Process -Id $env:DAYCREW_PID -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { 'ready' }`,
          { DAYCREW_PID: String(blocked.pid) },
        ) === "ready",
      "legacy preview conflict dialog",
    );
    const dialog = powerShell(
      `Add-Type -AssemblyName UIAutomationClient; $p = Get-Process -Id $env:DAYCREW_PID; $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle); $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name }`,
      { DAYCREW_PID: String(blocked.pid) },
    );
    NodeFS.writeFileSync(NodePath.join(evidence, "preview-conflict.txt"), dialog);
    NodeAssert.match(dialog, /47831/);
    NodeAssert.equal(
      NodeCrypto.createHash("sha256")
        .update(NodeFS.readFileSync(NodePath.join(userdata, "statev2.sqlite")))
        .digest("hex"),
      databaseBeforeConflict,
    );
    powerShell(
      `$p = Get-Process -Id $env:DAYCREW_PID; if (!$p.CloseMainWindow()) { throw 'Could not close conflict dialog' }; if (!$p.WaitForExit(30000)) { throw 'Blocked app did not quit' }`,
      { DAYCREW_PID: String(blocked.pid) },
    );
    checks.push(
      "legacy preview port without a database lock shows a conflict and leaves the database unchanged",
    );
  } finally {
    if (blocked.exitCode === null) blocked.kill();
    await new Promise<void>((resolve, reject) =>
      preview.close((error) => (error ? reject(error) : resolve())),
    );
  }

  powerShell(`Start-Process -FilePath $env:DAYCREW_LINK`, { DAYCREW_LINK: shortcut });
  let startMenuPid = 0;
  await waitFor(() => {
    const result = powerShell(
      `Get-Process | Where-Object { $_.Path -eq $env:DAYCREW_EXE -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | Select-Object -First 1 -ExpandProperty Id`,
      { DAYCREW_EXE: executable },
    );
    startMenuPid = Number(result);
    return startMenuPid > 0;
  }, "Start menu opens Daycrew window");
  let startMenuBackendPid = 0;
  await waitFor(() => {
    try {
      startMenuBackendPid = JSON.parse(
        NodeFS.readFileSync(NodePath.join(userdata, "server-runtime.json"), "utf8"),
      ).pid;
      process.kill(startMenuBackendPid, 0);
      return true;
    } catch {
      return false;
    }
  }, "Start menu launch starts the owned backend");
  checks.push("actual Start menu shortcut launch");
  powerShell(
    `$p = Get-Process -Id $env:DAYCREW_PID; if (!$p.CloseMainWindow()) { throw 'Could not close Daycrew window' }; if (!$p.WaitForExit(30000)) { throw 'Daycrew did not quit' }`,
    { DAYCREW_PID: String(startMenuPid) },
  );
  checks.push("native window close quits after Start menu launch");
  await waitFor(
    () => {
      try {
        process.kill(startMenuBackendPid, 0);
        return false;
      } catch {
        return true;
      }
    },
    "Start menu backend exits",
    30_000,
  );
  const uninstaller = NodeFS.readdirSync(installDir).find((name) =>
    /^Uninstall.*\.exe$/i.test(name),
  );
  NodeAssert.ok(uninstaller);
  NodeChildProcess.execFileSync(NodePath.join(installDir, uninstaller), ["/S"], {
    env,
    timeout: 180_000,
  });
  await waitFor(() => !NodeFS.existsSync(executable), "uninstall removes executable");
  verifyPreserved();
  NodeAssert.ok(NodeFS.existsSync(NodePath.join(userdata, "statev2.sqlite")));
  checks.push("uninstall removes app and preserves user data");
} finally {
  if (app) await app.close().catch(() => {});
  const logs = NodePath.join(userdata, "logs");
  if (NodeFS.existsSync(logs))
    NodeFS.cpSync(logs, NodePath.join(evidence, "logs"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(evidence, "verification.json"),
    JSON.stringify(
      {
        platform: process.platform,
        arch: process.arch,
        checks,
        timing,
        installer,
        sha256: NodeCrypto.createHash("sha256")
          .update(NodeFS.readFileSync(installerPath))
          .digest("hex"),
        limitations: [
          "No authenticated cloud agent run",
          "No GPU/Inkling inference",
          "Same-version replacement, not an older Daycrew desktop upgrade",
          "Hosted runner is not a physical ultrawide display",
        ],
      },
      null,
      2,
    ),
  );
}
console.log(checks.join("\n"));
