import * as NetService from "@t3tools/shared/Net";
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopHomeOwner from "./DesktopHomeOwner.ts";

const withTempHome = <A, E>(
  run: (
    userdata: string,
  ) => Effect.Effect<
    A,
    E,
    DesktopEnvironment.DesktopEnvironment | FileSystem.FileSystem | Path.Path
  >,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-desktop-home-owner-" });
    yield* fs.makeDirectory(`${home}/userdata`, { recursive: true });
    return yield* run(`${home}/userdata`).pipe(
      Effect.provide(
        DesktopEnvironment.layer({
          dirname: "/repo/apps/desktop/src",
          homeDirectory: home,
          platform: "linux",
          processArch: "x64",
          appVersion: "0.0.0",
          appPath: "/repo",
          isPackaged: true,
          resourcesPath: "/missing/resources",
          runningUnderArm64Translation: false,
        }).pipe(
          Layer.provide(
            Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({ T3CODE_HOME: home })),
          ),
        ),
      ),
    );
  }).pipe(Effect.provide(NodeServices.layer));

const readOwnerWithRuntimeFile = (contents: string | undefined) =>
  withTempHome((userdata) =>
    Effect.gen(function* () {
      if (contents !== undefined) {
        yield* (yield* FileSystem.FileSystem).writeFileString(
          `${userdata}/server-runtime.json`,
          contents,
        );
      }
      return yield* DesktopHomeOwner.readLiveHomeOwner();
    }),
  );

describe("DesktopHomeOwner.readLiveHomeOwner", () => {
  it.effect("reports a live server recorded in server-runtime.json", () =>
    Effect.gen(function* () {
      const owner = yield* readOwnerWithRuntimeFile(
        JSON.stringify({
          version: 1,
          pid: process.pid,
          port: 3790,
          origin: "http://127.0.0.1:3790",
          startedAt: "2026-01-01T00:00:00.000Z",
          serverVersion: "1.2.3",
        }),
      );
      assert.deepStrictEqual(
        owner,
        Option.some({ pid: process.pid, port: 3790, serverVersion: "1.2.3" }),
      );
      assert.include(
        DesktopHomeOwner.homeOwnedMessage(owner),
        `PID ${process.pid}, port 3790, version 1.2.3`,
      );
    }),
  );

  it.effect("ignores a missing, malformed or dead owner record", () =>
    Effect.gen(function* () {
      assert.isTrue(Option.isNone(yield* readOwnerWithRuntimeFile(undefined)));
      assert.isTrue(Option.isNone(yield* readOwnerWithRuntimeFile("{not json")));
      assert.isTrue(
        Option.isNone(yield* readOwnerWithRuntimeFile(JSON.stringify({ pid: 0, port: 3790 }))),
      );
    }),
  );
});

describe("DesktopHomeOwner.awaitHomeOwnershipRelease", () => {
  it.effect("waits for a shutting-down owner to release the lock, then gives up", () =>
    withTempHome((userdata) =>
      Effect.gen(function* () {
        assert.isTrue(yield* DesktopHomeOwner.awaitHomeOwnershipRelease());

        const lock = new NodeSqlite.DatabaseSync(`${userdata}/server-owner.sqlite`);
        lock.exec("BEGIN EXCLUSIVE;");
        const released = yield* Effect.forkChild(DesktopHomeOwner.awaitHomeOwnershipRelease());
        yield* TestClock.adjust("5 seconds");
        lock.close();
        yield* TestClock.adjust("1 second");
        assert.isTrue(yield* Fiber.join(released));

        const held = new NodeSqlite.DatabaseSync(`${userdata}/server-owner.sqlite`);
        held.exec("BEGIN EXCLUSIVE;");
        const owned = yield* Effect.forkChild(DesktopHomeOwner.awaitHomeOwnershipRelease());
        yield* TestClock.adjust("1 minute");
        assert.isFalse(yield* Fiber.join(owned));
        held.close();
      }),
    ),
  );
});

it.effect.each([
  {
    platform: "win32",
    development: false,
    home: "/local/T3CodeWorkspaces",
    available: false,
    expected: true,
  },
  {
    platform: "win32",
    development: false,
    home: "/LOCAL/t3codeworkspaces",
    available: false,
    expected: true,
  },
  {
    platform: "win32",
    development: false,
    home: "/local/T3CodeWorkspaces",
    available: true,
    expected: false,
  },
  { platform: "win32", development: false, home: "/isolated", available: false, expected: false },
  {
    platform: "win32",
    development: true,
    home: "/local/T3CodeWorkspaces",
    available: false,
    expected: false,
  },
  {
    platform: "linux",
    development: false,
    home: "/local/T3CodeWorkspaces",
    available: false,
    expected: false,
  },
] as const)("detects a legacy preview without requiring a database lock: %j", (input) =>
  Effect.gen(function* () {
    const config = DesktopConfig.layerTest({
      LOCALAPPDATA: "/local",
      T3CODE_HOME: input.home,
      ...(input.development ? { VITE_DEV_SERVER_URL: "http://localhost:5173" } : {}),
    });
    const environment = DesktopEnvironment.layer({
      dirname: "/repo/apps/desktop/src",
      homeDirectory: "/user",
      platform: input.platform,
      processArch: "x64",
      appVersion: "0.1.11",
      appPath: "/repo",
      isPackaged: true,
      resourcesPath: "/resources",
      runningUnderArm64Translation: false,
    }).pipe(Layer.provideMerge(config), Layer.provide(NodeServices.layer));
    const result = yield* DesktopHomeOwner.legacyPreviewIsRunning.pipe(
      Effect.provide(
        Layer.mergeAll(
          environment,
          Layer.mock(NetService.NetService, {
            canListenOnHost: (port, host) => {
              assert.equal(port, 47831);
              assert.equal(host, "127.0.0.1");
              return Effect.succeed(input.available);
            },
          }),
        ),
      ),
    );
    assert.equal(result, input.expected);
  }),
);
