const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { save, sync } = require("./daycrew-dev.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daycrew-save-test-"));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith("daycrew-save-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const cwd = path.join(root, "source"),
    remote = path.join(root, "remote.git");
  fs.mkdirSync(cwd);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--bare", "--initial-branch=main", remote);
  git("init", "--initial-branch=main");
  git("config", "user.name", "Daycrew Test");
  git("config", "user.email", "test@example.com");
  git("remote", "add", "origin", remote);
  fs.writeFileSync(path.join(cwd, ".gitignore"), ".daycrew-dev/\n.env\n");
  fs.writeFileSync(path.join(cwd, "README.md"), "Daycrew fixture\n");
  git("add", ".");
  git("commit", "-m", "baseline");
  git("push", "-u", "origin", "main");
  return { cwd, git, baseline: git("rev-parse", "HEAD") };
}

test("save pushes all source edits on a separate branch while keeping chats and credentials local", (t) => {
  const { cwd, git, baseline } = fixture(t);
  fs.mkdirSync(path.join(cwd, ".daycrew-dev"));
  fs.writeFileSync(path.join(cwd, ".daycrew-dev/statev2.sqlite"), "private chats");
  fs.writeFileSync(path.join(cwd, ".env"), "PRIVATE_VALUE=local\n");
  fs.writeFileSync(path.join(cwd, "README.md"), "Updated workspace\n");
  fs.writeFileSync(path.join(cwd, "ui.js"), "export const ready = true;\n");
  let checked = 0;
  const result = save(cwd, {
    message: "feat(ui): update workspace",
    check: () => {
      checked++;
      return true;
    },
  });
  assert.match(result.branch, /^codex\/feature-dev-checkpoint-[a-f0-9]{6}$/);
  assert.equal(checked, 1);
  assert.equal(git("rev-parse", "origin/main"), baseline);
  assert.equal(git("rev-parse", `origin/${result.branch}`), result.commit);
  assert.deepEqual(git("ls-tree", "--name-only", result.commit).split("\n"), [
    ".gitignore",
    "README.md",
    "ui.js",
  ]);
  assert.equal(
    fs.readFileSync(path.join(cwd, ".daycrew-dev/statev2.sqlite"), "utf8"),
    "private chats",
  );
  assert.equal(git("status", "--porcelain"), "");
});

test("failed checks still preserve a WIP source checkpoint without changing main", (t) => {
  const { cwd, git, baseline } = fixture(t);
  git("switch", "-c", "codex/ui-unfinished-a1b2");
  fs.writeFileSync(path.join(cwd, "work.js"), "unfinished work\n");
  const result = save(cwd, { check: () => false });
  assert.equal(result.checksPassed, false);
  assert.equal(git("rev-parse", "origin/main"), baseline);
  assert.equal(git("rev-parse", "origin/codex/ui-unfinished-a1b2"), result.commit);
});

test("save refuses force-staged chat data before changing the branch or committing", (t) => {
  const { cwd, git, baseline } = fixture(t);
  fs.mkdirSync(path.join(cwd, ".daycrew-dev"));
  fs.writeFileSync(path.join(cwd, ".daycrew-dev/statev2.sqlite"), "private chats");
  git("add", "--force", ".daycrew-dev/statev2.sqlite");
  assert.throws(() => save(cwd, { check: () => true }), /Local data or credentials/);
  assert.equal(git("branch", "--show-current"), "main");
  assert.equal(git("rev-parse", "HEAD"), baseline);
});

test("repeating save after a successful push creates no extra commit", (t) => {
  const { cwd, git } = fixture(t);
  git("switch", "-c", "codex/backend-saved-a1b2");
  fs.writeFileSync(path.join(cwd, "work.js"), "saved work\n");
  const first = save(cwd, { check: () => true });
  const second = save(cwd, {
    check: () => {
      throw new Error("No changes need checking");
    },
  });
  assert.equal(second.alreadySaved, true);
  assert.equal(second.commit, first.commit);
});

test("save stops if another task switches the shared checkout during checks", (t) => {
  const { cwd, git, baseline } = fixture(t);
  fs.writeFileSync(path.join(cwd, "work.js"), "Keep this work\n");
  assert.throws(
    () =>
      save(cwd, {
        check: () => {
          git("switch", "-c", "codex/ui-another-task-a1b2");
          return true;
        },
      }),
    /checkout changed/,
  );
  assert.equal(git("rev-parse", "HEAD"), baseline);
  assert.equal(fs.readFileSync(path.join(cwd, "work.js"), "utf8"), "Keep this work\n");
});

test("sync refuses local edits and divergent commits without changing either", (t) => {
  const { cwd, git, baseline } = fixture(t);
  fs.writeFileSync(path.join(cwd, "README.md"), "Keep this edit\n");
  assert.throws(() => sync(cwd), /Save your local changes first/);
  assert.equal(fs.readFileSync(path.join(cwd, "README.md"), "utf8"), "Keep this edit\n");
  git("add", ".");
  git("commit", "-m", "local only");
  const local = git("rev-parse", "HEAD");
  git("switch", "--detach", baseline);
  fs.writeFileSync(path.join(cwd, "remote.js"), "remote work\n");
  git("add", ".");
  git("commit", "-m", "remote only");
  git("push", "origin", "HEAD:main");
  git("switch", "main");
  assert.throws(() => sync(cwd));
  assert.equal(git("rev-parse", "HEAD"), local);
});
