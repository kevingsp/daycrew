import type { ReactNode } from "react";
import { useNowMinute } from "../hooks/useNowMinute";
import { useRenderedAppearance } from "../hooks/useTheme";
import { readDaycrewSkyMinuteOverride, resolveDaycrewSky } from "../lib/daycrewSky";
import { WindowControlsBackdropContext } from "../lib/windowControlsOverlay";
import "./daycrewWorkspace.css";
import "./daycrewSkyAdaptive.css";
import { MobileNavigation } from "./mobile/MobileNavigation";

export function DaycrewWorkspace({
  children,
  mobileNavigation = true,
}: {
  children: ReactNode;
  mobileNavigation?: boolean;
}) {
  const appearance = useRenderedAppearance();
  // The shared clock emits UTC. Sky phases follow the device's local civil time.
  const local = new Date(useNowMinute() + ":00Z");
  const clockMinute = local.getHours() * 60 + local.getMinutes();
  const minute = readDaycrewSkyMinuteOverride() ?? clockMinute;
  const sky = resolveDaycrewSky(minute, appearance);

  const attachWorkspaceRef = (node: HTMLDivElement | null) => {
    const shell = node?.closest<HTMLElement>("[data-daycrew-shell]");
    if (!shell) return;
    const railTokens = {
      "--sky-accent-hover": sky.tokens["--sky-accent-hover"],
      "--sky-accent-active": sky.tokens["--sky-accent-active"],
      "--sky-accent-selected": sky.tokens["--sky-accent-selected"],
      "--sky-accent-border": sky.tokens["--sky-accent-border"],
      "--sky-focus-ring": sky.tokens["--sky-glass-focus-ring"],
    };
    for (const [property, value] of Object.entries(railTokens)) {
      shell.style.setProperty(property, value);
    }
    return () => {
      for (const property of Object.keys(railTokens)) {
        shell.style.removeProperty(property);
      }
    };
  };

  return (
    <div
      ref={attachWorkspaceRef}
      data-slot="daycrew-workspace"
      data-sky-phase={sky.phase}
      data-sky-polarity={sky.polarity}
      data-sky-cross-polarity={!sky.samePolarity || undefined}
      style={sky.style}
    >
      <WindowControlsBackdropContext value={sky.polarity}>{children}</WindowControlsBackdropContext>
      {mobileNavigation ? <MobileNavigation /> : null}
    </div>
  );
}
