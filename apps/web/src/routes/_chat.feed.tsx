import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/feed")({
  validateSearch: (search: Record<string, unknown>): { view?: "grid" } =>
    search.view === "grid" ? { view: "grid" } : {},
  component: () => null,
});
