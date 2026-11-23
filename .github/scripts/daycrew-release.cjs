const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const versionPattern = /^(\d+)\.(\d+)\.(\d+)-daycrew\.(\d+)$/;
function parseVersion(version) {
  const match = versionPattern.exec(version);
  assert(match && match[0] === version, "Use a Daycrew version such as 0.1.11-daycrew.7");
  return match.slice(1).map(Number);
}
function compareVersions(a, b) {
  const left = parseVersion(a),
    right = parseVersion(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}
function nextVersion(version) {
  const [major, minor, patch, pilot] = parseVersion(version);
  return `${major}.${minor}.${patch}-daycrew.${pilot + 1}`;
}
function latestRelease(releases) {
  const released = releases.filter((r) => !r.draft && versionPattern.test(r.tag_name?.slice(1)));
  released.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
  assert(released.length, "No published Daycrew predecessor was found");
  return released[0];
}
function planRelease({ version, sha, ref, releases }) {
  assert.equal(ref, "refs/heads/main", "Desktop releases must start from main");
  assert.match(sha, /^[a-f0-9]{40}$/, "A full source commit is required");
  parseVersion(version);
  const previous = latestRelease(releases);
  const previousVersion = previous.tag_name.slice(1);
  assert(
    compareVersions(version, previousVersion) > 0,
    "Choose a version newer than the published desktop",
  );
  const existing = releases.find((r) => r.tag_name === `v${version}`);
  if (existing) {
    assert(existing.draft, "This version is already published");
    assert.equal(
      existing.target_commitish,
      sha,
      "The existing draft belongs to another source commit",
    );
  }
  const installer = previous.assets.find(
    (a) => a.name === `Daycrew-${previousVersion}-Windows-x64.exe`,
  );
  assert.match(
    installer?.digest ?? "",
    /^sha256:[a-f0-9]{64}$/,
    "The predecessor installer needs a verified SHA-256 digest",
  );
  return { version, sha, previousVersion, previousSha256: installer.digest.slice(7) };
}
function hash(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function verifyArtifacts(root, plan) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  walk(root);
  function find(name) {
    const matches = files.filter((file) => path.basename(file) === name);
    assert.equal(matches.length, 1, `Expected exactly one ${name}`);
    return matches[0];
  }
  const installers = ["Windows-x64.exe", "arm64.dmg", "x64.dmg"].map((suffix) => {
    const name = `Daycrew-${plan.version}-${suffix}`;
    const file = find(name),
      checksum = find(`${name}.sha256`);
    const [expected, filename] = fs.readFileSync(checksum, "utf8").trim().split(/\s+/);
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(filename?.replace(/^\*/, ""), name, "Checksum filename mismatch");
    assert.equal(hash(file), expected, `Installer checksum mismatch: ${name}`);
    return { name, file, checksum, sha256: expected };
  });
  const reportFile = find("verification.json");
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  assert.equal(report.version, plan.version);
  assert.equal(report.upgradedFrom, plan.previousVersion);
  assert.equal(report.platform, "win32");
  assert.equal(report.arch, "x64");
  assert.equal(report.sha256, installers[0].sha256);
  assert(report.checks.includes("published predecessor launched and opened populated profile"));
  assert.equal(report.checks.at(-1), "uninstall removes app and preserves user data");
  assert.deepEqual(
    report.timing.map((sample) => sample.width).sort((a, b) => a - b),
    [1366, 3440],
  );
  return {
    installers,
    evidence: [reportFile, find("payload-files.txt")],
    authenticode: report.authenticode,
  };
}
function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}
function repositoryReleases(repo) {
  return JSON.parse(gh("api", `repos/${repo}/releases?per_page=100`));
}
function prepare() {
  const plan = planRelease({
    version: process.env.DAYCREW_VERSION,
    sha: process.env.GITHUB_SHA,
    ref: process.env.GITHUB_REF,
    releases: repositoryReleases(process.env.GH_REPO),
  });
  const values = {
    version: plan.version,
    previous_version: plan.previousVersion,
    previous_sha256: plan.previousSha256,
  };
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Daycrew ${plan.version}\n\nSource: \`${plan.sha}\`\n\nWindows upgrade check: ${plan.previousVersion}.\n\n${process.env.PUBLISH_INSTALLERS === "true" ? "Building and verifying all three installers before publication." : "Validation only. No installers will be built or published."}\n`,
  );
  console.log(JSON.stringify(plan, null, 2));
}
function publish() {
  const repo = process.env.GH_REPO;
  const plan = {
    version: process.env.DAYCREW_VERSION,
    sha: process.env.GITHUB_SHA,
    previousVersion: process.env.DAYCREW_PREVIOUS_VERSION,
  };
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  parseVersion(plan.version);
  parseVersion(plan.previousVersion);
  assert.match(plan.sha, /^[a-f0-9]{40}$/);
  const artifacts = verifyArtifacts("release", plan);
  const tag = `v${plan.version}`;
  let existing = repositoryReleases(repo).find((r) => r.tag_name === tag);
  if (existing) assert.equal(existing.target_commitish, plan.sha, "Release source mismatch");
  if (!existing) {
    const notes = path.join("release", "release-notes.md");
    fs.writeFileSync(
      notes,
      `Windows x64, Apple Silicon Mac, and Intel Mac installers from source \`${plan.sha}\`.\n\n[Installer, upgrade, and launch verification](https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}). SHA-256 files and the Windows verification report are attached.\n\nWindows Authenticode status: \`${artifacts.authenticode}\`.\n\nQuit Daycrew before installing. Existing workspace data is retained. These builds follow the existing private pilot release channel.\n\n`,
    );
    gh(
      "release",
      "create",
      tag,
      "--repo",
      repo,
      "--draft",
      "--prerelease",
      "--target",
      plan.sha,
      "--title",
      `Daycrew Desktop · Pilot ${parseVersion(plan.version)[3]}`,
      "--generate-notes",
      "--notes-start-tag",
      `v${plan.previousVersion}`,
      "--notes-file",
      notes,
    );
    existing = { draft: true };
  }
  if (existing.draft) {
    gh(
      "release",
      "upload",
      tag,
      "--repo",
      repo,
      ...artifacts.installers.flatMap((i) => [i.file, i.checksum]),
      ...artifacts.evidence,
      "--clobber",
    );
    gh("release", "edit", tag, "--repo", repo, "--draft=false", "--prerelease");
  }
  const downloaded = fs.mkdtempSync(path.join(os.tmpdir(), "daycrew-published-check-"));
  gh("release", "download", tag, "--repo", repo, "--dir", downloaded);
  const published = verifyArtifacts(downloaded, plan);
  assert.deepEqual(
    published.installers.map((i) => i.sha256),
    artifacts.installers.map((i) => i.sha256),
  );
  const release = JSON.parse(
    gh("release", "view", tag, "--repo", repo, "--json", "isDraft,url,targetCommitish"),
  );
  assert.equal(release.isDraft, false);
  assert.equal(release.targetCommitish, plan.sha);
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Published ${plan.version}\n\n${release.url}\n\nAll three published downloads match their verified build checksums.\n`,
  );
  console.log(release.url);
}

module.exports = { nextVersion, latestRelease, planRelease, verifyArtifacts };
if (require.main === module) {
  try {
    if (process.argv[2] === "prepare") prepare();
    else if (process.argv[2] === "publish") publish();
    else throw new Error("Use prepare or publish");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
