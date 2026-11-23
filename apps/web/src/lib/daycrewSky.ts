import "culori/css";
import { converter, parse } from "culori/fn";
import type { CSSProperties } from "react";

export type DaycrewSkyPhase =
  | "night"
  | "dawn"
  | "morning"
  | "day"
  | "golden-hour"
  | "dusk"
  | "twilight";

export type DaycrewSkyPolarity = "dark" | "light";
export type DaycrewSkyAppearance = "light" | "dark";

export interface DaycrewSkyStop {
  readonly hour: number;
  readonly top: string;
  readonly base: string;
  readonly light: string;
  readonly x: number;
  readonly y: number;
  readonly reach: number;
}

export interface DaycrewSkySamples {
  readonly top: string;
  readonly mid: string;
  readonly base: string;
  readonly glowPeak: string;
  readonly glowTop: string;
}

export interface DaycrewSkyTokens {
  readonly "--sky-top": string;
  readonly "--sky-base": string;
  readonly "--sky-light": string;
  readonly "--sky-x": string;
  readonly "--sky-y": string;
  readonly "--sky-reach": string;
  readonly "--sky-scrim-color": string;
  readonly "--sky-scrim-opacity": string;
  readonly "--sky-ink": string;
  readonly "--sky-ink-secondary": string;
  readonly "--sky-ink-tertiary": string;
  readonly "--sky-ink-inverse": string;
  readonly "--sky-text-shadow": string;
  readonly "--sky-hairline": string;
  readonly "--sky-border-strong": string;
  readonly "--sky-glass-l1-opacity": string;
  readonly "--sky-glass-l2-opacity": string;
  readonly "--sky-glass-l3-opacity": string;
  readonly "--sky-accent": string;
  readonly "--sky-accent-ink": string;
  readonly "--sky-accent-hover": string;
  readonly "--sky-accent-active": string;
  readonly "--sky-accent-selected": string;
  readonly "--sky-accent-border": string;
  readonly "--sky-exposed-focus-ring": string;
  readonly "--sky-glass-focus-ring": string;
  readonly "--sky-warning-ink": string;
  readonly "--sky-error-ink": string;
  readonly "--sky-diff-addition-ink": string;
  readonly "--sky-diff-blue-ink": string;
}

export interface DaycrewSkyResolution {
  readonly minute: number;
  readonly phase: DaycrewSkyPhase;
  readonly polarity: DaycrewSkyPolarity;
  readonly appearance: DaycrewSkyAppearance;
  readonly samePolarity: boolean;
  readonly scrimOpacity: number;
  readonly rawSamples: DaycrewSkySamples;
  readonly compositedSamples: DaycrewSkySamples;
  readonly glassSamples: DaycrewSkySamples;
  readonly glassAccentInk: string;
  readonly tokens: DaycrewSkyTokens;
  readonly style: CSSProperties;
}

interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface OklchColor {
  readonly L: number;
  readonly C: number;
  readonly h: number;
}

interface OklabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

interface AccentStop {
  readonly hour: number;
  readonly L: number;
  readonly C: number;
  readonly h: number;
}

declare global {
  interface Window {
    __DAYCREW_SKY_MINUTE__?: number;
  }
}

// At dusk and dawn both bodies pass below the horizon before the new one rises.
const DAYCREW_SKY_STOPS: readonly DaycrewSkyStop[] = [
  { hour: 0, top: "#0c0b21", base: "#28204e", light: "#8070a9", x: 89, y: 39, reach: 44 },
  { hour: 4, top: "#19132e", base: "#4a294f", light: "#a37199", x: 14, y: 106, reach: 48 },
  { hour: 5, top: "#85617c", base: "#c58e8b", light: "#f5b27a", x: 12, y: 166, reach: 62 },
  { hour: 7, top: "#e9bcad", base: "#f8d6ab", light: "#fff1b3", x: 14, y: 91, reach: 67 },
  { hour: 12, top: "#f1d9b8", base: "#fff0d0", light: "#fff8a5", x: 48, y: -6, reach: 79 },
  { hour: 16, top: "#e3b4a4", base: "#f6ce99", light: "#ffdf89", x: 71, y: 53, reach: 68 },
  { hour: 18, top: "#bb7d91", base: "#d68d78", light: "#ffd58a", x: 77, y: 99, reach: 63 },
  { hour: 19, top: "#3a1d43", base: "#60334e", light: "#e39370", x: 72, y: 109, reach: 66 },
  { hour: 20, top: "#19132e", base: "#44294f", light: "#b678a5", x: 90, y: 165, reach: 55 },
  { hour: 22, top: "#100d24", base: "#30234b", light: "#9784b8", x: 97, y: 97, reach: 47 },
];

