const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function git(cwd, args, env = {}) {
  return execFileSync("git", ["-c", "core.longpaths=true", ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  }).trim();
}

function directory(cwd) {
  return path.join(
    git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    "daycrew-backups",
  );
}

function backupStatuses(cwd) {
  const dir = directory(cwd);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function backup(cwd, { threadId, title = "Daycrew changes", runId } = {}) {
  if (!threadId) throw new Error("A chat ID is required for an automatic backup.");
  if (git(cwd, ["diff", "--name-only", "--diff-filter=U"]))
    throw new Error("Resolve merge conflicts before backing up source. Your edits are preserved.");
  const dir = directory(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const key = createHash("sha256").update(threadId).digest("hex").slice(0, 12);
  const statusPath = path.join(dir, `${key}.json`);
  const previous = fs.existsSync(statusPath)
    ? JSON.parse(fs.readFileSync(statusPath, "utf8"))
    : null;
  const area =
    /\b(ui|backend|windows|macos|mobile|docs|tooling)\b/i.exec(title)?.[1].toLowerCase() ||
    "feature";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36)
      .replace(/-$/, "") || "changes";
  const branch = previous?.branch || `codex/backup-${area}-${slug}-${key.slice(0, 6)}`;
  const ref = `refs/heads/${branch}`;
  const head = git(cwd, ["rev-parse", "HEAD"]);
  const indexDir = fs.mkdtempSync(path.join(dir, "index-"));
  const indexPath = path.join(indexDir, "index");
  const env = { GIT_INDEX_FILE: indexPath };
  let tree;
  try {
    git(cwd, ["read-tree", "HEAD"], env);
    git(cwd, ["add", "--all", "--", "."], env);
    // The private index starts at HEAD, never at the user's partially staged edits.
    const files = git(cwd, ["ls-files", "-z"], env).split("\0").filter(Boolean);
    const privateFiles = files.filter(
      (file) =>
        file.split("/").some((part) => part === ".daycrew-dev" || part === ".t3") ||
        (path.posix.basename(file) !== ".env.example" &&
          /^\.env(?:\.|$)/.test(path.posix.basename(file))),
    );
    for (const file of privateFiles) git(cwd, ["update-index", "--force-remove", "--", file], env);
    tree = git(cwd, ["write-tree"], env);
  } finally {
    for (const name of ["index", "index.lock"])
      fs.rmSync(path.join(indexDir, name), { force: true });
    fs.rmdirSync(indexDir);
  }
  let parent;
  try {
    parent = git(cwd, ["rev-parse", "--verify", ref]);
  } catch {
    parent = null;
  }
  if (
    !parent &&
    tree === git(cwd, ["rev-parse", "HEAD^{tree}"]) &&
    git(cwd, ["rev-list", "--count", "origin/main..HEAD"]) === "0"
  )
    return { noChanges: true };
  const sameTree = parent && tree === git(cwd, ["rev-parse", `${parent}^{tree}`]);
  const commit = sameTree
    ? parent
    : git(cwd, [
        "commit-tree",
        tree,
        "-p",
        head,
        ...(parent && parent !== head ? ["-p", parent] : []),
        "-m",
        `chore(backup): ${title.replace(/[\r\n]/g, " ").slice(0, 120)}\n\nDaycrew chat: ${threadId}\nRun: ${runId || "manual"}`,
      ]);
  if (!sameTree) git(cwd, ["update-ref", ref, commit, parent || "0".repeat(40)]);
  const state = {
    threadId,
    title,
    branch,
    commit,
    pending: true,
    savedAt: new Date().toISOString(),
  };
  const writeStatus = () => {
    const temp = `${statusPath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temp, statusPath);
  };
  writeStatus();
  // A failed upload leaves both a durable Git ref and a pending record for the next attempt.
  git(cwd, ["push", "origin", `${commit}:${ref}`]);
  state.pending = false;
  writeStatus();
  return state;
}

module.exports = { backup, backupStatuses };
