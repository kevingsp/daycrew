import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceOverview } from "../components/workspaces/WorkspaceOverview";

export const Route = createFileRoute("/_chat/workspaces")({ component: WorkspaceOverview });
