#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Command, Flag } from "effect/cli";
import sharp from "sharp";
import { BRAND_ASSET_PATHS, resolveWebIconOverrides } from "./lib/brand-assets.ts";
import { encodePngIco, WINDOWS_ICON_SIZES } from "./lib/icon-export.ts";

const svgCanvas = (body: string, viewBox = "0 0 1024 1024") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">${body}</svg>`;

const svgBody = (source: string) => source.trim().replace(/^<svg[^>]*>|<\/svg>$/g, "");

function svgLayer(source: string, name: string) {
  const layer = source.match(new RegExp(`<g id="${name}">([\\s\\S]*?)</g>(?=\\s*(?:<g id=|$))`));
  if (!layer?.[1]) throw new Error(`Missing ${name} layer in the Daycrew SVG.`);
  return layer[1];
}

const renderPng = (svg: string, size: number) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

const resizePng = (image: Buffer, size: number) => sharp(image).resize(size, size).png().toBuffer();

function renderMacIcon(svg: string) {
  const body = svgBody(svg);
  return renderPng(
    svgCanvas(`
      <defs>
        <clipPath id="mac-mask"><rect x="100" y="100" width="824" height="824" rx="184"/></clipPath>
        <filter id="mac-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="17"/>
        </filter>
      </defs>
      <rect x="100" y="113" width="824" height="824" rx="184" fill="#050619" opacity=".35" filter="url(#mac-shadow)"/>
      <g clip-path="url(#mac-mask)">
        <g transform="translate(100 100) scale(.8046875)">${body}</g>
      </g>
    `),
    1024,
  );
}

function renderRoundedIcon(svg: string) {
  return renderPng(
    svgCanvas(`
      <defs><clipPath id="icon-mask"><rect width="1024" height="1024" rx="210"/></clipPath></defs>
      <g clip-path="url(#icon-mask)">${svgBody(svg)}</g>
    `),
    1024,
  );
}

async function makeAndroidSplash(background: string, relay: string) {
  const size = 1152;
  const [back, front] = await Promise.all([renderPng(background, size), renderPng(relay, size)]);
  return sharp(back)
    .composite([{ input: front }])
    .png()
    .toBuffer();
}

const exportIcons = Effect.fn("exportBrandIcons")(function* (check: boolean, androidOnly: boolean) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dirname, "..");
  const readSource = (filename: string) =>
    fs.readFileString(path.join(root, "assets/daycrew", filename));
  const source = svgBody(yield* readSource("daycrew.svg"));
  const devHorizon = svgBody(yield* readSource("dev-horizon.svg"));
  const monochrome = yield* readSource("relay-monochrome.svg");
  const defs = source.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
  if (!defs) throw new Error("Missing gradients in the Daycrew SVG.");
  const sky = svgLayer(source, "sky");
  const relay = svgLayer(source, "relay");
  const horizons = { production: svgLayer(source, "horizon"), development: devHorizon };
  const outputs = new Map<string, Buffer>();

  for (const brand of ["production", "development"] as const) {
    const assets = BRAND_ASSET_PATHS[brand];
    const horizon = horizons[brand];
    const icon = svgCanvas(defs + sky + horizon + relay);
    if (!androidOnly) {
      const rounded = yield* Effect.promise(() => renderRoundedIcon(icon));
      const [universal, mac, ...icoImages] = yield* Effect.promise(() =>
        Promise.all([
          renderPng(icon, 1024),
          renderMacIcon(icon),
          ...WINDOWS_ICON_SIZES.map(async (size) => ({
            size,
            contents: await resizePng(rounded, size),
          })),
        ] as const),
      );
      outputs.set(assets.universal, universal);
      outputs.set(assets.mac, mac);
      outputs.set(assets.windows, encodePngIco(icoImages));
      outputs.set(assets.web["favicon-16x16.png"], icoImages[0].contents);
      outputs.set(assets.web["favicon-32x32.png"], icoImages[2].contents);
      for (const [filename, size] of [
        ["apple-touch-icon.png", 180],
        ["icon-192x192.png", 192],
        ["icon-512x512.png", 512],
      ] as const) {
        outputs.set(assets.web[filename], yield* Effect.promise(() => resizePng(rounded, size)));
      }
    }

    const androidVariant = brand === "development" ? "dev" : "prod";
    const mobileAssets = "apps/mobile/assets";
    const androidViewBox = "-220 -220 1464 1464";
    const androidRelay = svgCanvas(defs + relay, androidViewBox);
    const androidBackground = svgCanvas(defs + sky + horizon);
    const [background, splash] = yield* Effect.promise(() =>
      Promise.all([
        renderPng(androidBackground, 432),
        makeAndroidSplash(androidBackground, androidRelay),
      ]),
    );
    outputs.set(`${mobileAssets}/android-icon-background-${androidVariant}.png`, background);
    outputs.set(`${mobileAssets}/android-splash-icon-${androidVariant}.png`, splash);

    if (brand === "production") {
      const [foreground, themed, notification] = yield* Effect.promise(() =>
        Promise.all([
          renderPng(androidRelay, 432),
          renderPng(svgCanvas(svgBody(monochrome), androidViewBox), 432),
          renderPng(monochrome, 96),
        ]),
      );
      outputs.set(`${mobileAssets}/android-icon-foreground.png`, foreground);
      outputs.set(`${mobileAssets}/android-icon-mark.png`, themed);
      outputs.set(`${mobileAssets}/android-notification-icon.png`, notification);
      if (!androidOnly) outputs.set(`${mobileAssets}/widget/T3Mark.svg`, Buffer.from(monochrome));
    }
  }

  if (!androidOnly) {
    for (const { sourceRelativePath, targetRelativePath } of resolveWebIconOverrides(
      "production",
      "apps/web/public",
    )) {
      outputs.set(targetRelativePath, outputs.get(sourceRelativePath)!);
    }
  }

  const stale: string[] = [];
  for (const [relativePath, expected] of outputs) {
    const target = path.join(root, relativePath);
    if (check) {
      const actual = yield* fs.readFile(target).pipe(Effect.orElseSucceed(() => new Uint8Array()));
      if (!expected.equals(actual)) stale.push(relativePath);
    } else {
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFile(target, expected);
    }
  }
  if (stale.length > 0) throw new Error(`Run vp run icons:export to refresh: ${stale.join(", ")}`);
  yield* Console.log(`${check ? "Verified" : "Exported"} ${outputs.size} Daycrew brand assets.`);
});

const command = Command.make(
  "export-brand-icons",
  {
    check: Flag.Boolean("check").pipe(Flag.withDefault(false)),
    android: Flag.Boolean("android").pipe(Flag.withDefault(false)),
  },
  ({ check, android }) => exportIcons(check, android),
);

if (import.meta.main) {
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