const MIDNIGHT_SKY_STOP: DaycrewSkyStop = { ...DAYCREW_SKY_STOPS[0]!, hour: 24 };

// Dusk-to-dawn adaptive accent anchors interpolated in OKLab across 24 hours.
const ACCENT_STOPS: readonly AccentStop[] = [
  { hour: 0, L: 0.64, C: 0.13, h: 296 },
  { hour: 4, L: 0.63, C: 0.125, h: 319 },
  { hour: 5, L: 0.65, C: 0.135, h: 12 },
  { hour: 6, L: 0.64, C: 0.13, h: 37 },
  { hour: 7, L: 0.62, C: 0.13, h: 69 },
  { hour: 12, L: 0.62, C: 0.135, h: 80 },
  { hour: 15, L: 0.62, C: 0.135, h: 80 },
  { hour: 16.5, L: 0.63, C: 0.135, h: 56 },
  { hour: 18.25, L: 0.62, C: 0.14, h: 40 },
  { hour: 19.5, L: 0.63, C: 0.13, h: 343 },
  { hour: 22, L: 0.64, C: 0.13, h: 296 },
];

const MIDNIGHT_ACCENT_STOP: AccentStop = { ...ACCENT_STOPS[0]!, hour: 24 };

const MINUTES_PER_DAY = 1440;
const GLOW_PEAK_ALPHA = 0.66;
const HOVER_TINT_ALPHA = 0.11;
const SELECTED_TINT_ALPHA = 0.18;
const DARK_SCRIM_HEX = "#050619";
const LIGHT_SCRIM_HEX = "#fff8ef";
const DARK_SCRIM_RGB: RgbColor = { r: 5, g: 6, b: 25 };
const LIGHT_SCRIM_RGB: RgbColor = { r: 255, g: 248, b: 239 };
const DARK_SKY_INK_SEED: RgbColor = { r: 250, g: 249, b: 255 };
const LIGHT_SKY_INK_SEED: RgbColor = { r: 18, g: 20, b: 38 };
const INVERSE_WHITE_RGB: RgbColor = { r: 255, g: 255, b: 255 };
const INVERSE_DARK_RGB: RgbColor = { r: 16, g: 18, b: 34 };
const LIGHT_GLASS_BASE_RGB: RgbColor = { r: 255, g: 255, b: 255 };
const DARK_GLASS_BASE_RGB: RgbColor = { r: 12, g: 12, b: 14 };
const LIGHT_SIDEBAR_RGB: RgbColor = { r: 250, g: 250, b: 250 };
const DARK_SIDEBAR_RGB: RgbColor = { r: 12, g: 12, b: 14 };

const convertToRgb = converter("rgb");

function normalizeMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0;
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number, precision: number): string {
  const rounded = Math.abs(value) < 10 ** -precision / 2 ? 0 : value;
  return rounded.toFixed(precision).replace(/(?:\.0+|(?:(\.[0-9]*?)0+))$/, "$1");
}

function parseColorRgba(value: string): { rgb: RgbColor; alpha: number } | null {
  const parsed = parse(value.trim());
  if (!parsed) return null;
  const converted = convertToRgb(parsed);
  if (!converted) return null;
  return {
    rgb: {
      r: clamp((converted.r ?? 0) * 255, 0, 255),
      g: clamp((converted.g ?? 0) * 255, 0, 255),
      b: clamp((converted.b ?? 0) * 255, 0, 255),
    },
    alpha: clamp(converted.alpha ?? 1, 0, 1),
  };
}

function parseHexRgb(hex: string): RgbColor {
  const parsed = parseColorRgba(hex);
  return parsed ? parsed.rgb : { r: 0, g: 0, b: 0 };
}

