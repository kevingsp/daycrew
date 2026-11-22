See AGENTS-SETUP.txt for Daycrew, Codex, Muse, Grok, Gemini Neon and Inkling.

Daycrew
==================

Portable Windows x64 build based on T3 Code v0.1.11
Upstream source: https://github.com/pingdotgg/t3code/tree/v0.1.11

1. Extract the entire ZIP using Extract All. Keep the extracted files together.
2. Open Start-Daycrew.cmd. Daycrew opens in your default browser.
   If it doesn't open automatically, use the pairing URL printed in the window.
3. Click Workspaces in the sidebar. Add a local Git repository or pick one
   you've already added.
4. Click New workspace, choose your agent, and send a prompt. Daycrew will
   create the worktree when you send. Repeat for independent tasks.
5. Select Agent feed in the sidebar. Each card follows a task. Use Replies
   to respond in place, Review request for decisions, or Review diff to inspect changes.
6. To ask Claude to review the selected patch, open Review diff and choose
   Review with Claude. Typing @Claude in a card reply opens the same review flow.
   This requires a configured Claude Code provider and a complete diff.
7. Panel and message transitions respect reduced motion. Adjust the panel
   animation duration in Settings to change the timing.

Keep the launcher window open while using the app. Press Ctrl+C in that
window to stop it. Git for Windows and a locally installed, signed-in
agent such as Codex are required to run coding tasks.

The app listens only on this computer at 127.0.0.1:47831. Its projects
and sessions are stored in %LOCALAPPDATA%\T3CodeWorkspaces, separately from
a standard T3 Code installation. Your Git repositories stay where they are.
The app defaults to Light. You can change it under Settings > Appearance.

The distribution includes T3 Code's official Windows x64 runtime and
a modified web client. The runtime version is pinned. The included
source-changes.patch applies to tag v0.1.11. The third-party license
inventory is in client/third-party-licenses.json.
