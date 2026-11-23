import { expect } from "e2e";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { T3_HOME } from "../e2e.config.ts";
import { runPromise, test, WEB } from "./t3.ts";

test(
  "A fresh pairing link signs in when the pairing form is already open",
  WEB,
  async ({ t3, app, screen, browser }) => {
    await t3.project("demo");
    await app.open("/pair");
    await expect(screen.getByRole("heading", "Pair with this environment")).toBeVisible();
    const pairingPath = await runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        return yield* fs.readFileString(path.join(T3_HOME, "pairing-path"));
      }),
    );
    await app.open(pairingPath);
    await app.screenshot("pairing-link-arrived");
    await expect(browser).not.toHaveURL(/\/pair(?:[?#]|$)/);
    await app.screenshot("paired");
  },
);