function rgbToHex(color: RgbColor): string {
  const toByte = (channel: number) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
}

function rgbToRgbaString(color: RgbColor, alpha: number): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  return `rgb(${r} ${g} ${b} / ${formatNumber(clamp(alpha, 0, 1), 3)})`;
}

function mixRgb(base: RgbColor, overlay: RgbColor, amount: number): RgbColor {
  const t = clamp(amount, 0, 1);
  return {
    r: base.r + (overlay.r - base.r) * t,
    g: base.g + (overlay.g - base.g) * t,
    b: base.b + (overlay.b - base.b) * t,
  };
}

function srgbToLinear(channel: number): number {
  const c = clamp(channel / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
}

function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
  );
}

function contrastRatioRgb(first: RgbColor, second: RgbColor): number {
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function compositeSkyColor(foreground: string, background: string): string {
  const fg = parseColorRgba(foreground);
  const bg = parseColorRgba(background);
  if (!fg || !bg) return background;
  return rgbToHex(mixRgb(bg.rgb, fg.rgb, fg.alpha));
}

export function skyContrastRatio(foreground: string, background: string): number {
  const fg = parseColorRgba(foreground);
  const bg = parseColorRgba(background);
  if (!fg || !bg) return 1;
  const effectiveFg = fg.alpha < 1 ? mixRgb(bg.rgb, fg.rgb, fg.alpha) : fg.rgb;
  return contrastRatioRgb(effectiveFg, bg.rgb);
}

function oklchToOklab(color: OklchColor): OklabColor {
  const radians = (color.h * Math.PI) / 180;
  return {
    L: color.L,
    a: color.C * Math.cos(radians),
    b: color.C * Math.sin(radians),
  };
}

function oklabToOklch(color: OklabColor): OklchColor {
  const C = Math.hypot(color.a, color.b);
  const h = C < 1e-6 ? 0 : ((Math.atan2(color.b, color.a) * 180) / Math.PI + 360) % 360;
  return { L: color.L, C, h };
}

function oklchToLinearRgb({ L, C, h }: OklchColor): { r: number; g: number; b: number } {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const bb = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function mapOklchToSrgbGamut(color: OklchColor): OklchColor {
  const inGamut = (C: number) => {
    const linear = oklchToLinearRgb({ ...color, C });
    return (
      linear.r >= -0.0001 &&
      linear.r <= 1.0001 &&
      linear.g >= -0.0001 &&
      linear.g <= 1.0001 &&
      linear.b >= -0.0001 &&
      linear.b <= 1.0001
    );
  };
  if (inGamut(color.C)) return color;
  let low = 0;
  let high = color.C;
  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    if (inGamut(mid)) low = mid;
    else high = mid;
  }
  return { ...color, C: low };
}

function oklchToRgb(color: OklchColor): RgbColor {
  const linear = oklchToLinearRgb(mapOklchToSrgbGamut(color));
  return {
    r: linearToSrgb(linear.r),
    g: linearToSrgb(linear.g),
    b: linearToSrgb(linear.b),
  };
}

function solveOklchLightness(
  base: OklchColor,
  surfaces: readonly RgbColor[],
  minContrast: number,
  direction: "lighter" | "darker",
): OklchColor {
  const contrastOf = (candidate: OklchColor) => {
    const rgb = oklchToRgb(candidate);
    return Math.min(...surfaces.map((surface) => contrastRatioRgb(rgb, surface)));
  };
  if (contrastOf(base) >= minContrast) return base;
  let low = direction === "lighter" ? base.L : 0;
  let high = direction === "lighter" ? 1 : base.L;
  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2;
    if (contrastOf({ ...base, L: mid }) >= minContrast) {
      if (direction === "lighter") high = mid;
      else low = mid;
    } else if (direction === "lighter") {
      low = mid;
    } else {
      high = mid;
    }
  }
  return { ...base, L: direction === "lighter" ? high : low };
}

function resolveSkyPhase(hour: number): DaycrewSkyPhase {
  if (hour < 4.5 || hour >= 20.5) return "night";
  if (hour < 6.5) return "dawn";
  if (hour < 10) return "morning";
  if (hour < 16) return "day";
  if (hour < 18) return "golden-hour";
  if (hour < 19.25) return "dusk";
  return "twilight";
}

