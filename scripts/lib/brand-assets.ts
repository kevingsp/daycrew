function iconAssets(directory: string) {
  return {
    mac: `${directory}/macos-1024.png`,
    universal: `${directory}/universal-1024.png`,
    windows: `${directory}/daycrew.ico`,
    web: {
      "favicon.ico": `${directory}/daycrew.ico`,
      "favicon-16x16.png": `${directory}/favicon-16x16.png`,
      "favicon-32x32.png": `${directory}/favicon-32x32.png`,
      "apple-touch-icon.png": `${directory}/apple-touch-icon.png`,
      "icon-192x192.png": `${directory}/icon-192x192.png`,
      "icon-512x512.png": `${directory}/daycrew.png`,
    },
  };
}

const production = iconAssets("assets/daycrew");

export const BRAND_ASSET_PATHS = {
  development: iconAssets("assets/daycrew/dev"),
  nightly: production,
  production,
} as const;

export type WebAssetBrand = keyof typeof BRAND_ASSET_PATHS;

export const WEB_ASSET_CHANNELS = ["latest", "nightly"] as const;

export type WebAssetChannel = (typeof WEB_ASSET_CHANNELS)[number];

export function resolveWebAssetBrandForChannel(channel: WebAssetChannel): WebAssetBrand {
  return channel === "nightly" ? "nightly" : "production";
}

export function resolveWebIconOverrides(brand: WebAssetBrand, targetDirectory: string) {
  return Object.entries(BRAND_ASSET_PATHS[brand].web).map(([filename, sourceRelativePath]) => ({
    sourceRelativePath,
    targetRelativePath: `${targetDirectory}/${filename}`,
  }));
}
