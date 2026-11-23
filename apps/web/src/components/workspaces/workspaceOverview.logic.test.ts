import { EnvironmentId, IssueTrackerKind, ProjectId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture } from "../../test-fixtures";
import {
  buildWorkspaceRows,
  filterWorkspaceRows,
  workspaceStatus,
} from "./workspaceOverview.logic";

const environmentId = EnvironmentId.make("environment-test");
const projectId = ProjectId.make("project-test");
const projects = [{ environmentId, id: projectId, title: "Daycrew", archivedAt: null }];
const completed = makeThreadFixture({
  latestRun: {
    runId: RunId.make("run-test"),
    status: "completed",
    requestedAt: null,
    startedAt: null,
    completedAt: "2026-11-23T00:00:00Z",
    assistantMessageId: null,
  },
});

describe("workspace overview", () => {
  it("keeps completed work ready for review until explicitly settled", () => {
    expect(workspaceStatus(completed)).toBe("review");
    expect(workspaceStatus({ ...completed, settledOverride: "settled" })).toBe("done");
    expect(workspaceStatus(makeThreadFixture())).toBe("idle");
  });

  it("surfaces new requests and live work even on a settled thread", () => {
    expect(
      workspaceStatus({ ...completed, settledOverride: "settled", hasPendingApprovals: true }),
    ).toBe("attention");
    expect(
      workspaceStatus({
        ...completed,
        settledOverride: "settled",
        blockedOnThreadWait: true,
        runtime: {
          status: "running",
          activeRunId: null,
          providerInstanceId: completed.providerInstanceId,
          providerName: null,
          lastError: null,
          updatedAt: completed.updatedAt,
        },
      }),
    ).toBe("running");
    expect(
      workspaceStatus({ ...completed, latestRun: { ...completed.latestRun!, status: "failed" } }),
    ).toBe("attention");
  });

  it("includes every active project without colliding environment-local ids", () => {
    const remote = EnvironmentId.make("remote");
    const rows = buildWorkspaceRows(
      [
        completed,
        { ...completed, environmentId: remote, title: "Remote work" },
        { ...completed, id: ThreadId.make("archived"), archivedAt: completed.updatedAt },
        { ...completed, id: ThreadId.make("deleted"), deletedAt: completed.updatedAt },
        {
          ...completed,
          id: ThreadId.make("side-chat"),
          lineage: { ...completed.lineage, sideChat: true },
        },
        { ...completed, id: ThreadId.make("orphan"), projectId: ProjectId.make("missing") },
      ],
      [...projects, { ...projects[0]!, environmentId: remote, title: "Remote" }],
    );
    expect(rows.map((row) => row.project.title)).toEqual(["Daycrew", "Remote"]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
    expect(filterWorkspaceRows(rows, rows[1]!.projectKey, "all", "")).toHaveLength(1);
  });

  it("filters linked context and sorts newest within each group", () => {
    const rows = buildWorkspaceRows(
      [
        completed,
        { ...completed, id: ThreadId.make("attention"), hasPendingUserInput: true },
        {
          ...completed,
          id: ThreadId.make("newer"),
          title: "Ship navigation",
          branch: "codex/rail",
          updatedAt: "2026-11-24T00:00:00Z",
          issues: [
            {
              tracker: IssueTrackerKind.make("linear"),
              host: "linear.app",
              scope: "daycrew",
              key: "DC-42",
              projectId,
              displayKey: "DC-42",
              title: "Navigation",
              url: "https://linear.app/daycrew/issue/DC-42",
              source: "manual",
              linkedAt: completed.updatedAt,
            },
          ],
        },
      ],
      projects,
    );
    expect(rows.map((row) => row.thread.id)).toEqual(["attention", "newer", completed.id]);
    expect(filterWorkspaceRows(rows, "", "review", "dc-42").map((row) => row.thread.id)).toEqual([
      "newer",
    ]);
    expect(filterWorkspaceRows(rows, "", "all", "codex/rail")).toHaveLength(1);
    expect(filterWorkspaceRows(rows, "", "all", "daycrew")).toHaveLength(3);
  });
});
