import {
  scopeProjectRef,
  scopedProjectKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { Link, createFileRoute } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  ArrowUpRightIcon,
  CircleDotIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  LayoutGridIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { openCommandPalette } from "../commandPaletteBus";
import { resolveSidebarThreadStatus } from "../components/Sidebar.logic";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { Button, buttonVariants } from "../components/ui/button";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { toastManager } from "../components/ui/toast";
import { isElectron } from "../env";
import { readLastUsedProjectKey, useNewThreadHandler } from "../hooks/useHandleNewThread";
import { cn } from "../lib/utils";
import { workspaceAreaProps } from "../lib/workspaceFocus";
import { useRightPanelStore } from "../rightPanelStore";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useQuietThreadShells,
} from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";

type ThreadShell = ReturnType<typeof useQuietThreadShells>[number];
type WorkspaceStatus = "attention" | "running" | "completed" | "idle";
type WorkspaceFilter = "all" | WorkspaceStatus;

function workspaceStatus(thread: ThreadShell): WorkspaceStatus {
  const status = resolveSidebarThreadStatus(thread);
  switch (status) {
    case "approval":
    case "input":
    case "request":
    case "limited":
    case "failed":
      return "attention";
    case "preparing":
    case "working":
      return "running";
    case "waiting":
      if (thread.blockedOnThreadWait) return "running";
      break;
  }
  if (thread.latestRun?.status === "failed") return "attention";
  return thread.latestRun?.status === "completed" ? "completed" : "idle";
}

const statusOrder: Record<WorkspaceStatus, number> = {
  attention: 0,
  running: 1,
  completed: 2,
  idle: 3,
};

const statusColors: Record<WorkspaceStatus, string> = {
  attention: "bg-amber-500",
  running: "bg-blue-500",
  completed: "bg-emerald-500",
  idle: "bg-muted-foreground/55",
};

function workspaceProjectKey(
  environmentId: ThreadShell["environmentId"],
  projectId: ThreadShell["projectId"],
) {
  return scopedProjectKey(scopeProjectRef(environmentId, projectId));
}

