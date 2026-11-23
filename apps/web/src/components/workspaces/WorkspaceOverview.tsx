import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  CircleDotIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  LayoutGridIcon,
  PlusIcon,
  TicketIcon,
} from "lucide-react";
import { useState } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SidebarInset, SidebarTrigger } from "../ui/sidebar";
import { toastManager } from "../ui/toast";
import { WorkspaceResources } from "./WorkspaceResources";
import {
  buildWorkspaceRows,
  filterWorkspaceRows,
  workspaceProjectKey,
  workspaceStatuses,
  type WorkspaceFilter,
  type WorkspaceRow,
  type WorkspaceStatus,
} from "./workspaceOverview.logic";
import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { cn } from "../../lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useRightPanelStore } from "../../rightPanelStore";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useQuietThreadShells,
} from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useOlderSettledShelf, useOlderSettledShelfGrowth } from "../../state/olderSettledShelf";

const statusColors: Record<WorkspaceStatus, string> = {
  attention: "bg-warning",
  running: "bg-info",
  review: "bg-success",
  idle: "bg-muted-foreground/55",
  done: "bg-muted-foreground/55",
};

function WorkspaceSessionRow({
  row,
  onProject,
}: {
  readonly row: WorkspaceRow;
  readonly onProject: (key: string) => void;
}) {
  const gt = useGT();
  const { thread, project, status } = row;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const params = buildThreadRouteParams(threadRef);
  const chip =
    "inline-flex max-w-48 min-w-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none";
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <span
        aria-hidden="true"
        className={cn("mt-2 size-1.5 shrink-0 rounded-full", statusColors[status])}
      />
      <div className="min-w-0 flex-1">
        <Link
          to="/$environmentId/$threadId"
          params={params}
          className="block truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {thread.title}
        </Link>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" className={chip} onClick={() => onProject(row.projectKey)}>
            <span className="truncate">{project.title}</span>
          </button>
          {thread.branch && (
            <Link to="/$environmentId/$threadId" params={params} className={chip}>
              <GitBranchIcon aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{thread.branch}</span>
            </Link>
          )}
          {thread.pullRequests
            .filter((pr) => pr.source !== "stack-dismissed")
            .map((pr) => (
              <a
                key={`${pr.host}/${pr.repository}/${pr.number}`}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className={chip}
                aria-label={[`${pr.repository} #${pr.number}`, pr.snapshot?.title]
                  .filter(Boolean)
                  .join(": ")}
              >
                <PullRequestGlyph.pullRequest aria-hidden="true" className="size-3 shrink-0" />#
                {pr.number}
                <ArrowUpRightIcon aria-hidden="true" className="size-3" />
              </a>
            ))}
          {(thread.issues ?? []).map((issue) => (
            <a
              key={`${issue.tracker}/${issue.host}/${issue.scope}/${issue.key}`}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className={chip}
              aria-label={`${issue.displayKey}: ${issue.title}`}
            >
              <TicketIcon aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{issue.displayKey}</span>
              <ArrowUpRightIcon aria-hidden="true" className="size-3 shrink-0" />
            </a>
          ))}
          {(thread.lineage.relationshipToParent === "subagent" ||
            thread.delegatedFrom !== null) && (
            <span className="text-xs text-muted-foreground">
              <T>Worker</T>
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 sm:self-center">
        <Button
          size="sm"
          variant="ghost-muted"
          render={<Link to="/$environmentId/$threadId" params={params} />}
          aria-label={gt("View changes for {thread}", { thread: thread.title })}
          onClick={(event) => {
            if (
              !event.defaultPrevented &&
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            )
              useRightPanelStore.getState().open(threadRef, "diff");
          }}
        >
          <GitCompareArrowsIcon aria-hidden="true" />
          <T>Changes</T>
        </Button>
      </div>
    </li>
  );
}

export function WorkspaceOverview() {
  const gt = useGT();
  const projects = useProjects().filter((project) => project.archivedAt == null);
  const threads = useQuietThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const newThread = useNewThreadHandler();
  const [projectKey, setProjectKey] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<WorkspaceStatus>>(() => new Set(["done"]));
  const [openingDraft, setOpeningDraft] = useState(false);
  const [visibleDone, setVisibleDone] = useState(50);
  const selectedProject = projects.find((project) => workspaceProjectKey(project) === projectKey);
  const selectedProjectKey = selectedProject ? projectKey : "";
  const scopedProjects = selectedProject ? [selectedProject] : projects;
  const doneShelf = useOlderSettledShelf({
    scopes: [...new Set(scopedProjects.map((project) => project.environmentId))].map(
      (environmentId) => ({
        environmentId,
        projectIds: scopedProjects
          .filter((project) => project.environmentId === environmentId)
          .map((project) => project.id),
      }),
    ),
    expanded: (filter === "all" || filter === "done") && !collapsed.has("done"),
    visibleCount: visibleDone,
  });
  const allRows = buildWorkspaceRows(threads, projects);
  const scopeRows = filterWorkspaceRows(allRows, selectedProjectKey, "all", query);
  const scopedThreads = filterWorkspaceRows(allRows, selectedProjectKey, "all", "").map(
    (row) => row.thread,
  );
  const listedDone = scopedThreads.filter(
    (thread) => thread.settledOverride === "settled" && doneShelf.isListed(thread),
  );
  useOlderSettledShelfGrowth(doneShelf, listedDone);
  const counts: Record<WorkspaceFilter, number> = {
    all: scopeRows.length,
    attention: 0,
    running: 0,
    review: 0,
    idle: 0,
    done: 0,
  };
  for (const { status } of scopeRows) counts[status]++;
  const unloadedDone = doneShelf.unloadedCount(scopedThreads);
  if (!query.trim()) {
    counts.done += unloadedDone;
    counts.all += unloadedDone;
  }
  const labels: Record<WorkspaceFilter, string> = {
    all: gt("All"),
    attention: gt("Needs you"),
    running: gt("Running"),
    review: gt("Ready to review"),
    idle: gt("Idle"),
    done: gt("Done"),
  };
  const rows = scopeRows.filter((row) => filter === "all" || row.status === filter);

  function selectStatus(status: WorkspaceFilter) {
    setFilter(status);
    if (status !== "all")
      setCollapsed((current) => new Set([...current].filter((entry) => entry !== status)));
  }

  async function openWorkspaceDraft(project: (typeof projects)[number]) {
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
      data-sky-surface="workspaces"
      role="main"
      className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <WorkspacePageHeader
        electron={isElectron}
        data-workspace-topbar=""
        className="border-b border-border/50"
      >
        <SidebarTrigger className="shrink-0 md:hidden" />
        <LayoutGridIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          <T>Workspaces</T>
        </span>
      </WorkspacePageHeader>
      <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
        <div
          data-workspace-content=""
          className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 data-workspace-title="">
                <T>Overview</T>
              </h1>
              <p data-sky-caption="" className="mt-2 text-sm">
                <T>Your work, across projects.</T>
              </p>
            </div>
            {projects.length > 0 ? (
              selectedProject || projects.length === 1 ? (
                <Button
                  disabled={openingDraft}
                  onClick={() => void openWorkspaceDraft(selectedProject ?? projects[0]!)}
                >
                  <PlusIcon />
                  <T>New workspace</T>
                </Button>
              ) : (
                <Menu>
                  <MenuTrigger render={<Button disabled={openingDraft} />}>
                    <PlusIcon />
                    <T>New workspace</T>
                    <ChevronDownIcon />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    {projects.map((project) => (
                      <MenuItem
                        key={workspaceProjectKey(project)}
                        onClick={() => void openWorkspaceDraft(project)}
                      >
                        {project.title}
                        <span className="ml-2 max-w-64 truncate text-xs text-muted-foreground">
                          {project.workspaceRoot}
                        </span>
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
              )
            ) : (
              bootstrapped && (
                <Button onClick={() => openCommandPalette({ open: "add-project" })}>
                  <PlusIcon />
                  <T>Add project</T>
                </Button>
              )
            )}
          </div>
          <WorkspaceResources />
          <section className="mt-6" aria-label={gt("Sessions")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <select
                aria-label={gt("Project")}
                className="h-9 max-w-full rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-xs/5 outline-none transition-colors duration-150 hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none sm:h-8 sm:text-sm"
                value={selectedProjectKey}
                onChange={(event) => setProjectKey(event.target.value)}
              >
                <option value="">{gt("All projects")}</option>
                {projects.map((project) => (
                  <option key={workspaceProjectKey(project)} value={workspaceProjectKey(project)}>
                    {projects.some((other) => other !== project && other.title === project.title)
                      ? `${project.title} (${project.workspaceRoot})`
                      : project.title}
                  </option>
                ))}
              </select>
              <div className="w-full sm:w-64">
                <Input
                  type="search"
                  surface="solid"
                  aria-label={gt("Search sessions")}
                  placeholder={gt("Search sessions")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div
              data-workspace-glass=""
              className="mb-4 flex w-fit max-w-full flex-wrap gap-1 rounded-xl p-1"
              role="group"
              aria-label={gt("Filter by status")}
            >
              {(["all", ...workspaceStatuses] as const).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={filter === status ? "secondary" : "ghost-muted"}
                  aria-pressed={filter === status}
                  onClick={() => selectStatus(status)}
                >
                  {labels[status]} <span className="tabular-nums">{counts[status]}</span>
                </Button>
              ))}
            </div>
            {rows.length > 0 || (counts.done > 0 && (filter === "all" || filter === "done")) ? (
              <div className="space-y-3">
                {workspaceStatuses.map((status) => {
                  const group = rows.filter((row) => row.status === status);
                  if (
                    group.length === 0 &&
                    (status !== "done" ||
                      counts.done === 0 ||
                      (filter !== "all" && filter !== "done"))
                  )
                    return null;
                  const expanded = !collapsed.has(status);
                  return (
                    <section
                      key={status}
                      data-workspace-glass=""
                      className="overflow-hidden rounded-2xl border border-border/60"
                      aria-label={labels[status]}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`workspace-group-${status}`}
                        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-xs font-medium outline-none transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(status)) next.delete(status);
                            else next.add(status);
                            return next;
                          })
                        }
                      >
                        <ChevronDownIcon
                          aria-hidden="true"
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
                            !expanded && "-rotate-90",
                          )}
                        />
                        <span>{labels[status]} </span>
                        <span className="tabular-nums text-muted-foreground">
                          {status === "done" ? counts.done : group.length}
                        </span>
                      </button>
                      <ul
                        id={`workspace-group-${status}`}
                        hidden={!expanded}
                        className="divide-y divide-border/50 border-t border-border/50"
                      >
                        {(status === "done" ? group.slice(0, visibleDone) : group).map((row) => (
                          <WorkspaceSessionRow key={row.key} row={row} onProject={setProjectKey} />
                        ))}
                      </ul>
                      {status === "done" &&
                        expanded &&
                        (doneShelf.loading ||
                          doneShelf.failed ||
                          group.length > visibleDone ||
                          unloadedDone > 0) && (
                          <div className="border-t border-border/50 px-4 py-3">
                            <Button
                              size="sm"
                              variant="ghost-muted"
                              disabled={doneShelf.loading}
                              onClick={() => {
                                if (doneShelf.failed) doneShelf.retry();
                                else setVisibleDone((count) => count + 50);
                              }}
                            >
                              {doneShelf.loading
                                ? gt("Loading…")
                                : doneShelf.failed
                                  ? gt("Retry")
                                  : gt("Load more")}
                            </Button>
                          </div>
                        )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div
                data-workspace-glass=""
                className="rounded-2xl border border-border/60 px-6 py-12 text-center"
              >
                <CircleDotIcon
                  aria-hidden="true"
                  className="mx-auto mb-3 size-5 text-muted-foreground"
                />
                <p className="text-sm font-medium">
                  {!bootstrapped
                    ? gt("Loading projects…")
                    : allRows.length === 0
                      ? gt("No workspaces yet")
                      : gt("No sessions match these filters")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {allRows.length === 0
                    ? gt("Start a new workspace to give a coding task its own Git worktree.")
                    : gt("Try another project, status, or search.")}
                </p>
              </div>
            )}
            {query.trim() &&
              unloadedDone > 0 &&
              (collapsed.has("done") || !rows.some((row) => row.status === "done")) &&
              (filter === "all" || filter === "done") && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={doneShelf.loading}
                    onClick={() => {
                      setCollapsed(
                        (current) => new Set([...current].filter((status) => status !== "done")),
                      );
                      if (doneShelf.failed) doneShelf.retry();
                      else setVisibleDone((count) => count + 50);
                    }}
                  >
                    {doneShelf.loading
                      ? gt("Loading…")
                      : doneShelf.failed
                        ? gt("Retry")
                        : gt("Load more")}
                  </Button>
                </div>
              )}
          </section>
        </div>
      </div>
    </SidebarInset>
  );
}
