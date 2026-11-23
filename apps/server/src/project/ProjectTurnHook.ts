import { linkOriginIsFenced, RunId, ThreadId } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as T3ProjectFileLoader from "./T3ProjectFileLoader.ts";

export class ProjectTurnHookError extends Schema.TaggedError<ProjectTurnHookError>()(
  "ProjectTurnHookError",
  { cwd: Schema.String, threadId: ThreadId, cause: Schema.Defect() },
) {}

class ProjectTurnHookExitError extends Schema.TaggedError<ProjectTurnHookExitError>()(
  "ProjectTurnHookExitError",
  { exitCode: Schema.NullOr(Schema.Int) },
) {}

export class ProjectTurnHook extends Context.Service<
  ProjectTurnHook,
  {
    readonly run: (input: {
      readonly cwd: string;
      readonly threadId: ThreadId;
      readonly runId: RunId;
    }) => Effect.Effect<void, ProjectTurnHookError>;
  }
>()("t3/project/ProjectTurnHook") {}

const make = Effect.gen(function* () {
  const files = yield* T3ProjectFileLoader.T3ProjectFileLoader;
  const threads = yield* ProjectionStore.ProjectionStoreV2;
  const processes = yield* ProcessRunner.ProcessRunner;
  const env = yield* HostProcess.Environment;
  return ProjectTurnHook.of({
    run: Effect.fn("ProjectTurnHook.run")(
      function* (input) {
        const thread = yield* threads.getThreadShell(input.threadId);
        if (!thread || (thread.linkOrigin !== undefined && linkOriginIsFenced(thread.linkOrigin)))
          return;
        const file = yield* files.load(input.cwd);
        const hook = Option.isSome(file) ? file.value.afterTurn : undefined;
        if (!hook) return;
        yield* processes
          .run({
            command: hook.command,
            args: hook.args,
            cwd: input.cwd,
            env: {
              ...env,
              T3CODE_THREAD_ID: input.threadId,
              T3CODE_THREAD_TITLE: thread.title,
              T3CODE_RUN_ID: input.runId,
              GIT_TERMINAL_PROMPT: "0",
            },
            timeout: "2 minutes",
            maxOutputBytes: 64 * 1024,
            outputMode: "truncate",
          })
          .pipe(
            Effect.flatMap((result) =>
              result.code === 0
                ? Effect.void
                : Effect.fail(new ProjectTurnHookExitError({ exitCode: result.code })),
            ),
            Effect.retry({ times: 2, schedule: Schedule.exponential("5 seconds") }),
          );
      },
      (effect, { cwd, threadId }) =>
        effect.pipe(Effect.mapError((cause) => new ProjectTurnHookError({ cwd, threadId, cause }))),
    ),
  });
});

export const layer = Layer.effect(ProjectTurnHook, make);
