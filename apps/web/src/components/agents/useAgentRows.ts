import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";

import {
  useDelegatedUnderParent,
  useHiddenThreadKeys,
  useProjects,
  useQuietThreadShells,
} from "../../state/entities";
import { filterSidebarV2VisibleThreads } from "../Sidebar.logic";
import { buildWorkspaceRows } from "../workspaces/workspaceOverview.logic";

export function useAgentRows() {
  const threads = useQuietThreadShells();
  const projects = useProjects();
  const hidden = useHiddenThreadKeys();
  const delegated = useDelegatedUnderParent();

  return buildWorkspaceRows(
    filterSidebarV2VisibleThreads(threads, null, delegated).filter(
      (thread) => !hidden.has(threadKey(scopeThreadRef(thread.environmentId, thread.id))),
    ),
    projects,
  );
}
