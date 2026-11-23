import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const AgentGrid = lazy(() => import("../components/agents/AgentGrid"));

export const Route = createFileRoute("/_chat/agents")({
  component: () => (
    <Suspense fallback={null}>
      <AgentGrid />
    </Suspense>
  ),
});
