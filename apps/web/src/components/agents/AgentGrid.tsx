import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { BotIcon, GitBranchIcon, LayoutGridIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { isElectron } from "../../env";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { cn } from "../../lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import {
  useAllEnvironmentShellsBootstrapped,
  useDelegatedUnderParent,
  useHiddenThreadKeys,
  useProjects,
  useQuietThreadShells,
} from "../../state/entities";
import { liveShellEnvironmentIdsAtom } from "../../state/shell";
import { buildThreadRouteParams } from "../../threadRoutes";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { sidebarProviderEntriesAtom } from "../sidebar/providerEntries";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { InstallDaycrew } from "../mobile/InstallDaycrew";
import {
  buildWorkspaceRows,
  filterWorkspaceRows,
  type WorkspaceRow,
  type WorkspaceStatus,
} from "../workspaces/workspaceOverview.logic";

const statusColors: Record<WorkspaceStatus, string> = {
  attention: "bg-warning",
  running: "bg-info",
  review: "bg-success",
  idle: "bg-muted-foreground/50",
  done: "bg-muted-foreground/50",
};

function AgentElapsed({ startedAt }: { readonly startedAt: string }) {
  const gt = useGT();
  const now = Date.parse(useNowMinute() + ":00Z");
  const minutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60_000));
  return Number.isFinite(minutes) ? (
    <span className="tabular-nums text-muted-foreground">
      {gt("{count} min", { count: minutes })}
    </span>
  ) : null;
}

function AgentCard({ row }: { readonly row: WorkspaceRow }) {
  const gt = useGT();
  const providers = useAtomValue(sidebarProviderEntriesAtom);
  const live = useAtomValue(liveShellEnvironmentIdsAtom);
  const { thread, project, status } = row;
  const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const provider = providers.get(thread.environmentId)?.get(instanceId);
  const connected = live.has(thread.environmentId);
  const labels: Record<WorkspaceStatus, string> = {
    attention: gt("Needs you"),
    running: gt("Running"),
    review: gt("Ready to review"),
    idle: gt("Idle"),
    done: gt("Done"),
  };
  return (
    <Link
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
      data-agent-card=""
      data-status={status}
      data-workspace-glass=""
      className="group flex min-h-44 min-w-0 flex-col rounded-2xl border border-border/60 p-3.5 text-foreground shadow-xs outline-none transition-colors hover:border-border hover:bg-card focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-48 sm:p-5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70">
          {provider ? (
            <ProviderInstanceIcon {...provider} size="compact" />
          ) : (
            <BotIcon className="size-4" />
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {provider?.displayName ?? instanceId}
        </span>
      </div>
      <h2 className="mt-3 line-clamp-2 min-h-10 text-sm font-medium leading-5 tracking-tight sm:text-base">
        {thread.title}
      </h2>
      <p className="mt-1 truncate text-xs text-muted-foreground">{project.title}</p>
      {thread.branch ? (
        <p className="mt-2 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <GitBranchIcon aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{thread.branch}</span>
        </p>
      ) : null}
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-xs">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            connected ? statusColors[status] : "bg-muted-foreground/50",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">{connected ? labels[status] : gt("Reconnecting")}</span>
        {connected && status === "running" ? (
          <AgentElapsed startedAt={thread.latestRun?.startedAt ?? thread.updatedAt} />
        ) : null}
      </div>
    </Link>
  );
}

export default function AgentGrid() {
  const gt = useGT();
  const threads = useQuietThreadShells();
  const projects = useProjects();
  const hidden = useHiddenThreadKeys();
  const delegated = useDelegatedUnderParent();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const [filter, setFilter] = useState<"all" | "attention" | "running" | "review">("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const mobile = useMediaQuery("max-md");
  const allRows = buildWorkspaceRows(threads, projects).filter((row) => {
    const key = threadKey(scopeThreadRef(row.thread.environmentId, row.thread.id));
    return row.status !== "done" && !hidden.has(key) && !delegated.has(key);
  });
  const rows = filterWorkspaceRows(allRows, "", filter, query);
  const labels = {
    all: gt("All"),
    attention: gt("Needs you"),
    running: gt("Running"),
    review: gt("Ready to review"),
  };
  return (
    <SidebarInset
      {...workspaceAreaProps("home", 1, gt("Agents"))}
      data-sky-surface="agents"
      className="h-full min-h-0 overflow-hidden"
    >
      <WorkspacePageHeader
        electron={isElectron}
        data-workspace-topbar=""
        className="border-b border-border/40"
      >
        <LayoutGridIcon aria-hidden="true" className="hidden size-4 sm:block" />
        <span className="text-sm font-medium">
          <T>Agents</T>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <InstallDaycrew />
          <Button
            size={mobile ? "icon" : "sm"}
            variant="ghost"
            aria-label={gt("New prompt")}
            render={<Link to="/" />}
          >
            <PlusIcon />
            <span className="hidden sm:inline">
              <T>New prompt</T>
            </span>
          </Button>
        </div>
      </WorkspacePageHeader>
      <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div
          data-workspace-content=""
          className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 data-workspace-title="">
                <T>Your crew</T>
              </h1>
              <p data-sky-caption="" className="mt-2 text-sm">
                <T>A little space for every agent.</T>
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Input
                type="search"
                aria-label={gt("Search agents")}
                placeholder={gt("Search agents")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(12);
                }}
              />
            </div>
          </div>
          <div
            data-workspace-glass=""
            role="group"
            aria-label={gt("Filter by status")}
            className="my-5 flex w-fit max-w-full flex-wrap gap-1 rounded-xl p-1"
          >
            {(["all", "attention", "running", "review"] as const).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={filter === status ? "secondary" : "ghost-muted"}
                aria-pressed={filter === status}
                onClick={() => {
                  setFilter(status);
                  setLimit(12);
                }}
              >
                {labels[status]}{" "}
                <span className="tabular-nums opacity-70">
                  {status === "all"
                    ? allRows.length
                    : allRows.filter((row) => row.status === status).length}
                </span>
              </Button>
            ))}
          </div>
          {rows.length > 0 ? (
            <ul
              aria-label={gt("Agents")}
              className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
            >
              {rows.slice(0, limit).map((row) => (
                <li key={row.key} className="min-w-0">
                  <AgentCard row={row} />
                </li>
              ))}
            </ul>
          ) : (
            <div
              data-workspace-glass=""
              className="rounded-2xl border border-border/60 px-5 py-12 text-center"
            >
              <SearchIcon aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <h2 className="mt-3 text-sm font-medium">
                {!bootstrapped ? gt("Connecting") : gt("No agents to show")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {query || filter !== "all"
                  ? gt("Try another project, status, or search.")
                  : gt("Start a prompt to put your crew to work.")}
              </p>
              <div className="mt-5">
                <Button render={<Link to="/" />}>
                  <PlusIcon />
                  <T>New prompt</T>
                </Button>
              </div>
            </div>
          )}
          {rows.length > limit ? (
            <div className="mt-5 flex justify-center">
              <Button variant="outline" onClick={() => setLimit(limit + (mobile ? 12 : 24))}>
                <T>Show more</T>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </SidebarInset>
  );
}
