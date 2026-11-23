import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/agents")({
  beforeLoad: () => {
    throw redirect({ to: "/feed", search: { view: "grid" }, replace: true });
  },
});
