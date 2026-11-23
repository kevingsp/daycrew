import { assert, it } from "@effect/vitest";
import { RunId, ThreadId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as ProjectTurnHook from "./ProjectTurnHook.ts";
import * as T3ProjectFileLoader from "./T3ProjectFileLoader.ts";

it.effect.each([
  ["enabled", true, false, 1],
  ["disabled", false, false, 0],
  ["restricted link", true, true, 0],
] as const)(
  "runs the configured host hook only for an authorized project: %s",
  ([, enabled, fenced, expected]) => {
    const calls: ProcessRunner.ProcessRunInput[] = [];
    const threadId = ThreadId.make("chat-one");
    const runId = RunId.make("turn-one");
    const layer = ProjectTurnHook.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ProjectionStore.ProjectionStoreV2)({
            getThreadShell: () =>
              Effect.succeed({
                id: threadId,
                title: "[UI] Workspace",
                ...(fenced ? { linkOrigin: { sessionId: "link", label: "Restricted" } } : {}),
              } as OrchestrationV2ThreadShell),
          }),
          Layer.succeed(T3ProjectFileLoader.T3ProjectFileLoader, {
            load: (cwd) => {
              assert.equal(cwd, "/actual/worktree");
              return enabled
                ? Effect.succeedSome({ afterTurn: { command: "node", args: ["backup.cjs"] } })
                : Effect.succeedNone;
            },
          }),
          Layer.succeed(ProcessRunner.ProcessRunner, {
            run: (input) => {
              calls.push(input);
              return Effect.succeed({
                code: 0 as ProcessRunner.ProcessRunOutput["code"],
                stdout: "saved",
                stderr: "",
                timedOut: false,
                stdoutTruncated: false,
                stderrTruncated: false,
                stdoutInvalidUtf8: false,
                stderrInvalidUtf8: false,
              });
            },
          }),
        ),
      ),
    );
    return Effect.gen(function* () {
      const hook = yield* ProjectTurnHook.ProjectTurnHook;
      yield* hook.run({ cwd: "/actual/worktree", threadId, runId });
      assert.equal(calls.length, expected);
      if (calls[0]) {
        assert.deepEqual(calls[0].args, ["backup.cjs"]);
        assert.equal(calls[0].env?.T3CODE_THREAD_ID, threadId);
        assert.equal(calls[0].env?.T3CODE_RUN_ID, runId);
        assert.equal(calls[0].env?.T3CODE_THREAD_TITLE, "[UI] Workspace");
        assert.equal(calls[0].cwd, "/actual/worktree");
      }
    }).pipe(Effect.provide(layer));
  },
);
