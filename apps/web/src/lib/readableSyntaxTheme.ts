import { getResolvedOrResolveTheme, registerCustomTheme, type DiffsTheme } from "@pierre/diffs";

/** pierre-light with every syntax color darkened until it reads on every light code surface. */
export const READABLE_LIGHT_THEME_NAME = "t3-light";
export const READABLE_DARK_THEME_NAME = "t3-dark";

const MIN_CONTRAST = 4.5;
// The darkest light code surface is a changed word on a deleted line (#f8d3d4, luminance
// 0.71), rounded down for margin.
const DARKEST_SURFACE_LUMINANCE = 0.69;
// 80% dark code glass over white is #3d3c44. Round its luminance up for margin.
const BRIGHTEST_DARK_SURFACE_LUMINANCE = 0.05;

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map(channelLuminance) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readableOnCode(color: string, surface: "light" | "dark", minContrast: number): string {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!match) return color;
  const contrast = (rgb: readonly [number, number, number]) =>
    surface === "light"
      ? (DARKEST_SURFACE_LUMINANCE + 0.05) / (luminance(rgb) + 0.05)
      : (luminance(rgb) + 0.05) / (BRIGHTEST_DARK_SURFACE_LUMINANCE + 0.05);
  let rgb = [0, 2, 4].map((start) => Number.parseInt(match[1]!.slice(start, start + 2), 16)) as [
    number,
    number,
    number,
  ];
  if (contrast(rgb) >= minContrast) return color;
  while (contrast(rgb) < minContrast) {
    rgb = rgb.map((channel) =>
      surface === "light" ? Math.floor(channel * 0.96) : Math.ceil(channel * 0.96 + 255 * 0.04),
    ) as [number, number, number];
  }
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}${match[2] ?? ""}`;
}

export function readableOnLightCode(color: string, minContrast = MIN_CONTRAST): string {
  return readableOnCode(color, "light", minContrast);
}

type ZedTheme = NonNullable<DiffsTheme["zed"]>;

// Pairs that differ only in lightness would merge at one floor. The darker color of each pair
// goes further, keeping pierre-light's order: numbers stay darker than operators, punctuation
// darker than comments, and decorators darker than property names.
const FURTHER_COLORS = new Set(["#1ca1c7", "#636363", "#1a85d4"]);
const FURTHER_MIN_CONTRAST = 6;

/** The t3-light color for a pierre-light syntax color. */
export function readableSyntaxColor(color: string): string {
  return readableOnLightCode(
    color,
    FURTHER_COLORS.has(color.toLowerCase()) ? FURTHER_MIN_CONTRAST : MIN_CONTRAST,
  );
}

function readableDarkSyntaxColor(color: string): string {
  return readableOnCode(color, "dark", color.toLowerCase() === "#737373" ? 5.25 : MIN_CONTRAST);
}

function withReadableSyntax(
  theme: ZedTheme,
  name: string,
  readableColor: (color: string) => string,
): ZedTheme {
  const syntax = Object.fromEntries(
    Object.entries(theme.style.syntax ?? {}).map(([scope, style]) => [
      scope,
      typeof style === "string"
        ? readableColor(style)
        : style.color
          ? { ...style, color: readableColor(style.color) }
          : style,
    ]),
  );
  return { ...theme, name, style: { ...theme.style, syntax } };
}

// Themes resolve on the main thread and reach the diff workers already resolved.
for (const [name, baseName, readableColor] of [
  [READABLE_LIGHT_THEME_NAME, "pierre-light", readableSyntaxColor],
  [READABLE_DARK_THEME_NAME, "pierre-dark", readableDarkSyntaxColor],
] as const) {
  registerCustomTheme(
    name,
    async () => {
      const base = await getResolvedOrResolveTheme(baseName, "highlights");
      if (!base.zed) throw new Error(`${baseName} has no Highlights palette`);
      return withReadableSyntax(base.zed, name, readableColor);
    },
    "zed",
  );
}