function interpolateAccentSeed(hour: number): OklchColor {
  const index = ACCENT_STOPS.findLastIndex((stop) => stop.hour <= hour);
  const from = ACCENT_STOPS[Math.max(0, index)]!;
  const to = ACCENT_STOPS[index + 1] ?? MIDNIGHT_ACCENT_STOP;
  const fraction = clamp((hour - from.hour) / (to.hour - from.hour), 0, 1);
  const fromLab = oklchToOklab(from);
  const toLab = oklchToOklab(to);
  const mixed = oklabToOklch({
    L: fromLab.L + (toLab.L - fromLab.L) * fraction,
    a: fromLab.a + (toLab.a - fromLab.a) * fraction,
    b: fromLab.b + (toLab.b - fromLab.b) * fraction,
  });
  return {
    L: mixed.L,
    C: Math.max(0.06, mixed.C),
    h: mixed.C < 0.01 ? (fraction < 0.5 ? from.h : to.h) : mixed.h,
  };
}

function solveMinimumScrimOpacity(
  polarity: DaycrewSkyPolarity,
  coreSamples: readonly RgbColor[],
  allSamples: readonly RgbColor[],
  tint: RgbColor,
): number {
  const scrimRgb = polarity === "dark" ? DARK_SCRIM_RGB : LIGHT_SCRIM_RGB;
  const inkSeed = polarity === "dark" ? DARK_SKY_INK_SEED : LIGHT_SKY_INK_SEED;
  const satisfies = (alpha: number) => {
    const compositedCore = coreSamples.map((sample) => mixRgb(sample, scrimRgb, alpha));
    const compositedAll = allSamples.map((sample) => mixRgb(sample, scrimRgb, alpha));
    const coreMin = Math.min(...compositedCore.map((sample) => contrastRatioRgb(inkSeed, sample)));
    const allMin = Math.min(...compositedAll.map((sample) => contrastRatioRgb(inkSeed, sample)));
    const selectedMin = Math.min(
      ...compositedAll.map((sample) =>
        contrastRatioRgb(inkSeed, mixRgb(sample, tint, SELECTED_TINT_ALPHA)),
      ),
    );
    return coreMin >= 7.0 && allMin >= 5.35 && selectedMin >= 4.75;
  };
  if (satisfies(0)) return 0;
  let low = 0;
  let high = 0.55;
  for (let step = 0; step < 20; step += 1) {
    const mid = (low + high) / 2;
    if (satisfies(mid)) high = mid;
    else low = mid;
  }
  return Math.min(0.55, Math.ceil(high * 100) / 100);
}

function solveFilledAccent(
  seed: OklchColor,
  polarity: DaycrewSkyPolarity,
): { accentRgb: RgbColor; inverseInkRgb: RgbColor } {
  const initialL = polarity === "dark" ? Math.max(0.72, seed.L) : Math.min(0.46, seed.L);
  const candidate: OklchColor = { L: initialL, C: Math.max(0.1, seed.C), h: seed.h };
  const evaluate = (color: OklchColor) => {
    const rgb = oklchToRgb(color);
    const whiteContrast = contrastRatioRgb(INVERSE_WHITE_RGB, rgb);
    const darkContrast = contrastRatioRgb(INVERSE_DARK_RGB, rgb);
    return whiteContrast >= darkContrast
      ? { rgb, inverse: INVERSE_WHITE_RGB, contrast: whiteContrast }
      : { rgb, inverse: INVERSE_DARK_RGB, contrast: darkContrast };
  };
  const initial = evaluate(candidate);
  if (initial.contrast >= 4.7) {
    return { accentRgb: initial.rgb, inverseInkRgb: initial.inverse };
  }
  const direction = polarity === "dark" ? "lighter" : "darker";
  const targetInverse = polarity === "dark" ? INVERSE_DARK_RGB : INVERSE_WHITE_RGB;
  const solved = solveOklchLightness(candidate, [targetInverse], 4.8, direction);
  return { accentRgb: oklchToRgb(solved), inverseInkRgb: targetInverse };
}

