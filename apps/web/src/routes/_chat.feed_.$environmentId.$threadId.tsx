import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_chat/feed_/$environmentId/$threadId")({
  validateSearch: (search: Record<string, unknown>) => ({
    panel:
      search.panel === "pull-request"
        ? ("pull-request" as const)
        : search.panel === "changes"
          ? ("changes" as const)
          : ("conversation" as const),
  }),
  component: () => null,
});
