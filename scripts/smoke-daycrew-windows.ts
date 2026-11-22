// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
/* oxlint-disable t3code/no-global-process-runtime -- This Windows release probe runs outside Effect. */
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import { _electron, type ElectronApplication } from "playwright-core";

NodeAssert.equal(process.platform, "win32", "Run this check on Windows x64.");
NodeAssert.equal(process.arch, "x64");
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
const executable = NodePath.join(installDir, "Daycrew.exe");
const localAppData = NodePath.join(temporary, "local");
const home = NodePath.join(localAppData, "T3CodeWorkspaces");
const userdata = NodePath.join(home, "userdata");
NodeFS.mkdirSync(userdata, { recursive: true });
NodeFS.copyFileSync(
  NodePath.join(repo, "scripts/fixtures/desktop-launch/statev2.sqlite"),
  NodePath.join(userdata, "statev2.sqlite"),
);
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
const env: NodeJS.ProcessEnv = {
  ...process.env,
  LOCALAPPDATA: localAppData,
  T3CODE_TELEMETRY_ENABLED: "false",
  T3CODE_OTEL_SDK_DISABLED: "true",
};
// Exercise the production default NodePath and packaged update policy.
delete env.T3CODE_HOME;
delete env.T3CODE_DISABLE_AUTO_UPDATE;
const checks: string[] = [];
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
  checks.push("NSIS per-user install");
  const shortcut = powerShell(
    `$roots = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms')); $shell = New-Object -ComObject WScript.Shell; Get-ChildItem $roots -Recurse -Filter 'Daycrew.lnk' | Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -eq $env.DAYCREW_EXE } | Select-Object -First 1 -ExpandProperty FullName`,
    { DAYCREW_EXE: executable },
  );
  NodeAssert.ok(shortcut, "Start menu shortcut is missing");
  const appId = powerShell(
    `$shell = New-Object -ComObject Shell.Application; $folder = $shell.NameSpace([IO.Path]::GetDirectoryName($env.DAYCREW_LINK)); $folder.ParseName([IO.Path]::GetFileName($env.DAYCREW_LINK)).ExtendedProperty('System.AppUserModel.ID')`,
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
    NodeAssert.match(await page.title(), /Daycrew/);
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
          code === 0 ? resolve() : reject(new Error(`reopen exited ${code}`)),
        );
      });
      NodeAssert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        1,
      );
      NodeAssert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused()),
        true,
      );
      checks.push("second invocation focuses the existing window");
      for (const [width, height] of [
        [1366, 768],
        [3440, 1440],
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, size) =>
            BrowserWindow.getAllWindows()[0]?.setContentSize(size[0], size[1]),
          [width!, height!],
        );
        await page.screenshot({ path: NodePath.join(evidence, `feed-${width}.png`) });
        NodeAssert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
        );
      }
      checks.push(
        "feed renders at laptop and ultrawide sizes without horizontal document overflow",
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

  powerShell(`Start-Process -FilePath $env.DAYCREW_LINK`, { DAYCREW_LINK: shortcut });
  let startMenuPid = 0;
  await waitFor(() => {
    const result = powerShell(
      `Get-Process | Where-Object { $_.Path -eq $env.DAYCREW_EXE -and $_.MainWindowTitle -like '*Daycrew*' } | Select-Object -First 1 -ExpandProperty Id`,
      { DAYCREW_EXE: executable },
    );
    startMenuPid = Number(result);
    return startMenuPid > 0;
  }, "Start menu opens Daycrew window");
  checks.push("actual Start menu shortcut launch");
  powerShell(
    `$p = Get-Process -Id $env.DAYCREW_PID; if (!$p.CloseMainWindow()) { throw 'Could not close Daycrew window' }; if (!$p.WaitForExit(30000)) { throw 'Daycrew did not quit' }`,
    { DAYCREW_PID: String(startMenuPid) },
  );
  checks.push("native window close quits after Start menu launch");
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
