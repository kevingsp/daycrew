import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { BotIcon, GitBranchIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { cn } from "../../lib/utils";
import { useAllEnvironmentShellsBootstrapped } from "../../state/entities";
import { liveShellEnvironmentIdsAtom } from "../../state/shell";
import { buildThreadRouteParams } from "../../threadRoutes";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { sidebarProviderEntriesAtom } from "../sidebar/providerEntries";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  filterWorkspaceRows,
  type WorkspaceRow,
  type WorkspaceStatus,
} from "../workspaces/workspaceOverview.logic";
import { useAgentRows } from "./useAgentRows";

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

function AgentCard({ row, compact }: { readonly row: WorkspaceRow; readonly compact: boolean }) {
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
  if (compact) {
    const statusLabel = connected
      ? status === "review"
        ? gt("Review")
        : labels[status]
      : gt("Reconnecting");
    return (
      <Link
        to="/$environmentId/$threadId"
        params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
        data-agent-card=""
        data-status={status}
        data-density="compact"
        data-workspace-glass=""
        aria-label={`${thread.title} · ${project.title} · ${provider?.displayName ?? instanceId} · ${connected ? labels[status] : gt("Reconnecting")}`}
        className="flex min-h-16 min-w-0 flex-col justify-between gap-1 rounded-2xl border border-border/60 p-3 text-foreground shadow-xs outline-none transition-colors duration-150 hover:border-border hover:bg-card focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center">
            {provider ? (
              <ProviderInstanceIcon {...provider} size="compact" />
            ) : (
              <BotIcon className="size-4" />
            )}
          </span>
          <h2 className="line-clamp-2 min-w-0 text-sm font-medium leading-5 tracking-tight">
            {thread.title}
          </h2>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-2xs">
          <span className="min-w-6 flex-1 truncate text-muted-foreground">{project.title}</span>
          <span className="inline-flex min-w-0 shrink items-center gap-1">
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                connected ? statusColors[status] : "bg-muted-foreground/50",
              )}
            />
            <span className="truncate">{statusLabel}</span>
          </span>
        </div>
      </Link>
    );
  }
  return (
    <Link
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))}
      data-agent-card=""
      data-status={status}
      data-workspace-glass=""
      className="group flex min-h-44 min-w-0 flex-col rounded-2xl border border-border/60 p-4 text-foreground shadow-xs outline-none transition-colors duration-150 hover:border-border hover:bg-card focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none sm:min-h-48 sm:p-5"
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
  const allRows = useAgentRows().filter((row) => row.status !== "done");
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const [filter, setFilter] = useState<"all" | "attention" | "running" | "review">("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const mobile = useMediaQuery("max-md");
  const rows = filterWorkspaceRows(allRows, "", filter, query);
  const labels = {
    all: gt("All"),
    attention: gt("Needs you"),
    running: gt("Running"),
    review: gt("Ready to review"),
  };
  return (
    <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <div data-workspace-content="" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 data-workspace-title="">
              <T>Your crew</T>
            </h1>
          </div>
          <div className="w-full sm:w-64">
            <Input
              type="search"
              surface="solid"
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
          className="my-4 flex w-fit max-w-full gap-1 overflow-x-auto overflow-y-hidden rounded-xl p-1 sm:my-6 sm:flex-wrap"
        >
          {(["all", "attention", "running", "review"] as const).map((status) => (
            <Button
              key={status}
              size={mobile ? "xs" : "sm"}
              variant={filter === status ? "secondary" : "ghost-muted"}
              aria-pressed={filter === status}
              onClick={() => {
                setFilter(status);
                setLimit(12);
              }}
            >
              {mobile && status === "review" ? gt("Review") : labels[status]}{" "}
              <span className="tabular-nums">
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
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
          >
            {rows.slice(0, limit).map((row) => (
              <li key={row.key} className="min-w-0">
                <AgentCard row={row} compact={mobile} />
              </li>
            ))}
          </ul>
        ) : (
          <div
            data-workspace-glass=""
            className="rounded-2xl border border-border/60 px-6 py-12 text-center"
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
            <div className="mt-6">
              <Button render={<Link to="/" />}>
                <PlusIcon />
                <T>New prompt</T>
              </Button>
            </div>
          </div>
        )}
        {rows.length > limit ? (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => setLimit(limit + (mobile ? 12 : 24))}>
              <T>Show more</T>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
