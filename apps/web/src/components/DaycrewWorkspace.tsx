import type { CSSProperties, ReactNode } from "react";
import { useNowMinute } from "../hooks/useNowMinute";
import "./daycrewWorkspace.css";

// At dusk and dawn both bodies pass below the horizon before the new one rises.
const skyStops = [
  { hour: 0, top: "#111944", base: "#575b9d", light: "#bec9ee", x: 58, y: 46 },
  { hour: 4, top: "#26305c", base: "#7a76a5", light: "#b6bedb", x: 22, y: 104 },
  { hour: 5, top: "#7779aa", base: "#c8a1bd", light: "#e4bfcb", x: 25, y: 185 },
  { hour: 7, top: "#a6aae0", base: "#f6b8be", light: "#ffdb9c", x: 31, y: 107 },
  { hour: 12, top: "#85bcea", base: "#ceeeeb", light: "#fff0bc", x: 48, y: -5 },
  { hour: 16, top: "#a3bfdf", base: "#f4d4bb", light: "#ffe5af", x: 54, y: 54 },
  { hour: 18, top: "#b0a6c4", base: "#f6b6a0", light: "#ffdb92", x: 51, y: 107 },
  { hour: 19, top: "#544e82", base: "#bd92a6", light: "#f4bdad", x: 52, y: 185 },
  { hour: 20, top: "#252657", base: "#67659b", light: "#a4b4dd", x: 82, y: 185 },
  { hour: 22, top: "#172153", base: "#585b9a", light: "#bec9ee", x: 76, y: 105 },
];
const midnight = { ...skyStops[0]!, hour: 24 };

function skyStyle(minute: number): CSSProperties {
  const hour = minute / 60;
  const index = skyStops.findLastIndex((stop) => stop.hour <= hour);
  const from = skyStops[index]!;
  const to = skyStops[index + 1] ?? midnight;
  const fraction = (hour - from.hour) / (to.hour - from.hour);
  const mix = (a: string, b: string) => `color-mix(in srgb, ${a} ${100 - fraction * 100}%, ${b})`;
  const night = hour < 5 || hour >= 19;
  return {
    "--sky-ink": night ? "#faf9ff" : "#17192b",
    "--sky-text-shadow": night ? "#111735" : "#ffffff80",
    "--sky-top": mix(from.top, to.top),
    "--sky-base": mix(from.base, to.base),
    "--sky-light": mix(from.light, to.light),
    "--sky-x": `${from.x + (to.x - from.x) * fraction}%`,
    "--sky-y": `${from.y + (to.y - from.y) * fraction}%`,
  } as CSSProperties;
}

export function DaycrewWorkspace({ children }: { children: ReactNode }) {
  // The shared clock emits UTC. Sky phases follow the device’s local civil time.
  const local = new Date(useNowMinute() + ":00Z");
  const minute = local.getHours() * 60 + local.getMinutes();
  return (
    <div data-slot="daycrew-workspace" style={skyStyle(minute)}>
      {children}
    </div>
  );
}
