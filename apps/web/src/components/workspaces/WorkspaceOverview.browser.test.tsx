import { EnvironmentId, IssueTrackerKind, ProjectId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { makeThreadFixture } from "../../test-fixtures";
import type { Project } from "../../types";
import { SidebarProvider } from "../ui/sidebar";
import { WorkspaceOverview } from "./WorkspaceOverview";

const { newThread, shelfRead } = vi.hoisted(() => ({
  newThread: vi.fn(async () => {}),
  shelfRead: vi.fn<(input: { expanded: boolean }) => void>(),
}));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => newThread }));
vi.mock("./WorkspaceResources", () => ({ WorkspaceResources: () => null }));
vi.mock("../../state/entities", () => ({
  useProjects: () => projects,
  useQuietThreadShells: () => threads,
  useAllEnvironmentShellsBootstrapped: () => true,
}));
vi.mock("../../state/olderSettledShelf", () => ({
  useOlderSettledShelf: (input: { expanded: boolean }) => {
    shelfRead(input);
    return { isListed: () => true, unloadedCount: () => 3, loading: false, failed: false };
  },
  useOlderSettledShelfGrowth: () => {},
}));

const fixture = makeThreadFixture();
const projects: Project[] = ["Daycrew", "Website"].map((title, index) => ({
  id: ProjectId.make(`project-${index}`),
  environmentId: EnvironmentId.make(`machine-${index}`),
  title,
  workspaceRoot: `/tmp/${title}`,
  repositoryIdentity: null,
  defaultModelSelection: fixture.modelSelection,
  createdAt: fixture.createdAt,
  updatedAt: fixture.updatedAt,
  scripts: [],
}));
const review = makeThreadFixture({
  projectId: projects[0]!.id,
  environmentId: projects[0]!.environmentId,
  title: "Review navigation",
  branch: "codex/navigation",
  pullRequests: [
    {
      host: "github.com",
      repository: "example/daycrew",
      number: 1693,
      url: "https://github.com/example/daycrew/pull/1693",
      source: "manual",
      linkedAt: fixture.updatedAt,
      snapshot: null,
      stack: null,
    },
  ],
  latestRun: {
    runId: RunId.make("run"),
    status: "completed",
    requestedAt: null,
    startedAt: null,
    completedAt: fixture.updatedAt,
    assistantMessageId: null,
  },
  issues: [
    {
      tracker: IssueTrackerKind.make("linear"),
      host: "linear.app",
      scope: "daycrew",
      key: "DC-42",
      displayKey: "DC-42",
      title: "Navigation",
      projectId: projects[0]!.id,
      url: "https://linear.app/daycrew/issue/DC-42",
      source: "manual",
      linkedAt: fixture.updatedAt,
    },
  ],
});
const threads = [
  review,
  makeThreadFixture({
    id: ThreadId.make("attention"),
    projectId: projects[1]!.id,
    environmentId: projects[1]!.environmentId,
    title: "Approve homepage",
    hasPendingApprovals: true,
  }),
  {
    ...review,
    id: ThreadId.make("done"),
    title: "Shipped rail",
    settledOverride: "settled" as const,
  },
];

describe("Workspaces overview controls", () => {
  it("filters across projects, searches linked context and opens the selected project draft", async () => {
    await page.viewport(1280, 900);
    await using screen = await render(
      <SidebarProvider>
        <WorkspaceOverview />
      </SidebarProvider>,
    );
    await expect
      .element(screen.getByRole("link", { name: "Review navigation", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Approve homepage", exact: true }))
      .toBeVisible();
    await userEvent.click(
      screen
        .getByRole("group", { name: "Filter by status" })
        .getByRole("button", { name: "Needs you 1", exact: true }),
    );
    await expect
      .element(screen.getByRole("link", { name: "Approve homepage", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Review navigation", exact: true }))
      .not.toBeInTheDocument();
    await userEvent.click(
      screen
        .getByRole("group", { name: "Filter by status" })
        .getByRole("button", { name: /^All / }),
    );
    await userEvent.fill(screen.getByRole("searchbox", { name: "Search sessions" }), "DC-42");
    await expect
      .element(screen.getByRole("link", { name: "Review navigation", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "DC-42: Navigation" }).first())
      .toHaveAttribute("href", "https://linear.app/daycrew/issue/DC-42");
    await userEvent.click(screen.getByRole("button", { name: "New workspace", exact: true }));
    await userEvent.click(page.getByRole("menuitem", { name: /Website/ }));
    expect(newThread).toHaveBeenCalledWith(
      { environmentId: projects[1]!.environmentId, projectId: projects[1]!.id },
      { envMode: "worktree" },
    );
  });

  it("includes unloaded settled work in counts and expands Done when its count is selected", async () => {
    await using screen = await render(
      <SidebarProvider>
        <WorkspaceOverview />
      </SidebarProvider>,
    );
    const done = screen.getByRole("region", { name: "Done", exact: true });
    await expect
      .element(screen.getByRole("link", { name: "example/daycrew #1693", exact: true }))
      .toHaveAttribute("href", "https://github.com/example/daycrew/pull/1693");
    await expect
      .element(done.getByRole("button", { name: "Done 4", exact: true }))
      .toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      screen
        .getByRole("group", { name: "Filter by status" })
        .getByRole("button", { name: "Done 4", exact: true }),
    );
    await expect
      .element(done.getByRole("button", { name: "Done 4", exact: true }))
      .toHaveAttribute("aria-expanded", "true");
    await expect
      .element(screen.getByRole("link", { name: "Shipped rail", exact: true }))
      .toBeVisible();
    await expect
      .element(done.getByRole("button", { name: "Load more", exact: true }))
      .toBeVisible();
    await userEvent.click(done.getByRole("button", { name: "Done 4", exact: true }));
    expect(screen.container.querySelector("#workspace-group-done")?.hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("can search more history when no loaded session matches", async () => {
    await using screen = await render(
      <SidebarProvider>
        <WorkspaceOverview />
      </SidebarProvider>,
    );
    await userEvent.fill(
      screen.getByRole("searchbox", { name: "Search sessions" }),
      "not-loaded-yet",
    );
    await expect
      .element(screen.getByText("No sessions match these filters", { exact: true }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Load more", exact: true }));
    expect(shelfRead.mock.lastCall?.[0].expanded).toBe(true);
  });
});
