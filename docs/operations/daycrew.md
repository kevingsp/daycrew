# Daycrew development and desktop releases

Local Dev runs the source checkout and refreshes as you edit. Installed Windows and Mac apps keep the source packaged in their last release. You can save and integrate many source changes before building another installer.

## Save your work

Daycrew automatically backs up source changes to GitHub after each completed chat reply. The checked-in `afterTurn` hook runs on the host after checkpointing, including when the client is closed. Each chat gets a `codex/backup-<area>-<title>-<id>` branch. These are source snapshots, not production releases: they preserve unfinished edits without changing the checkout's branch, HEAD, staging area, or files. Chats and local credentials stay local.

Uploads retry twice if unavailable. A failed upload keeps a local Git backup and is retried on that chat's next completed reply. **Source & release status** shows each chat's backup branch and pending uploads. Remove `afterTurn` from `t3.json` to disable automatic backups. Worktrees created from an older commit need to sync the updated configuration first.

Start a new task in a worktree from `origin/main`. Name its branch `codex/<area>-<task>-<id>`, using `ui` for shared interface work, `backend` for server work, or `windows`/`macos` for changes specific to that operating system.

Use **Save & push changes** in the project's Actions menu, or run:

```sh
vp run daycrew:save -- --message "feat(ui): improve workspace navigation"
```

This checks, commits, and pushes source to the current branch. A failed check still allows a WIP checkpoint to be saved; fix it before merging into `main`. Edits made directly on `main` are saved on a new checkpoint branch. A repeated save does nothing when the branch is already saved. Chats, local settings, credentials, and Dev data are excluded.

The manual action also runs when a worktree task is settled, once imported from `t3.json`. Agents are instructed to save and push completed source changes. Ordinary task pushes run source checks; automatic backup branches skip CI. Neither builds desktop installers.

## Integrate ready changes

Merge checked task branches into `main` using the existing pull-request workflow. This can happen throughout development, independently of releases. Keep each task's purpose in its branch name and use its `area:*` label for release notes.

Use **Sync Dev from main** after integration, or `vp run daycrew:sync`. It fetches and fast-forwards a clean checkout. It stops if edits or divergent commits need review; it never resets or stashes them. Worktree changes appear in the primary Dev app after they are integrated and synced; a worktree's own Dev action can preview them earlier.

Use **Source & release status** or `vp run daycrew:status` to see local edits and the commits on `main` waiting for the next installer release.

## Publish a batch of changes

When ready, use **Publish Windows + Mac installers** or run:

```sh
vp run daycrew:release
```

This selects the next pilot version and starts **Publish Daycrew desktop** on GitHub from the synced `main` commit. To validate the plan without building anything, use `vp run daycrew:release -- --check`.

The release builds Windows x64 and both Apple Silicon and Intel Mac installers from the same commit. It runs source, installation, upgrade, and launch checks, verifies every checksum, then publishes all downloads together. The Windows upgrade check uses the current published predecessor. Later source commits wait for a subsequent release.

The GitHub workflow also has a manual form with a version and a **publish** checkbox. With that checkbox off, it validates only. The individual Windows/Mac workflows are diagnostic build entry points and do not publish releases.

Published installers remain on the existing private pilot channel. Install the new download to update a production desktop app; saving source does not update an installed app automatically.
