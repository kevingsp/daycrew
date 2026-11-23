import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import { resolveSidebarThreadStatus } from "../Sidebar.logic";

interface SubagentActivity {
  readonly key: string;
  readonly target: ScopedThreadRef;
  readonly title: string | null;
  readonly parentTitle: string | null;
  readonly status: "working" | "preparing" | "approval" | "input";
}

export function collectSidebarSubagentActivity(
  threads: readonly EnvironmentThreadShell[],
  live: ReadonlySet<EnvironmentId>,
  hidden: ReadonlySet<string>,
): readonly SubagentActivity[] {
  const byThread = new Map(
    threads.map((thread) => [threadKey(scopeThreadRef(thread.environmentId, thread.id)), thread]),
  );
  const entries = new Map<string, SubagentActivity>();
  const visible = threads.filter(
    (thread) =>
      live.has(thread.environmentId) &&
      thread.archivedAt === null &&
      thread.deletedAt === null &&
      !hidden.has(threadKey(scopeThreadRef(thread.environmentId, thread.id))),
  );
  for (const thread of visible) {
    const parent =
      thread.delegatedFrom ??
      (thread.lineage.relationshipToParent === "subagent" && thread.lineage.parentThreadId !== null
        ? scopeThreadRef(thread.environmentId, thread.lineage.parentThreadId)
        : null);
    if (parent === null) continue;
    const status = resolveSidebarThreadStatus(thread);
    if (
      status !== "working" &&
      status !== "preparing" &&
      status !== "approval" &&
      status !== "input"
    )
      continue;

    const target = scopeThreadRef(thread.environmentId, thread.id);
    const key = threadKey(target);
    entries.set(key, {
      key,
      target,
      title: thread.title,
      parentTitle: byThread.get(threadKey(parent))?.title ?? thread.delegatedFrom?.title ?? null,
      status,
    });
  }

  for (const thread of visible) {
    for (const task of thread.pendingBackgroundTasks) {
      if (task.kind !== "subagent") continue;
      const child =
        task.childThreadId === undefined
          ? null
          : scopeThreadRef(thread.environmentId, task.childThreadId);
      const childKey = child === null ? null : threadKey(child);
      const childShell = childKey === null ? undefined : byThread.get(childKey);
      // A child with its own row has a more specific status than the parent's work summary.
      if (
        childKey !== null &&
        (entries.has(childKey) ||
          hidden.has(childKey) ||
          (childShell && (childShell.archivedAt !== null || childShell.deletedAt !== null)))
      )
        continue;
      const owner = scopeThreadRef(thread.environmentId, task.sourceThreadId ?? thread.id);
      const key = childKey ?? `${threadKey(owner)}:${task.taskId}`;
      if (entries.has(key)) continue;
      entries.set(key, {
        key,
        target: child ?? owner,
        title: childShell?.title ?? task.description ?? null,
        parentTitle: byThread.get(threadKey(owner))?.title ?? thread.title,
        status: "working",
      });
    }
  }
  return [...entries.values()];
}
