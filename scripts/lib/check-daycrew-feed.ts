// @effect-diagnostics nodeBuiltinImport:off
import * as NodeAssert from "node:assert/strict";
import * as NodePath from "node:path";
import type { Page } from "playwright-core";

export async function checkDaycrewFeed(page: Page, width: number, artifacts: string) {
  await page.locator(".feed-card").first().waitFor();
  const metrics = await page.evaluateHandle(() => {
    const sample = { running: true, frames: [] as number[], keyLatency: [] as number[] };
    let previous = performance.now();
    const frame = (now: number) => {
      sample.frames.push(now - previous);
      previous = now;
      if (sample.running) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const key = () => {
      const start = performance.now();
      requestAnimationFrame(() => sample.keyLatency.push(performance.now() - start));
      if (!sample.running) document.removeEventListener("keydown", key);
    };
    document.addEventListener("keydown", key);
    return sample;
  });
  const settle = () =>
    page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      ).then(() => undefined),
    );
  try {
    await page.getByRole("button", { name: "Replies", exact: true }).first().click();
    await settle();
    const composer = page.getByRole("textbox", { name: "Reply to Release launch check" });
    await composer.fill("Retained draft");
    await composer.pressSequentially(" while columns move");
    const card = page.locator(".feed-card").first();
    const before = await card.boundingBox();
    const review = card.getByRole("link", { name: "Review diff", exact: true });
    await review.click();
    await page.getByRole("button", { name: "Close details", exact: true }).waitFor();
    await settle();
    const after = await card.boundingBox();
    NodeAssert.ok(
      before && after && Math.abs(before.y - after.y) <= 2,
      "Selected card moved vertically",
    );
    await page.screenshot({ path: NodePath.join(artifacts, `columns-${width}.png`) });
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await settle();
    NodeAssert.equal(await review.evaluate((element) => element === document.activeElement), true);
    NodeAssert.equal(await composer.inputValue(), "Retained draft while columns move");
    await page.getByRole("button", { name: "Replies", exact: true }).first().click();
    await settle();
    await page.getByRole("button", { name: "Replies", exact: true }).first().click();
    await settle();
    NodeAssert.equal(await composer.inputValue(), "Retained draft while columns move");
    await composer.focus();
    await composer.pressSequentially(".");
    await settle();
    const samples = await metrics.evaluate((sample) => {
      sample.running = false;
      return sample;
    });
    const percentile = (values: number[], fraction: number) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.floor((sorted.length - 1) * fraction)] ?? null;
    };
    await page.screenshot({ path: NodePath.join(artifacts, `feed-${width}.png`) });
    NodeAssert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.getByRole("button", { name: "Replies", exact: true }).first().click();
    await settle();
    return {
      width,
      samples: samples.frames.length,
      frameP95Ms: percentile(samples.frames.slice(1), 0.95),
      worstFrameMs: Math.max(...samples.frames.slice(1)),
      keydownToNextFrameP95Ms: percentile(samples.keyLatency, 0.95),
    };
  } finally {
    await metrics
      .evaluate((sample) => {
        sample.running = false;
      })
      .catch(() => {});
    await metrics.dispose();
  }
}
