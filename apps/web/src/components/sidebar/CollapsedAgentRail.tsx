import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { Link, useRouterState } from "@tanstack/react-router";
import { useGT, useMessages } from "gt-react";
import { Bot, Pause, Rss, Settings } from "lucide-react";
import {
  useDelegatedUnderParent,
  useHiddenThreadKeys,
  useProjects,
  useQuietThreadShells,
} from "../../state/entities";
import { liveShellEnvironmentIdsAtom } from "../../state/shell";
import { buildThreadRouteParams } from "../../threadRoutes";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { filterSidebarV2VisibleThreads, resolveWindowTitleThreadStatus } from "../Sidebar.logic";
import { resolveBackgroundThreadRequest } from "../backgroundThreadAnnouncement";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { sidebarProviderEntriesAtom } from "./providerEntries";

function AgentRailContents() {
  const gt = useGT();
  const messages = useMessages();
  const inFeed = useRouterState({
    select: (state) => /^\/feed(?:\/|$)/.test(state.location.pathname),
  });
  const threads = useQuietThreadShells();
  const delegated = useDelegatedUnderParent();
  const hidden = useHiddenThreadKeys();
  const live = useAtomValue(liveShellEnvironmentIdsAtom);
  const providers = useAtomValue(sidebarProviderEntriesAtom);
  const projects = useProjects();

  return (
    <nav data-slot="agent-rail" {...workspaceAreaProps("sidebar", 0)} aria-label={gt("Threads")}>
      <Link
        to="/feed"

        title={gt("Agent feed")}
        aria-label={gt("Agent feed")}
      >
        <Rss size={17} />
      </Link>
      <div data-slot="active-agents">
        {filterSidebarV2VisibleThreads(threads, null, delegated).map((thread) => {
          const ref = scopeThreadRef(thread.environmentId, thread.id);
          if (!live.has(thread.environmentId) || hidden.has(threadKey(ref))) return null;
          const status = resolveWindowTitleThreadStatus(thread, messages);
          if (!status) return null;
          const waiting = resolveBackgroundThreadRequest(thread).request !== null;
          const instance = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
          const provider = providers.get(thread.environmentId)?.get(instance);
          const project = projects.find(
            (p) => p.environmentId === thread.environmentId && p.id === thread.projectId,
          );
          const label = [project?.title, thread.title, provider?.displayName ?? instance, status]
            .filter(Boolean)
            .join(" · ");
          return (
            <Tooltip key={scopedThreadKey(ref)}>
              <TooltipTrigger
                render={
                  <Link
                    to={inFeed ? "/feed/$environmentId/$threadId" : "/$environmentId/$threadId"}
                    search={inFeed ? { panel: "conversation" } : {}}
                    params={buildThreadRouteParams(ref)}
                    data-slot="agent-link"
                    data-attention={waiting}
                    aria-label={label}
                  />
                }
              >
                {provider ? (
                  <ProviderInstanceIcon {...provider} size="compact" />
                ) : (
                  <Bot size={16} />
                )}
                {waiting && <Pause data-slot="agent-pause" aria-hidden />}
              </TooltipTrigger>
              <TooltipPopup side="right">{label}</TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
      <Link
        to="/settings"

        title={gt("Settings")}
        aria-label={gt("Settings")}
      >
        <Settings size={17} />
      </Link>
    </nav>
  );
}

export function CollapsedAgentRail() {
  const { open, isMobile } = useSidebar();
  return open || isMobile ? null : <AgentRailContents />;
}
