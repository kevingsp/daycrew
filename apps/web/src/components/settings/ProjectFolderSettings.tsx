import {
  findProjectByPath,
  resolveProjectPathForDispatch,
} from "@t3tools/client-runtime/state/projects";
import { AsyncResult } from "effect/reactivity";
import { useGT } from "gt-react";
import { useState } from "react";

import { reportProjectFailure } from "../../hooks/useProjectGroupUpdate";
import type { SidebarProjectGroupMember } from "../../sidebarProjectGrouping";
import { useProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function ProjectFolderSettings({
  member,
  disabled,
}: {
  member: SidebarProjectGroupMember;
  disabled: boolean;
}) {
  const gt = useGT();
  const projects = useProjects();
  const update = useOrchestrationCommand(projectEnvironment.update, { reportFailure: false });
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState(member.workspaceRoot);
  const [saving, setSaving] = useState(false);
  const nextPath = resolveProjectPathForDispatch(folder, member.workspaceRoot);
  const conflict = findProjectByPath(
    projects.filter(
      (project) => project.environmentId === member.environmentId && project.id !== member.id,
    ),
    nextPath,
  );
  const canSave =
    !disabled &&
    !saving &&
    folder.trim() !== "" &&
    !conflict &&
    !findProjectByPath([member], nextPath);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await update({
        environmentId: member.environmentId,
        input: { projectId: member.id, workspaceRoot: nextPath },
      });
      if (AsyncResult.isSuccess(result)) setOpen(false);
      else reportProjectFailure(gt("Failed to change project folder"), result);
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        aria-label={gt("Change folder for {path}", { path: member.workspaceRoot })}
        onClick={() => {
          setFolder(member.workspaceRoot);
          setOpen(true);
        }}
      >
        {gt("Change folder")}
      </Button>
    );
  return (
    <div className="grid w-full min-w-0 gap-2">
      <Input
        aria-label={gt("Project folder")}
        value={folder}
        onChange={(event) => setFolder(event.target.value)}
        disabled={saving || disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void save();
          }
        }}
      />
      {conflict ? (
        <p role="alert" className="text-sm text-destructive">
          {gt("This folder already belongs to another project.")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {gt(
          "Changes the folder used by chats without a worktree. Chat history, existing worktrees and files are kept. Running tasks keep their current folder until their next turn.",
        )}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
          {gt("Cancel")}
        </Button>
        <Button disabled={!canSave} onClick={() => void save()}>
          {saving ? gt("Saving…") : gt("Save folder")}
        </Button>
      </div>
    </div>
  );
}
