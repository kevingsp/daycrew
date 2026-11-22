# Daycrew by NYShift — Windows desktop handoff

## Current release

Daycrew is a Windows x64 workspace for directing coding agents. The portable preview runs a local server and opens the web client in the default browser. The next deliverable is a standalone, installable Daycrew desktop application. The existing Electron workspace is the starting point. The portable artifact is named `Daycrew-Windows-x64.zip`. See [the preview screenshot](daycrew-ui.png).

The source was reconstructed from the shipped Daycrew patch against pingdotgg/t3code v0.1.11, commit 59651c1761f6c63e9b6056839067066968e6a406. Keep upstream attribution and licensing. Release ZIP SHA-256 is `c233514fade282d8a2658cb8804ab0f052e8254a870d75b6ad272b401eba6323`.

## Existing features and code

| Area                                                | Entry point                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Task feed, replies, approvals, files and PR details | `apps/web/src/components/AgentFeed.tsx`, `agentFeed.css`                                                                                   |
| Workspaces and scoped feed panels                   | `apps/web/src/routes/_chat.workspaces.tsx` and the feed routes in that directory                                                           |
| Project tree and New task                           | `apps/web/src/components/Sidebar.tsx` and `components/sidebar/`                                                                            |
| Diff review and optional Claude review              | `apps/web/src/components/DiffPanel.tsx` and `AgentFeed.tsx`                                                                                |
| Desktop window, preload, packaging                  | `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/window/DesktopWindow.ts`, `scripts/build-desktop-artifact.ts` |
| Preview launchers and agent bootstrap               | `packaging/daycrew/windows/`                                                                                                               |

Agent setup is documented in [AGENTS-SETUP.txt](../packaging/daycrew/windows/AGENTS-SETUP.txt). Cloud agents include Codex, Meta Muse Code, Grok Build and Google Antigravity for Gemini 4 Neon where the account offers it. Inkling 2 Mini uses a dedicated Pi profile and local llama.cpp. Its weights download separately. Claude review needs a configured Claude provider. Skill factory management was discussed as a future idea.

## Desktop acceptance criteria for Codex

1. Package Windows x64 with the Daycrew product name, D icon, Start menu entry, taskbar identity, About text and uninstall entry. The app opens in its own window without a default-browser tab or persistent launcher terminal.
2. Reuse the packaged Electron main/preload and managed server lifecycle. Reopening focuses the existing window. Shutdown cleans up processes the app owns. External authentication can still open the system browser.
3. Preserve existing projects, worktrees, threads, and provider settings under `%LOCALAPPDATA%\T3CodeWorkspaces`. Port 47831 is the legacy launcher endpoint. Handle a running preview gracefully and avoid running concurrent writers against the same data.
4. Preserve the optional local Inkling path on loopback port 47832. Cloud-only use must start without Pi, CUDA or model weights. Retain existing approval and authentication behavior.
5. Preserve the light default, grouped projects, visible New task, and one feed card per task. File counts, thumbnails and PR links come from actual work. Diff panels keep the selected card anchored, restore focus when closed, and respect reduced motion. Animate opening and closing columns, expanding replies, sending messages and receiving updates. Preserve input focus and scroll position as content streams. Check frame timing and input latency on Windows at both laptop and ultrawide viewport sizes.
6. Verify installer, launch, reopen, close, upgrade/data reuse, and agent handoff on Windows. Publish the tested installer to this repository's Releases and verify its digest. Review upstream updater destinations before enabling any desktop update flow.

## Development

The root package pins Node 26.13.1 and pnpm 12.14.0 for building from source. From the repo root:

```sh
pnpm install --frozen-lockfile
pnpm run dev:desktop
pnpm run dist:desktop:win:x64
```

The last two commands are upstream entry points for the desktop work. Run the Windows packaging command on Windows x64 and verify the generated installer. See [AGENTS.md](../AGENTS.md) and [development notes](operations/development.md) for repo conventions.

### Standalone desktop operation

The desktop installer uses the Daycrew name and Start menu shortcut. Close the portable preview's launcher terminal before opening Daycrew. Both use `%LOCALAPPDATA%\T3CodeWorkspaces`; the desktop checks the legacy preview port and the server's ownership lock before starting its managed backend. An explicit `T3CODE_HOME` still overrides this location. Quit Daycrew to stop its owned backend. Externally started model servers remain under their launcher's control.

The Electron profile lives separately at `%APPDATA%\daycrew`. On first use, the desktop can copy legacy Windows credential keys without copying locked Chromium databases. Projects, worktrees, threads and provider settings remain in the original workspace home. Uninstalling the desktop keeps that home.

Inkling's existing Pi profile and `http://127.0.0.1:47832/v1` endpoint are retained through the same provider settings. The desktop does not install Pi, download weights or start a GPU runtime. Cloud-only startup does not require those components. The portable Inkling launcher also starts the preview server; close that preview before switching to the desktop, and run the model server separately if it must stay available.

Local installers are unsigned. Automatic desktop updates are off unless a build explicitly sets both `DAYCREW_ENABLE_AUTO_UPDATE=true` and `T3CODE_DESKTOP_UPDATE_REPOSITORY=kevingsp/daycrew`. `GITHUB_REPOSITORY` does not select an update destination. Review the Daycrew release feed and signing before opting in.

### Windows installer validation

The [Daycrew Windows x64 workflow](../.github/workflows/daycrew-windows.yml) builds on a disposable Windows x64 runner. Its smoke probe installs the NSIS package, reuses a migrated fixture database at the production default path, checks the Start menu and taskbar identity, exercises feed interactions at laptop and ultrawide sizes, closes the window, replaces the installation, launches through the actual shortcut, and uninstalls while checking retained data. Do not run this installer probe against a personal Windows installation: it changes the Daycrew installer registration and shortcuts.

The run artifact includes the installer, SHA-256 digest, screenshots, native payload inventory, and `daycrew-windows-check/verification.json` with completed checks and frame/input samples. Samples come from the hosted runner. Physical-display performance, authenticated cloud sessions, actual GPU inference, live PR integrations and upgrades from a previous installed desktop require separate verification before claiming coverage of those paths.

## Verification baseline

Previous Chromium checks covered feed navigation, inline replies, draft retention, reduced motion, diff opening/closing, keyboard focus restoration, project groups, file counts and thumbnails. The branded web client was rebuilt and its sidebar and browser title were verified. A real Pi agent routed a task through a local test endpoint. Actual GPU inference on the RTX 5090, authenticated cloud runs, a live PR card, and the Windows desktop installer remain to be verified. Earlier source checks reported lint and dependency-analysis findings; run the repository checks before shipping a desktop release.

## Repository publication

The upstream GitHub Actions definitions are preserved under `.github/upstream-workflows/` as inactive references. Review their release targets, permissions and signing secrets before enabling any for Daycrew. The private repository starts from the complete source tree for the pinned upstream revision and the Daycrew changes described above.

At handoff the changed-files check reported formatting, lint and unused-code findings. The type checker could not start a subprocess under this host's sandbox. The tests stopped while loading the mobile Vite configuration. Rerun on the Windows development machine before packaging.
