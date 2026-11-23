import type { CSSProperties, ReactNode } from "react";
import { useNowMinute } from "../hooks/useNowMinute";
import "./daycrewWorkspace.css";
import { MobileNavigation } from "./mobile/MobileNavigation";

// At dusk and dawn both bodies pass below the horizon before the new one rises.
const skyStops = [
  { hour: 0, top: "#161b3b", base: "#363656", light: "#9798c7", x: 89, y: 39, reach: 44 },
  { hour: 4, top: "#2b3255", base: "#555674", light: "#a9a9cf", x: 14, y: 106, reach: 48 },
  { hour: 5, top: "#8885ab", base: "#ba9fb1", light: "#edbdad", x: 12, y: 166, reach: 62 },
  { hour: 7, top: "#acaadc", base: "#edc3c3", light: "#ffdaa6", x: 14, y: 91, reach: 67 },
  { hour: 12, top: "#91bde2", base: "#cde5e4", light: "#fff2c8", x: 48, y: -6, reach: 79 },
  { hour: 16, top: "#a7bed9", base: "#dfc9be", light: "#ffe1ae", x: 71, y: 53, reach: 68 },
  { hour: 18, top: "#b0a5c6", base: "#d8a6a5", light: "#ffc79b", x: 77, y: 99, reach: 63 },
  { hour: 19, top: "#262541", base: "#443b57", light: "#eca78e", x: 72, y: 109, reach: 66 },
  { hour: 20, top: "#252545", base: "#4c405e", light: "#c1a5c3", x: 90, y: 165, reach: 55 },
  { hour: 22, top: "#1a2043", base: "#383757", light: "#a29dc9", x: 97, y: 97, reach: 47 },
];
const midnight = { ...skyStops[0]!, hour: 24 };

function skyStyle(minute: number): CSSProperties {
  const hour = minute / 60;
  const index = skyStops.findLastIndex((stop) => stop.hour <= hour);
  const from = skyStops[index]!;
  const to = skyStops[index + 1] ?? midnight;
  const fraction = (hour - from.hour) / (to.hour - from.hour);
  const mix = (a: string, b: string) => `color-mix(in srgb, ${a} ${100 - fraction * 100}%, ${b})`;
  const night = minute < 4 * 60 + 45 || minute >= 18 * 60 + 30;
  return {
    "--sky-ink": night ? "#faf9ff" : "#17192b",
    "--sky-text-shadow": night ? "#111735" : "#ffffff80",
    "--sky-top": mix(from.top, to.top),
    "--sky-base": mix(from.base, to.base),
    "--sky-light": mix(from.light, to.light),
    "--sky-x": `${from.x + (to.x - from.x) * fraction}%`,
    "--sky-y": `${from.y + (to.y - from.y) * fraction}%`,
    "--sky-reach": `${from.reach + (to.reach - from.reach) * fraction}%`,
  } as CSSProperties;
}

export function DaycrewWorkspace({
  children,
  mobileNavigation = true,
}: {
  children: ReactNode;
  mobileNavigation?: boolean;
}) {
  // The shared clock emits UTC. Sky phases follow the device’s local civil time.
  const local = new Date(useNowMinute() + ":00Z");
  const minute = local.getHours() * 60 + local.getMinutes();
  return (
    <div data-slot="daycrew-workspace" style={skyStyle(minute)}>
      {children}
      {mobileNavigation ? <MobileNavigation /> : null}
    </div>
  );
}
