import "culori/css";
import { converter, parse } from "culori/fn";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  compositeSkyColor,
  readDaycrewSkyMinuteOverride,
  resolveDaycrewSky,
  skyContrastRatio,
  type DaycrewSkyAppearance,
} from "./daycrewSky";

const toOklch = converter("oklch");

const ALL_SAMPLE_MINUTES = Array.from({ length: 1440 }, (_, minute) => minute);
const APPEARANCES: readonly DaycrewSkyAppearance[] = ["light", "dark"];

function hueDistance(a: number, b: number): number {
  const diff = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(diff, 360 - diff);
}

function parsePercent(value: string): number {
  return Number.parseFloat(value.replace("%", ""));
}

describe("resolveDaycrewSky", () => {
  it("guarantees WCAG AA contrast across all 24 hours, transitions, and appearances", () => {
    for (const appearance of APPEARANCES) {
      for (const minute of ALL_SAMPLE_MINUTES) {
        const sky = resolveDaycrewSky(minute, appearance);
        const { tokens, compositedSamples, glassSamples } = sky;
        const coreSamples = [compositedSamples.top, compositedSamples.mid, compositedSamples.base];
        const allSkySamples = Object.values(compositedSamples);
        const allGlassSamples = Object.values(glassSamples);

        // Primary ink >= 7.0:1 across core sky and strictly >= 4.5:1 over glow peak.
        for (const sample of coreSamples) {
          expect(
            skyContrastRatio(tokens["--sky-ink"], sample),
            `primary ink core contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(7.0);
        }
        expect(
          skyContrastRatio(tokens["--sky-ink"], compositedSamples.glowPeak),
          `primary ink glowPeak contrast at minute=${minute} (${appearance})`,
        ).toBeGreaterThanOrEqual(4.5);

        // Secondary ink >= 4.6:1, tertiary >= 3.2:1, accent-ink >= 4.5:1, focus ring & strong border >= 3.0:1.
        for (const sample of allSkySamples) {
          const hovered = compositeSkyColor(tokens["--sky-accent-hover"], sample);
          for (const ink of [
            "--sky-warning-ink",
            "--sky-error-ink",
            "--sky-diff-addition-ink",
            "--sky-diff-blue-ink",
          ] as const) {
            expect(skyContrastRatio(tokens[ink], sample), ink).toBeGreaterThanOrEqual(4.5);
            expect(skyContrastRatio(tokens[ink], hovered), ink).toBeGreaterThanOrEqual(4.5);
          }
          expect(
            skyContrastRatio(tokens["--sky-ink-secondary"], sample),
            `secondary ink contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(4.6);
          expect(
            skyContrastRatio(tokens["--sky-ink-tertiary"], sample),
            `tertiary ink contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(3.2);
          expect(
            skyContrastRatio(tokens["--sky-accent-ink"], sample),
            `accent ink sky contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            skyContrastRatio(tokens["--sky-exposed-focus-ring"], sample),
            `focus ring contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(3.0);
          expect(
            skyContrastRatio(tokens["--sky-border-strong"], sample),
            `strong border contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(3.0);

          for (const state of ["hover", "active", "selected"] as const) {
            const tintedSky = compositeSkyColor(tokens[`--sky-accent-${state}`], sample);
            expect(
              skyContrastRatio(tokens["--sky-ink"], tintedSky),
              `${state} sky ink contrast at minute=${minute} (${appearance})`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }

        // Inverse ink >= 4.5:1 on filled --sky-accent.
        expect(
          skyContrastRatio(tokens["--sky-ink-inverse"], tokens["--sky-accent"]),
          `inverse ink on accent at minute=${minute} (${appearance})`,
        ).toBeGreaterThanOrEqual(4.5);

        // Accent ink holds >= 4.5:1 on glass (same-polarity directly, cross-polarity via glassAccentInk).
        for (const glassSample of allGlassSamples) {
          if (sky.samePolarity) {
            expect(
              skyContrastRatio(tokens["--sky-accent-ink"], glassSample),
              `same-polarity accent ink glass contrast at minute=${minute} (${appearance})`,
            ).toBeGreaterThanOrEqual(4.5);
          }
          expect(
            skyContrastRatio(sky.glassAccentInk, glassSample),
            `glass accent ink contrast at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            skyContrastRatio(tokens["--sky-glass-focus-ring"], glassSample),
            `glass focus ring at minute=${minute} (${appearance})`,
          ).toBeGreaterThanOrEqual(3.0);
        }

        // Shell focus ring clears 3.0:1 on active sidebar appearance.
        const sidebarBg = appearance === "dark" ? "#0c0c0e" : "#fafafa";
        expect(
          skyContrastRatio(tokens["--sky-glass-focus-ring"], sidebarBg),
          `shell focus ring at minute=${minute} (${appearance})`,
        ).toBeGreaterThanOrEqual(3.0);
      }
    }
  });

  it("uses zero scrim on bright midday skies and a subtle scrim during dawn and dusk midtones", () => {
    const noon = resolveDaycrewSky(12 * 60, "light");
    expect(noon.phase).toBe("day");
    expect(noon.polarity).toBe("light");
    expect(noon.scrimOpacity).toBe(0);
    expect(noon.tokens["--sky-scrim-opacity"]).toBe("0");

    const morning = resolveDaycrewSky(7 * 60, "light");
    expect(morning.phase).toBe("morning");
    expect(morning.scrimOpacity).toBe(0);

    for (const midtoneMinute of [
      4 * 60 + 44,
      4 * 60 + 45,
      5 * 60,
      18 * 60 + 29,
      18 * 60 + 30,
      19 * 60,
    ]) {
      const sky = resolveDaycrewSky(midtoneMinute, "light");
      expect(sky.scrimOpacity, `scrim opacity at minute=${midtoneMinute}`).toBeGreaterThanOrEqual(
        0.18,
      );
      expect(sky.scrimOpacity, `scrim opacity at minute=${midtoneMinute}`).toBeLessThanOrEqual(
        0.46,
      );
    }
  });

  it("boosts adaptive glass opacity in cross-polarity combinations and stays translucent in same-polarity", () => {
    const lightDay = resolveDaycrewSky(12 * 60, "light");
    const darkDay = resolveDaycrewSky(12 * 60, "dark");
    const darkNight = resolveDaycrewSky(0, "dark");
    const lightNight = resolveDaycrewSky(0, "light");

    for (const same of [lightDay, darkNight]) {
      expect(same.samePolarity).toBe(true);
      const l1 = parsePercent(same.tokens["--sky-glass-l1-opacity"]);
      const l2 = parsePercent(same.tokens["--sky-glass-l2-opacity"]);
      const l3 = parsePercent(same.tokens["--sky-glass-l3-opacity"]);
      expect(l1).toBeGreaterThanOrEqual(76);
      expect(l3).toBeLessThanOrEqual(84);
      expect(l1).toBeLessThan(l2);
      expect(l2).toBeLessThan(l3);
    }

    for (const cross of [darkDay, lightNight]) {
      expect(cross.samePolarity).toBe(false);
      const l1 = parsePercent(cross.tokens["--sky-glass-l1-opacity"]);
      const l2 = parsePercent(cross.tokens["--sky-glass-l2-opacity"]);
      const l3 = parsePercent(cross.tokens["--sky-glass-l3-opacity"]);
      expect(l1).toBeGreaterThanOrEqual(88);
      expect(l3).toBeLessThanOrEqual(94);
      expect(l1).toBeLessThan(l2);
      expect(l2).toBeLessThan(l3);
    }
  });

  it("shifts between the relay palette's ruby, gold, orange, and violet accents", () => {
    const hueOf = (minute: number) => {
      const accent = resolveDaycrewSky(minute, "light").tokens["--sky-accent"];
      const parsed = parse(accent);
      expect(parsed).toBeDefined();
      return toOklch(parsed!)?.h ?? 0;
    };

    expect(hueDistance(hueOf(5 * 60), 12)).toBeLessThan(14);
    expect(hueDistance(hueOf(12 * 60), 80)).toBeLessThan(14);
    expect(hueDistance(hueOf(17 * 60 + 30), 47)).toBeLessThan(14);
    expect(hueDistance(hueOf(0), 296)).toBeLessThan(14);

    for (const minute of [0, 300, 720, 1050]) {
      const light = resolveDaycrewSky(minute, "light");
      const dark = resolveDaycrewSky(minute, "dark");
      expect(toOklch(parse(dark.rawSamples.top)!)!.l).toBeLessThan(
        toOklch(parse(light.rawSamples.top)!)!.l,
      );
    }
  });

  it("assigns all seven semantic phases across the 24-hour cycle", () => {
    const phases = new Set(ALL_SAMPLE_MINUTES.map((minute) => resolveDaycrewSky(minute).phase));
    expect(phases).toEqual(
      new Set(["night", "dawn", "morning", "day", "golden-hour", "dusk", "twilight"]),
    );
  });
});

describe("readDaycrewSkyMinuteOverride", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  });

  it("reads and wraps window.__DAYCREW_SKY_MINUTE__ and ?skyMinute overrides", () => {
    Object.defineProperty(globalThis, "window", {
      value: { __DAYCREW_SKY_MINUTE__: 1500, location: { search: "" } },
      configurable: true,
      writable: true,
    });
    expect(readDaycrewSkyMinuteOverride()).toBe(60);

    Object.defineProperty(globalThis, "window", {
      value: { location: { search: "?foo=1&skyMinute=1110" } },
      configurable: true,
      writable: true,
    });
    expect(readDaycrewSkyMinuteOverride()).toBe(1110);

    Object.defineProperty(globalThis, "window", {
      value: { location: { search: "?skyMinute=invalid" } },
      configurable: true,
      writable: true,
    });
    expect(readDaycrewSkyMinuteOverride()).toBeNull();
  });
});
