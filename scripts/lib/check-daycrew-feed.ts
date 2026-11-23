// @effect-diagnostics nodeBuiltinImport:off
import * as NodeAssert from "node:assert/strict";
import * as NodePath from "node:path";
import type { Page } from "playwright-core";

// These callbacks run in the browser; local declarations keep DOM types out of the Node server.
declare const window: { readonly innerWidth: number };
declare const requestAnimationFrame: (callback: (now: number) => void) => number;
declare const cancelAnimationFrame: (handle: number) => void;
declare const document: {
  readonly activeElement: unknown;
  readonly documentElement: { readonly scrollWidth: number };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  getAnimations(): Array<{
    readonly effect: { getTiming(): { readonly iterations: number } } | null;
    readonly finished: Promise<unknown>;
  }>;
};

function summarize(frames: number[], keys: number[]) {
  function p95(values: number[]) {
    return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? null;
  }
  return {
    samples: frames.length,
    frameP95Ms: p95(frames),
    worstFrameMs: frames.length ? Math.max(...frames) : null,
    keydownToNextFrameP95Ms: p95(keys),
  };
}

export async function checkDaycrewFeed(
  page: Page,
  width: number,
  artifacts: string,
  title = "Release launch check",
) {
  await page.waitForFunction((expected) => window.innerWidth === expected, width);
  const card = page
    .locator(".feed-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card.waitFor();
  const replies = card.getByRole("button", { name: "Reply", exact: true });
  const composer = card.getByRole("textbox", { name: "Reply to " + title });
  const review = card.getByRole("link", { name: "Review diff", exact: true });
  const close = page.getByRole("button", { name: "Close details", exact: true });
  const timings: Record<string, { frames: number[]; keys: number[] }> = {};
  async function measure(name: string, action: () => Promise<void>) {
    // Align each boundary to a frame so setup, assertions and captures cannot
    // leak their longest frame into the following interaction.
    const meter = await page.evaluateHandle(
      () =>
        new Promise<() => Promise<{ frames: number[]; keys: number[] }>>((resolve) => {
          requestAnimationFrame((first) => {
            const frames: number[] = [];
            const keys: number[] = [];
            let previous = first;
            let tick = 0;
            const frame = (now: number) => {
              frames.push(now - previous);
              previous = now;
              tick = requestAnimationFrame(frame);
            };
            tick = requestAnimationFrame(frame);
            const key = () => {
              const start = performance.now();
              requestAnimationFrame(() => keys.push(performance.now() - start));
            };
            document.addEventListener("keydown", key);
            resolve(
              () =>
                new Promise((done) =>
                  requestAnimationFrame(() => {
                    cancelAnimationFrame(tick);
                    document.removeEventListener("keydown", key);
                    done({ frames, keys });
                  }),
                ),
            );
          });
        }),
    );
    try {
      await action();
    } finally {
      try {
        timings[name] = await meter.evaluate((stop) => stop());
      } finally {
        await meter.dispose();
      }
    }
  }
  const settle = () =>
    page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ).then(() => undefined),
    );
  async function toggleReplies() {
    await replies.click();
    await settle();
  }
  await measure("expandReplies", toggleReplies);
  await measure("typing", async () => {
    await composer.fill("Retained draft");
    await composer.pressSequentially(" while columns move", { delay: 16 });
  });
  const before = await card.boundingBox();
  await measure("openColumn", async () => {
    await review.click();
    await close.waitFor();
    await settle();
  });
  const after = await card.boundingBox();
  NodeAssert.ok(
    before && after && Math.abs(before.y - after.y) <= 2,
    "Selected card moved vertically",
  );
  await measure("screenshot", async () => {
    await page.screenshot({ path: NodePath.join(artifacts, `columns-${width}.png`) });
  });
  await measure("closeColumn", async () => {
    await close.click();
    await settle();
  });
  NodeAssert.equal(await review.evaluate((el) => el === document.activeElement), true);
  NodeAssert.equal(await composer.inputValue(), "Retained draft while columns move");
  await measure("collapseReplies", toggleReplies);
  await toggleReplies();
  NodeAssert.equal(await composer.inputValue(), "Retained draft while columns move");
  await page.screenshot({ path: NodePath.join(artifacts, `feed-${width}.png`) });
  NodeAssert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  await toggleReplies();
  const interactions = Object.entries(timings)
    .filter(([name]) => name !== "screenshot")
    .map(([, value]) => value);
  return {
    width,
    ...summarize(
      interactions.flatMap((x) => x.frames),
      interactions.flatMap((x) => x.keys),
    ),
    phases: Object.fromEntries(
      Object.entries(timings).map(([name, sample]) => [
        name,
        summarize(sample.frames, sample.keys),
      ]),
    ),
  };
}
