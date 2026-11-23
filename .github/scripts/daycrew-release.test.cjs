const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  nextVersion,
  latestRelease,
  planRelease,
  verifyArtifacts,
} = require("./daycrew-release.cjs");

const sha = "a".repeat(40);
const predecessor = {
  tag_name: "v0.1.11-daycrew.6",
  draft: false,
  assets: [
    { name: "Daycrew-0.1.11-daycrew.6-Windows-x64.exe", digest: `sha256:${"b".repeat(64)}` },
  ],
};
const planInput = {
  version: "0.1.11-daycrew.7",
  sha,
  ref: "refs/heads/main",
  releases: [predecessor],
};

test("release versions follow the published pilot, excluding drafts and unrelated tags", () => {
  assert.equal(nextVersion("0.1.11-daycrew.9"), "0.1.11-daycrew.10");
  assert.equal(
    latestRelease([
      { ...predecessor, tag_name: "v0.1.11-daycrew.10" },
      predecessor,
      { tag_name: "v99.0.0" },
      { ...predecessor, tag_name: "v0.1.11-daycrew.20", draft: true },
    ]).tag_name,
    "v0.1.11-daycrew.10",
  );
  assert.equal(planRelease(planInput).previousSha256, "b".repeat(64));
});

test("release planning rejects non-main, reused versions, missing upgrade digests and mismatched drafts", () => {
  assert.throws(() => planRelease({ ...planInput, ref: "refs/heads/codex/ui-work-a1b2" }), /main/);
  assert.throws(() => planRelease({ ...planInput, version: "0.1.11-daycrew.6" }), /newer/);
  assert.throws(
    () => planRelease({ ...planInput, version: "0.1.11-daycrew.7\n" }),
    /Use a Daycrew version/,
  );
  assert.throws(
    () => planRelease({ ...planInput, releases: [{ ...predecessor, assets: [] }] }),
    /digest/,
  );
  assert.throws(
    () =>
      planRelease({
        ...planInput,
        releases: [
          predecessor,
          { tag_name: "v0.1.11-daycrew.7", draft: true, target_commitish: "c".repeat(40) },
        ],
      }),
    /another source/,
  );
});

function artifacts(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daycrew-artifact-test-"));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith("daycrew-artifact-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const plan = planRelease(planInput);
  const installers = ["Windows-x64.exe", "arm64.dmg", "x64.dmg"].map((suffix) => {
    const name = `Daycrew-${plan.version}-${suffix}`,
      file = path.join(root, name),
      contents = `fixture ${suffix}`;
    fs.writeFileSync(file, contents);
    const digest = createHash("sha256").update(contents).digest("hex");
    fs.writeFileSync(`${file}.sha256`, `${digest}  ${name}\n`);
    return { file, digest };
  });
  const report = {
    version: plan.version,
    upgradedFrom: plan.previousVersion,
    platform: "win32",
    arch: "x64",
    sha256: installers[0].digest,
    checks: [
      "published predecessor launched and opened populated profile",
      "uninstall removes app and preserves user data",
    ],
    timing: [{ width: 1366 }, { width: 3440 }],
  };
  fs.writeFileSync(path.join(root, "verification.json"), JSON.stringify(report));
  fs.writeFileSync(path.join(root, "payload-files.txt"), "fixture\n");
  return { root, plan, installers, report };
}

test("publication accepts all three verified installers and a matching upgrade report", (t) => {
  const { root, plan } = artifacts(t);
  assert.equal(verifyArtifacts(root, plan).installers.length, 3);
});
test("publication rejects a missing Mac architecture", (t) => {
  const { root, plan, installers } = artifacts(t);
  fs.unlinkSync(installers[2].file);
  assert.throws(() => verifyArtifacts(root, plan), /x64.dmg/);
});
test("publication rejects modified installers", (t) => {
  const { root, plan, installers } = artifacts(t);
  fs.appendFileSync(installers[1].file, "changed");
  assert.throws(() => verifyArtifacts(root, plan), /checksum mismatch/);
});
test("publication rejects an upgrade report from another predecessor", (t) => {
  const { root, plan, report } = artifacts(t);
  fs.writeFileSync(
    path.join(root, "verification.json"),
    JSON.stringify({ ...report, upgradedFrom: "0.1.11-daycrew.5" }),
  );
  assert.throws(() => verifyArtifacts(root, plan));
});
