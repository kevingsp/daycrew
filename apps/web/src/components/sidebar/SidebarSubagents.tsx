import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { GitForkIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useHiddenThreadKeys, useQuietThreadShells } from "../../state/entities";
import { liveShellEnvironmentIdsAtom } from "../../state/shell";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Popover, PopoverClose, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { collectSidebarSubagentActivity } from "./sidebarSubagentActivity";

export function SidebarSubagents({
  compact = false,
  onOpenThread,
}: {
  readonly compact?: boolean;
  readonly onOpenThread?: (() => void) | undefined;
}) {
  const gt = useGT();
  const threads = useQuietThreadShells();
  const hidden = useHiddenThreadKeys();
  const live = useAtomValue(liveShellEnvironmentIdsAtom);
  const entries = collectSidebarSubagentActivity(threads, live, hidden);
  if (entries.length === 0) return null;

  const labels = {
    working: gt("Running"),
    preparing: gt("Setting up"),
    approval: gt("Pending Approval"),
    input: gt("Awaiting Input"),
  };
  return (
    <Popover>
      <PopoverTrigger
        aria-label={gt("Subagents")}
        title={compact ? gt("Subagents") : undefined}
        render={
          <button
            type="button"
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 rounded-md text-sm text-sidebar-foreground outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              compact
                ? "relative size-[2.1rem] justify-center rounded-full"
                : "mb-1 w-full px-2.5 py-2",
            )}
          />
        }
      >
        <GitForkIcon aria-hidden="true" className="size-4 shrink-0" />
        {!compact && <T>Subagents</T>}
        <span
          className={cn(
            "grid min-w-4 place-items-center rounded-full bg-info/15 px-1 text-2xs font-semibold text-info-foreground tabular-nums",
            compact ? "absolute -right-1 -bottom-0.5 border border-sidebar bg-sidebar" : "ml-auto",
          )}
        >
          {entries.length}
        </span>
      </PopoverTrigger>
      <PopoverPopup side="right" align="start" width="md" padding="compact">
        <div className="px-2 py-1">
          <PopoverTitle>
            <T>Subagents</T>
          </PopoverTitle>
        </div>
        <ul className="max-h-[min(50vh,24rem)] overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.key}>
              <PopoverClose
                nativeButton={false}
                render={
                  <Link
                    role="link"
                    to="/$environmentId/$threadId"
                    params={buildThreadRouteParams(entry.target)}
                    onClick={onOpenThread}
                    className="flex min-w-0 items-start gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    entry.status === "approval" || entry.status === "input"
                      ? "bg-warning"
                      : "bg-info",
                  )}
                />
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium">{entry.title ?? gt("Subagent")}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[entry.parentTitle, labels[entry.status]].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </PopoverClose>
            </li>
          ))}
        </ul>
      </PopoverPopup>
    </Popover>
  );
}