export function readDaycrewSkyMinuteOverride(): number | null {
  if (typeof window === "undefined") return null;
  const globalOverride = window.__DAYCREW_SKY_MINUTE__;
  if (typeof globalOverride === "number" && Number.isFinite(globalOverride)) {
    return normalizeMinute(globalOverride);
  }
  try {
    const param = new URLSearchParams(window.location.search).get("skyMinute");
    if (param !== null && param.trim() !== "") {
      const parsed = Number(param);
      if (Number.isFinite(parsed)) {
        return normalizeMinute(parsed);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveDaycrewSky(
  minute: number,
  appearance: DaycrewSkyAppearance = "light",
): DaycrewSkyResolution {
  const normalizedMinute = normalizeMinute(minute);
  const hour = normalizedMinute / 60;
  const index = DAYCREW_SKY_STOPS.findLastIndex((stop) => stop.hour <= hour);
  const from = DAYCREW_SKY_STOPS[Math.max(0, index)]!;
  const to = DAYCREW_SKY_STOPS[index + 1] ?? MIDNIGHT_SKY_STOP;
  const fraction = clamp((hour - from.hour) / (to.hour - from.hour), 0, 1);

  const darkTint = appearance === "dark" ? 0.14 : 0;
  const skyColor = (role: "top" | "base" | "light") =>
    mixRgb(
      mixRgb(parseHexRgb(from[role]), parseHexRgb(to[role]), fraction),
      DARK_SCRIM_RGB,
      darkTint,
    );
  const rawTopRgb = skyColor("top");
  const rawBaseRgb = skyColor("base");
  const rawLightRgb = skyColor("light");
  const rawMidRgb = mixRgb(rawTopRgb, rawBaseRgb, 0.5);
  const rawGlowPeakRgb = mixRgb(rawBaseRgb, rawLightRgb, GLOW_PEAK_ALPHA);
  const rawGlowTopRgb = mixRgb(rawTopRgb, rawLightRgb, GLOW_PEAK_ALPHA);

  const rawCoreSamples = [rawTopRgb, rawMidRgb, rawBaseRgb] as const;
  const rawAllSamples = [...rawCoreSamples, rawGlowPeakRgb, rawGlowTopRgb] as const;

  const darkSkyWorst = Math.min(
    ...rawAllSamples.map((sample) => contrastRatioRgb(DARK_SKY_INK_SEED, sample)),
  );
  const lightSkyWorst = Math.min(
    ...rawAllSamples.map((sample) => contrastRatioRgb(LIGHT_SKY_INK_SEED, sample)),
  );
  const polarity: DaycrewSkyPolarity = darkSkyWorst >= lightSkyWorst ? "dark" : "light";
  const phase = resolveSkyPhase(hour);
  const accentSeed = interpolateAccentSeed(hour);
  const tintBaseRgb = oklchToRgb({
    L: polarity === "dark" ? 0.78 : 0.48,
    C: Math.min(0.14, accentSeed.C + 0.015),
    h: accentSeed.h,
  });

  const scrimOpacity = solveMinimumScrimOpacity(
    polarity,
    rawCoreSamples,
    rawAllSamples,
    tintBaseRgb,
  );
  const scrimColorHex = polarity === "dark" ? DARK_SCRIM_HEX : LIGHT_SCRIM_HEX;
  const scrimRgb = polarity === "dark" ? DARK_SCRIM_RGB : LIGHT_SCRIM_RGB;

  const compositedTopRgb = mixRgb(rawTopRgb, scrimRgb, scrimOpacity);
  const compositedMidRgb = mixRgb(rawMidRgb, scrimRgb, scrimOpacity);
  const compositedBaseRgb = mixRgb(rawBaseRgb, scrimRgb, scrimOpacity);
  const compositedGlowPeakRgb = mixRgb(rawGlowPeakRgb, scrimRgb, scrimOpacity);
  const compositedGlowTopRgb = mixRgb(rawGlowTopRgb, scrimRgb, scrimOpacity);
  const compositedCoreSamples = [compositedTopRgb, compositedMidRgb, compositedBaseRgb] as const;
  const compositedAllSamples = [
    ...compositedCoreSamples,
    compositedGlowPeakRgb,
    compositedGlowTopRgb,
  ] as const;

  const direction = polarity === "dark" ? "lighter" : "darker";

  const timelineSurfaces = [
    ...compositedAllSamples,
    ...compositedAllSamples.map((sample) => mixRgb(sample, tintBaseRgb, HOVER_TINT_ALPHA)),
  ];
  const timelineInk = (hue: number) =>
    rgbToHex(
      oklchToRgb(
        solveOklchLightness(
          { L: polarity === "dark" ? 0.81 : 0.38, C: 0.15, h: hue },
          timelineSurfaces,
          4.8,
          direction,
        ),
      ),
    );

  const samePolarity = appearance === polarity;
  const glassL1Percent = samePolarity ? 76 : 89;
  const glassL2Percent = samePolarity ? 80 : 92;
  const glassL3Percent = samePolarity ? 84 : 94;
  const glassBaseRgb = appearance === "dark" ? DARK_GLASS_BASE_RGB : LIGHT_GLASS_BASE_RGB;
  const glassL2Fraction = glassL2Percent / 100;
  const glassSampleRgbs = compositedAllSamples.map((sample) =>
    mixRgb(sample, glassBaseRgb, glassL2Fraction),
  );

  // Solve primary ink for >= 7.0:1 across core sky gradient and >= 5.2:1 over glow peak.
  const primarySeed: OklchColor = {
    L: polarity === "dark" ? 0.985 : 0.17,
    C: 0.012,
    h: 270,
  };
  const primaryForCore = solveOklchLightness(primarySeed, compositedCoreSamples, 7.05, direction);
  const primaryForAll = solveOklchLightness(primarySeed, compositedAllSamples, 5.2, direction);
  const primaryInkRgb = oklchToRgb({
    ...primarySeed,
    L:
      direction === "lighter"
        ? Math.max(primaryForCore.L, primaryForAll.L)
        : Math.min(primaryForCore.L, primaryForAll.L),
  });

  const secondaryInkRgb = oklchToRgb(
    solveOklchLightness(
      { L: polarity === "dark" ? 0.85 : 0.34, C: 0.018, h: accentSeed.h },
      compositedAllSamples,
      4.7,
      direction,
    ),
  );
  const tertiaryInkRgb = oklchToRgb(
    solveOklchLightness(
      { L: polarity === "dark" ? 0.72 : 0.45, C: 0.018, h: accentSeed.h },
      compositedAllSamples,
      3.3,
      direction,
    ),
  );
  const borderStrongRgb = oklchToRgb(
    solveOklchLightness(
      { L: polarity === "dark" ? 0.68 : 0.44, C: 0.024, h: accentSeed.h },
      compositedAllSamples,
      3.2,
      direction,
    ),
  );

  const { accentRgb, inverseInkRgb } = solveFilledAccent(accentSeed, polarity);
  const skyAccentInkSurfaces = samePolarity
    ? [...compositedAllSamples, ...glassSampleRgbs]
    : compositedAllSamples;
  const accentInkRgb = oklchToRgb(
    solveOklchLightness(
      { L: polarity === "dark" ? 0.84 : 0.36, C: Math.max(0.09, accentSeed.C), h: accentSeed.h },
      skyAccentInkSurfaces,
      4.7,
      direction,
    ),
  );

  const glassDirection = appearance === "dark" ? "lighter" : "darker";
  const glassAccentInkRgb = samePolarity
    ? accentInkRgb
    : oklchToRgb(
        solveOklchLightness(
          {
            L: appearance === "dark" ? 0.8 : 0.38,
            C: Math.max(0.09, accentSeed.C),
            h: accentSeed.h,
          },
          glassSampleRgbs,
          4.7,
          glassDirection,
        ),
      );

  const focusRingRgb = oklchToRgb(
    solveOklchLightness(
      { L: polarity === "dark" ? 0.78 : 0.44, C: Math.max(0.12, accentSeed.C), h: accentSeed.h },
      compositedAllSamples,
      3.25,
      direction,
    ),
  );

  const sidebarSurfaceRgb = appearance === "dark" ? DARK_SIDEBAR_RGB : LIGHT_SIDEBAR_RGB;
  const shellFocusRingRgb = oklchToRgb(
    solveOklchLightness(
      {
        L: appearance === "dark" ? 0.74 : 0.46,
        C: Math.max(0.12, accentSeed.C),
        h: accentSeed.h,
      },
      [sidebarSurfaceRgb, ...glassSampleRgbs],
      3.25,
      glassDirection,
    ),
  );

  const x = from.x + (to.x - from.x) * fraction;
  const y = from.y + (to.y - from.y) * fraction;
  const reach = from.reach + (to.reach - from.reach) * fraction;

  const tokens: DaycrewSkyTokens = {
    "--sky-top": rgbToHex(rawTopRgb),
    "--sky-base": rgbToHex(rawBaseRgb),
    "--sky-light": rgbToHex(rawLightRgb),
    "--sky-x": `${formatNumber(x, 2)}%`,
    "--sky-y": `${formatNumber(y, 2)}%`,
    "--sky-reach": `${formatNumber(reach, 2)}%`,
    "--sky-scrim-color": scrimColorHex,
    "--sky-scrim-opacity": formatNumber(scrimOpacity, 3),
    "--sky-ink": rgbToHex(primaryInkRgb),
    "--sky-ink-secondary": rgbToHex(secondaryInkRgb),
    "--sky-ink-tertiary": rgbToHex(tertiaryInkRgb),
    "--sky-ink-inverse": rgbToHex(inverseInkRgb),
    "--sky-text-shadow": polarity === "dark" ? "rgb(11 14 34 / 0.56)" : "rgb(255 255 255 / 0.52)",
    "--sky-hairline":
      polarity === "dark"
        ? rgbToRgbaString(primaryInkRgb, 0.2)
        : rgbToRgbaString(primaryInkRgb, 0.16),
    "--sky-border-strong": rgbToHex(borderStrongRgb),
    "--sky-glass-l1-opacity": `${glassL1Percent}%`,
    "--sky-glass-l2-opacity": `${glassL2Percent}%`,
    "--sky-glass-l3-opacity": `${glassL3Percent}%`,
    "--sky-accent": rgbToHex(accentRgb),
    "--sky-accent-ink": rgbToHex(accentInkRgb),
    "--sky-accent-hover": rgbToRgbaString(tintBaseRgb, HOVER_TINT_ALPHA),
    "--sky-accent-active": rgbToRgbaString(tintBaseRgb, 0.17),
    "--sky-accent-selected": rgbToRgbaString(tintBaseRgb, SELECTED_TINT_ALPHA),
    "--sky-accent-border": rgbToRgbaString(tintBaseRgb, 0.36),
    "--sky-exposed-focus-ring": rgbToHex(focusRingRgb),
    "--sky-glass-focus-ring": rgbToHex(shellFocusRingRgb),
    "--sky-warning-ink": timelineInk(65),
    "--sky-error-ink": timelineInk(24),
    "--sky-diff-addition-ink": timelineInk(152),
    "--sky-diff-blue-ink": timelineInk(254),
  };

  return {
    minute: normalizedMinute,
    phase,
    polarity,
    appearance,
    samePolarity,
    scrimOpacity,
    rawSamples: {
      top: rgbToHex(rawTopRgb),
      mid: rgbToHex(rawMidRgb),
      base: rgbToHex(rawBaseRgb),
      glowPeak: rgbToHex(rawGlowPeakRgb),
      glowTop: rgbToHex(rawGlowTopRgb),
    },
    compositedSamples: {
      top: rgbToHex(compositedTopRgb),
      mid: rgbToHex(compositedMidRgb),
      base: rgbToHex(compositedBaseRgb),
      glowPeak: rgbToHex(compositedGlowPeakRgb),
      glowTop: rgbToHex(compositedGlowTopRgb),
    },
    glassSamples: {
      top: rgbToHex(glassSampleRgbs[0]!),
      mid: rgbToHex(glassSampleRgbs[1]!),
      base: rgbToHex(glassSampleRgbs[2]!),
      glowPeak: rgbToHex(glassSampleRgbs[3]!),
      glowTop: rgbToHex(glassSampleRgbs[4]!),
    },
    glassAccentInk: rgbToHex(glassAccentInkRgb),
    tokens,
    style: { ...tokens, "--sky-focus-ring": tokens["--sky-glass-focus-ring"] } as CSSProperties,
  };
}
