import { Link, useMatch, useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { BotIcon, LayoutGridIcon, ListIcon, PlusIcon } from "lucide-react";
import { lazy, Suspense } from "react";

import { isElectron } from "../../env";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { InstallDaycrew } from "../mobile/InstallDaycrew";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

const AgentFeed = lazy(() => import("../AgentFeed"));
const AgentGrid = lazy(() => import("./AgentGrid"));

export default function AgentsPage() {
  const gt = useGT();
  const navigate = useNavigate();
  const grid =
    useMatch({
      from: "/_chat/feed",
      shouldThrow: false,
      select: (match) => match.search.view,
    }) === "grid";

  return (
    <SidebarInset
      {...workspaceAreaProps("home", 1, gt("Agents"))}
      data-sky-surface={grid ? "agents" : "feed"}
      className="h-full min-h-0 overflow-hidden"
    >
      <WorkspacePageHeader
        electron={isElectron}
        data-workspace-topbar=""
        className="gap-2 border-b border-border/40"
      >
        <BotIcon aria-hidden="true" className="hidden size-4 shrink-0 sm:block" />
        <h1 className="text-sm font-medium">
          <T>Agents</T>
        </h1>
        <div
          role="group"
          aria-label={gt("Agent view")}
          className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-background/60 p-0.5"
        >
          <Button
            size="sm"
            variant={grid ? "ghost-muted" : "secondary"}
            aria-pressed={!grid}
            onClick={() => {
              if (grid) void navigate({ to: "/feed" });
            }}
          >
            <ListIcon aria-hidden="true" />
            <T>List</T>
          </Button>
          <Button
            size="sm"
            variant={grid ? "secondary" : "ghost-muted"}
            aria-pressed={grid}
            onClick={() => {
              if (!grid) void navigate({ to: "/feed", search: { view: "grid" } });
            }}
          >
            <LayoutGridIcon aria-hidden="true" />
            <T>Grid</T>
          </Button>
        </div>
        <InstallDaycrew />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={gt("New prompt")}
          render={<Link to="/" />}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </WorkspacePageHeader>
      <Suspense fallback={null}>{grid ? <AgentGrid /> : <AgentFeed />}</Suspense>
    </SidebarInset>
  );
}
