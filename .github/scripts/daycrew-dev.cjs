const { execFileSync, spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const { nextVersion, latestRelease } = require("./daycrew-release.cjs");
const { backup, backupStatuses } = require("./daycrew-backup.cjs");

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "core.longpaths=true", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

function gh(cwd, ...args) {
  return execFileSync("gh", args, { cwd, encoding: "utf8" }).trim();
}

function checkChanges(cwd) {
  return (
    spawnSync(
      process.execPath,
      [
        path.join(cwd, "node_modules/vite-plus/bin/vp"),
        "run",
        "check:changed",
        "origin/main",
        "--concurrency",
        "1",
      ],
      { cwd, stdio: "inherit" },
    ).status === 0
  );
}

function assertSourceOnly(cwd) {
  const staged = git(cwd, "diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean);
  const privateFiles = staged.filter((file) => {
    const name = path.posix.basename(file);
    return (
      file.split("/").some((part) => part === ".daycrew-dev" || part === ".t3") ||
      (name !== ".env.example" && (name === ".env" || name.startsWith(".env.")))
    );
  });
  if (privateFiles.length)
    throw new Error(
      "Local data or credentials are staged. Unstage those files before saving source.",
    );
}

function save(cwd, { message, check = checkChanges } = {}) {
  const branch = git(cwd, "branch", "--show-current");
  if (!branch) throw new Error("Create a task branch before saving a detached checkout.");
  if (git(cwd, "diff", "--name-only", "--diff-filter=U")) {
    throw new Error("Resolve the merge conflicts before saving. Your files are unchanged.");
  }
  assertSourceOnly(cwd);
  git(cwd, "fetch", "--no-tags", "origin");
  const dirty = Boolean(git(cwd, "status", "--porcelain=v1", "-uall"));
  const head = git(cwd, "rev-parse", "HEAD");
  const remote = git(cwd, "ls-remote", "--heads", "origin", `refs/heads/${branch}`).split(/\s/)[0];
  if (!dirty && (remote === head || git(cwd, "rev-list", "--count", "origin/main..HEAD") === "0")) {
    return { branch, commit: head, alreadySaved: true };
  }
  let savedBranch = branch;
  if (branch === "main") {
    savedBranch = `codex/feature-dev-checkpoint-${randomBytes(3).toString("hex")}`;
    git(cwd, "switch", "-c", savedBranch);
  }
  const checksPassed = check(cwd);
  if (
    git(cwd, "branch", "--show-current") !== savedBranch ||
    git(cwd, "rev-parse", "HEAD") !== head
  ) {
    throw new Error(
      "The checkout changed while checks ran. Your edits are preserved; retry Save on the intended branch.",
    );
  }
  if (dirty) {
    git(cwd, "add", "--all");
    assertSourceOnly(cwd);
    git(cwd, "commit", "-m", message || `chore(dev): save ${savedBranch.replace(/^codex\//, "")}`);
  }
  git(cwd, "push", "--set-upstream", "origin", `HEAD:refs/heads/${savedBranch}`);
  return {
    branch: savedBranch,
    commit: git(cwd, "rev-parse", "HEAD"),
    checksPassed,
    alreadySaved: false,
  };
}

function sync(cwd) {
  if (git(cwd, "status", "--porcelain=v1", "-uall")) {
    throw new Error("Save your local changes first. Sync never resets or stashes your edits.");
  }
  git(cwd, "fetch", "--no-tags", "origin");
  git(cwd, "merge", "--ff-only", "origin/main");
  return git(cwd, "rev-parse", "HEAD");
}

function repository(cwd) {
  return JSON.parse(gh(cwd, "repo", "view", "--json", "nameWithOwner")).nameWithOwner;
}

function releases(cwd, repo) {
  return JSON.parse(gh(cwd, "api", `repos/${repo}/releases?per_page=100`));
}

function status(cwd) {
  git(cwd, "fetch", "--no-tags", "origin");
  const repo = repository(cwd);
  const released = latestRelease(releases(cwd, repo));
  console.log(`Repository: ${repo}\nBranch: ${git(cwd, "branch", "--show-current")}`);
  console.log(`Local changes:\n${git(cwd, "status", "--short") || "Clean"}`);
  console.log(`Published desktop: ${released.tag_name}\n${released.html_url}`);
  for (const saved of backupStatuses(cwd)) {
    console.log(
      `${saved.pending ? "Upload pending (saved locally)" : "Backed up on GitHub"}: ${saved.title}\n  ${saved.branch} (${saved.commit.slice(0, 8)})`,
    );
  }
  if (/^[a-f0-9]{40}$/.test(released.target_commitish)) {
    const commits = git(cwd, "log", "--oneline", `${released.target_commitish}..origin/main`);
    console.log(`Source waiting for the next desktop release:\n${commits || "None"}`);
  }
  console.log("Saving source does not rebuild or publish desktop apps.");
}

function release(cwd, { version, validateOnly = false } = {}) {
  if (git(cwd, "status", "--porcelain=v1", "-uall"))
    throw new Error("Save and integrate your local changes first.");
  git(cwd, "fetch", "--no-tags", "origin");
  if (git(cwd, "rev-parse", "HEAD") !== git(cwd, "rev-parse", "origin/main")) {
    throw new Error("Integrate your task branches into main and sync Dev before releasing.");
  }
  const repo = repository(cwd);
  const published = latestRelease(releases(cwd, repo));
  const selectedVersion = version || nextVersion(published.tag_name.slice(1));
  gh(
    cwd,
    "workflow",
    "run",
    "daycrew-release.yml",
    "--repo",
    repo,
    "--ref",
    "main",
    "-f",
    `version=${selectedVersion}`,
    "-F",
    `publish=${!validateOnly}`,
  );
  console.log(
    `${validateOnly ? "Validating" : "Building and publishing"} ${selectedVersion} from main.`,
  );
  console.log(`https://github.com/${repo}/actions/workflows/daycrew-release.yml`);
}

function main(args = process.argv.slice(2)) {
  const cwd = git(process.cwd(), "rev-parse", "--show-toplevel");
  const [command, ...options] = args;
  const messageIndex = options.indexOf("--message");
  if (command === "backup") {
    const result = backup(cwd, {
      threadId: process.env.T3CODE_THREAD_ID,
      title: process.env.T3CODE_THREAD_TITLE,
      runId: process.env.T3CODE_RUN_ID,
    });
    console.log(
      result.noChanges
        ? "No new source changes to back up."
        : `Backed up on GitHub: ${result.branch} (${result.commit.slice(0, 8)})`,
    );
  } else if (command === "save") {
    const result = save(cwd, { message: messageIndex < 0 ? undefined : options[messageIndex + 1] });
    console.log(
      `${result.alreadySaved ? "Already saved" : "Saved and pushed"}: ${result.branch} (${result.commit.slice(0, 8)})`,
    );
    if (result.checksPassed === false)
      console.log("WIP checkpoint saved. Fix the reported checks before integrating into main.");
  } else if (command === "sync") console.log(`Dev synced to main: ${sync(cwd)}`);
  else if (command === "status") status(cwd);
  else if (command === "release")
    release(cwd, {
      version: options.find((arg) => !arg.startsWith("--")),
      validateOnly: options.includes("--check"),
    });
  else throw new Error("Use save, status, sync, or release [version] [--check].");
}

module.exports = { save, sync };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