function WorkspaceOverview() {
  const gt = useGT();
  const projects = useProjects().filter((project) => project.archivedAt == null);
  const threads = useQuietThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const newThread = useNewThreadHandler();
  const [projectKey, setProjectKey] = useState(() => readLastUsedProjectKey() ?? "");
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [openingDraft, setOpeningDraft] = useState(false);
  const project =
    projects.find((entry) => workspaceProjectKey(entry.environmentId, entry.id) === projectKey) ??
    projects[0];
  const selectedProjectKey = project ? workspaceProjectKey(project.environmentId, project.id) : "";

  const workspaceRows = threads
    .filter(
      (thread) =>
        project !== undefined &&
        thread.environmentId === project.environmentId &&
        thread.projectId === project.id &&
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        !thread.lineage.sideChat,
    )
    .map((thread) => ({ thread, status: workspaceStatus(thread) }))
    .sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        b.thread.updatedAt.localeCompare(a.thread.updatedAt),
    );
  const counts: Record<WorkspaceFilter, number> = {
    all: workspaceRows.length,
    attention: 0,
    running: 0,
    completed: 0,
    idle: 0,
  };
  for (const { status } of workspaceRows) counts[status]++;
  const filters: ReadonlyArray<{ key: WorkspaceFilter; label: string }> = [
    { key: "all", label: gt("All") },
    { key: "running", label: gt("Running") },
    { key: "attention", label: gt("Needs attention") },
    { key: "completed", label: gt("Completed") },
    { key: "idle", label: gt("Idle") },
  ];
  const statusLabels = {
    attention: gt("Needs attention"),
    running: gt("Running"),
    completed: gt("Completed"),
    idle: gt("Idle"),
  };
  const rows = workspaceRows.filter((row) => filter === "all" || row.status === filter);

  async function openWorkspaceDraft() {
    if (!project) return;
    setOpeningDraft(true);
    try {
      await newThread(scopeProjectRef(project.environmentId, project.id), { envMode: "worktree" });
    } catch {
      toastManager.add({ type: "error", title: gt("Couldn’t open the workspace draft") });
    } finally {
      setOpeningDraft(false);
    }
  }

  return (
    <SidebarInset
      {...workspaceAreaProps("home", 1, gt("Workspaces"))}
      role="main"
      className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      <WorkspacePageHeader electron={isElectron} className="border-b border-border/60">
        <SidebarTrigger className="no-drag shrink-0 md:hidden" />
        <LayoutGridIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          <T>Workspaces</T>
        </span>
      </WorkspacePageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                <T>Project overview</T>
              </h1>
              {project ? (
                <div className="mt-3 w-fit max-w-full">
                  <select
                    aria-label={gt("Project")}
                    className="max-w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    value={selectedProjectKey}
                    onChange={(event) => {
                      setProjectKey(event.target.value);
                      setFilter("all");
                    }}
                  >
                    {projects.map((entry) => (
                      <option
                        key={workspaceProjectKey(entry.environmentId, entry.id)}
                        value={workspaceProjectKey(entry.environmentId, entry.id)}
                      >
                        {projects.some((other) => other !== entry && other.title === entry.title)
                          ? `${entry.title} (${entry.workspaceRoot})`
                          : entry.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {project ? (
              <Button onClick={() => void openWorkspaceDraft()} disabled={openingDraft}>
                <PlusIcon />
                <T>New workspace</T>
              </Button>
            ) : bootstrapped ? (
              <Button onClick={() => openCommandPalette({ open: "add-project" })}>
                <PlusIcon />
                <T>Add project</T>
              </Button>
            ) : null}
          </div>

          {project ? (
            <section className="mt-8" aria-label={gt("Project sessions")}>
              <div
                className="mb-3 flex flex-wrap gap-1.5"
                role="group"
                aria-label={gt("Filter by status")}
              >
                {filters.map(({ key, label }) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filter === key ? "secondary" : "ghost-muted"}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                    <span className="tabular-nums opacity-70">{counts[key]}</span>
                  </Button>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                {rows.length > 0 ? (
                  <ul className="divide-y divide-border/65">
                    {rows.map(({ thread, status }) => {
                      const threadRef = scopeThreadRef(thread.environmentId, thread.id);
                      const params = buildThreadRouteParams(threadRef);
                      const isWorker =
                        thread.lineage.relationshipToParent === "subagent" ||
                        thread.delegatedFrom !== null;
                      const checkout = thread.worktreePath
                        ? gt("Worktree")
                        : gt("Project checkout");
                      const branch = thread.branch ?? checkout;
                      return (
                        <li
                          key={thread.id}
                          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap sm:px-4"
                        >
                          <Link
                            to="/$environmentId/$threadId"
                            params={params}
                            className="group flex min-w-45 flex-1 items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span
                              aria-hidden="true"
                              className={cn("size-2 shrink-0 rounded-full", statusColors[status])}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {thread.title}
                              </span>
                              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                <GitBranchIcon aria-hidden="true" className="size-3.5 shrink-0" />
                                <span className="truncate" title={thread.worktreePath ?? undefined}>
                                  {branch}
                                </span>
                                {isWorker ? (
                                  <span className="shrink-0">
                                    · <T>Worker</T>
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <ArrowUpRightIcon
                              aria-hidden="true"
                              className="size-3.5 shrink-0 text-muted-foreground"
                            />
                          </Link>
                          <span className="ml-2 rounded-md bg-muted/70 px-2 py-1 text-xs text-muted-foreground sm:ml-0">
                            {statusLabels[status]}
                          </span>
                          <Link
                            to="/$environmentId/$threadId"
                            params={params}
                            aria-label={gt("View changes for {thread}", { thread: thread.title })}
                            onClick={(event) => {
                              if (
                                !event.defaultPrevented &&
                                event.button === 0 &&
                                !event.metaKey &&
                                !event.ctrlKey &&
                                !event.shiftKey &&
                                !event.altKey
                              ) {
                                useRightPanelStore.getState().open(threadRef, "diff");
                              }
                            }}
                            className={buttonVariants({ size: "sm", variant: "ghost-muted" })}
                          >
                            <GitCompareArrowsIcon aria-hidden="true" />
                            <T>Changes</T>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="px-6 py-12 text-center">
                    <CircleDotIcon
                      aria-hidden="true"
                      className="mx-auto mb-3 size-5 text-muted-foreground"
                    />
                    <p className="text-sm font-medium">
                      {workspaceRows.length === 0
                        ? gt("No workspaces yet")
                        : gt("No sessions match this status")}
                    </p>
                    {workspaceRows.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        <T>Start a new workspace to give a coding task its own Git worktree.</T>
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              {bootstrapped
                ? gt("Add a Git repository to see its coding sessions here.")
                : gt("Loading projects…")}
            </p>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/workspaces")({
  component: WorkspaceOverview,
});
