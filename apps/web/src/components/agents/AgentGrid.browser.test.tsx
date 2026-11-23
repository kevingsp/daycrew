import { ProjectId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { makeThreadFixture } from "../../test-fixtures";
import AgentGrid from "./AgentGrid";
import "../../index.css";

vi.mock("../../state/entities", () => ({
  useProjects: () => projects,
  useQuietThreadShells: () => threads,
  useHiddenThreadKeys: () => new Set(["environment-test\u0000agent-16"]),
  useDelegatedUnderParent: () => new Set(["environment-test\u0000agent-17"]),
  useAllEnvironmentShellsBootstrapped: () => true,
}));
vi.mock("../../state/shell", async () => {
  const { Atom } = await import("effect/reactivity");
  return { liveShellEnvironmentIdsAtom: Atom.make(new Set(["environment-test"])) };
});
vi.mock("../sidebar/providerEntries", async () => {
  const { Atom } = await import("effect/reactivity");
  return { sidebarProviderEntriesAtom: Atom.make(new Map()) };
});

const fixture = makeThreadFixture();
const projects = [
  {
    environmentId: fixture.environmentId,
    id: ProjectId.make("project-test"),
    title: "Daycrew",
    archivedAt: null,
  },
];
const threads = Array.from({ length: 18 }, (_, index) =>
  makeThreadFixture({
    id: ThreadId.make(`agent-${index}`),
    title: `Task ${index}`,
    branch: "codex/mobile",
    hasPendingApprovals: index === 0,
    latestRun:
      index === 1
        ? {
            runId: RunId.make("run-live"),
            status: "running",
            requestedAt: fixture.createdAt,
            startedAt: fixture.createdAt,
            completedAt: null,
            assistantMessageId: null,
          }
        : null,
    runtime:
      index === 1
        ? {
            status: "running",
            activeRunId: RunId.make("run-live"),
            providerInstanceId: fixture.providerInstanceId,
            providerName: null,
            lastError: null,
            updatedAt: fixture.updatedAt,
          }
        : null,
  }),
);

describe("agent grid", () => {
  it("keeps two readable columns on a phone and loads more without listing hidden agents", async () => {
    await page.viewport(390, 844);
    await using screen = await render(<AgentGrid />);
    await expect
      .element(screen.getByRole("heading", { name: "Task 0", exact: true }))
      .toBeVisible();
    expect(document.querySelectorAll("[data-agent-card]")).toHaveLength(12);
    const [first, second, third] = Array.from(
      document.querySelectorAll<HTMLElement>("[data-agent-card]"),
    );
    expect(first!.getBoundingClientRect().top).toBe(second!.getBoundingClientRect().top);
    expect(third!.getBoundingClientRect().top).toBeGreaterThan(
      first!.getBoundingClientRect().bottom,
    );
    expect(first!.getBoundingClientRect().width).toBeGreaterThan(140);
    expect(first!.getBoundingClientRect().height).toBeLessThanOrEqual(90);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    await userEvent.click(screen.getByRole("button", { name: "Show more", exact: true }));
    expect(document.querySelectorAll("[data-agent-card]")).toHaveLength(16);
    await expect
      .element(screen.getByRole("heading", { name: "Task 16", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Task 17", exact: true }))
      .not.toBeInTheDocument();
  });

  it("filters requests, searches branch context, and links to the selected conversation", async () => {
    await page.viewport(1280, 900);
    await using screen = await render(<AgentGrid />);
    await userEvent.click(screen.getByRole("button", { name: "Needs you 1", exact: true }));
    await expect
      .element(screen.getByRole("heading", { name: "Task 0", exact: true }))
      .toBeVisible();
    expect(document.querySelectorAll("[data-agent-card]")).toHaveLength(1);
    expect(document.querySelector("[data-agent-card]")?.getAttribute("href")).toContain("agent-0");
    await userEvent.click(screen.getByRole("button", { name: "All 16", exact: true }));
    await userEvent.fill(
      screen.getByRole("searchbox", { name: "Search agents", exact: true }),
      "missing-branch",
    );
    await expect
      .element(screen.getByRole("heading", { name: "No agents to show", exact: true }))
      .toBeVisible();
    await userEvent.fill(
      screen.getByRole("searchbox", { name: "Search agents", exact: true }),
      "codex/mobile",
    );
    expect(document.querySelectorAll("[data-agent-card]")).toHaveLength(12);
  });
});
