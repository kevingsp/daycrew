import {
  scopeProjectRef,
  scopedProjectKey,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";

import type { Project, ThreadShell } from "../../types";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";

export const workspaceStatuses = ["attention", "running", "review", "idle", "done"] as const;
export type WorkspaceStatus = (typeof workspaceStatuses)[number];
export type WorkspaceFilter = "all" | WorkspaceStatus;
type OverviewProject = Pick<Project, "environmentId" | "id" | "title" | "archivedAt">;

export function workspaceStatus(thread: ThreadShell): WorkspaceStatus {
  const status = resolveSidebarThreadStatus(thread);
  if (["approval", "input", "request"].includes(status)) return "attention";
  if (
    ["preparing", "working"].includes(status) ||
    (status === "waiting" && thread.blockedOnThreadWait)
  )
    return "running";
  if (thread.settledOverride === "settled") return "done";
  if (["limited", "failed"].includes(status) || thread.latestRun?.status === "failed")
    return "attention";
  return thread.latestRun?.status === "completed" ? "review" : "idle";
}

export function workspaceProjectKey(project: Pick<Project, "environmentId" | "id">) {
  return scopedProjectKey(scopeProjectRef(project.environmentId, project.id));
}

export function buildWorkspaceRows(
  threads: readonly ThreadShell[],
  projects: readonly OverviewProject[],
) {
  const byKey = new Map(
    projects
      .filter((project) => project.archivedAt == null)
      .map((project) => [workspaceProjectKey(project), project]),
  );
  return threads
    .flatMap((thread) => {
      const projectKey = scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      const project = byKey.get(projectKey);
      if (
        !project ||
        thread.archivedAt !== null ||
        thread.deletedAt !== null ||
        thread.lineage.sideChat
      )
        return [];
      return [
        {
          key: scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          projectKey,
          project,
          thread,
          status: workspaceStatus(thread),
        },
      ];
    })
    .sort(
      (a, b) =>
        workspaceStatuses.indexOf(a.status) - workspaceStatuses.indexOf(b.status) ||
        b.thread.updatedAt.localeCompare(a.thread.updatedAt),
    );
}

export type WorkspaceRow = ReturnType<typeof buildWorkspaceRows>[number];

export function filterWorkspaceRows(
  rows: readonly WorkspaceRow[],
  projectKey: string,
  status: WorkspaceFilter,
  query: string,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (
      (projectKey && row.projectKey !== projectKey) ||
      (status !== "all" && row.status !== status)
    )
      return false;
    const haystack = [
      row.thread.title,
      row.project.title,
      row.thread.branch,
      ...row.thread.pullRequests.flatMap((pr) =>
        pr.source === "stack-dismissed" ? [] : [pr.repository, `#${pr.number}`, pr.snapshot?.title],
      ),
      ...(row.thread.issues ?? []).flatMap((issue) => [issue.displayKey, issue.title]),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
