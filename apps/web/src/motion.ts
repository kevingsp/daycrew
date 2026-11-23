export const MOTION_EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";
export const MOTION_EASE_SPRING_SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)";
export const MOTION_PANEL_DURATION_MS = 260;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}
