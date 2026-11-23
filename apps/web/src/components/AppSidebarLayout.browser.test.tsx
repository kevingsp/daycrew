import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { makeThreadFixture } from "../test-fixtures";
import { useQuietThreadShells } from "../state/entities";
import { render } from "../../test/render";

vi.mock(import("../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig } = await import("@t3tools/shared/keybindings");
  const keybindings = compileResolvedKeybindingsConfig([
    { key: "mod+b", command: "sidebar.toggle", when: "!terminalFocus" },
  ]);
  return { ...actual, primaryServerKeybindingsAtom: Atom.make(keybindings) };
});
// The thread list needs live environments; keep only the expanded header control.
vi.mock(import("./Sidebar"), async () => {
  const { SidebarTrigger, useSidebar } = await import("./ui/sidebar");
  function SidebarHeaderFixture() {
    const { open } = useSidebar();
    return open ? <SidebarTrigger aria-label="Toggle main sidebar" /> : null;
  }
  return { default: SidebarHeaderFixture as never };
});

vi.mock("../state/entities", { spy: true });
vi.mock(import("../state/shell"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  return {
    ...(await original()),
    liveShellEnvironmentIdsAtom: Atom.make(new Set([EnvironmentId.make("local")])),
  };
});

import { AppSidebarLayout } from "./AppSidebarLayout";

describe("sidebar toggle shortcut", () => {
  it("leaves the key to a focused terminal when its rule excludes terminalFocus", async () => {
    await page.viewport(1280, 800);
    using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    await using screen = await render(
      <AppSidebarLayout>
        <div data-terminal-owner="drawer">
          <textarea aria-label="Terminal input" />
        </div>
        <button type="button">Outside</button>
      </AppSidebarLayout>,
    );
    const wrapper = screen.container.querySelector('[data-slot="sidebar-wrapper"]')!;

    await userEvent.click(screen.getByRole("textbox", { name: "Terminal input" }));
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(wrapper.getAttribute("data-sidebar-state")).toBe("expanded");

    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    await userEvent.keyboard("{Control>}b{/Control}");
    await vi.waitFor(() => expect(wrapper.getAttribute("data-sidebar-state")).toBe("collapsed"));
  });

  it("keeps working and waiting threads reachable in the collapsed desktop rail", async () => {
    await page.viewport(1366, 768);
    const environmentId = EnvironmentId.make("local");
    const waiting = makeThreadFixture({
      environmentId,
      id: ThreadId.make("waiting"),
      title: "Review import",
      hasPendingApprovals: true,
    });
    const idle = makeThreadFixture({
      environmentId,
      id: ThreadId.make("idle"),
      title: "Finished import",
    });
    const working = makeThreadFixture({
      environmentId,
      id: ThreadId.make("working"),
      title: "Run checks",
      runtime: {
        status: "running",
        activeRunId: null,
        providerInstanceId: idle.providerInstanceId,
        providerName: "Codex",
        lastError: null,
        updatedAt: idle.updatedAt,
      },
    });
    const batch = (thread: typeof idle, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...thread,
        id: ThreadId.make(thread.id + index),
        title: thread.title + " " + index,
      }));
    vi.mocked(useQuietThreadShells).mockReturnValue([
      ...batch(idle, 300),
      ...batch(working, 5),
      ...batch(waiting, 2),
    ]);
    await using screen = await render(
      <AppSidebarLayout>
        <div />
      </AppSidebarLayout>,
    );
    const toggle = screen.getByRole("button", { name: "Toggle main sidebar" });
    if (toggle.element().getAttribute("aria-pressed") === "true") await userEvent.click(toggle);
    await expect
      .element(screen.getByRole("link", { name: /Run checks 3/ }))
      .toHaveAttribute("data-attention", "false");
    expect(screen.container.querySelectorAll('[data-slot="agent-link"]').length).toBe(7);
    expect(
      screen.container.querySelectorAll('[data-slot="agent-link"][data-attention="true"]').length,
    ).toBe(2);
    const link = screen.getByRole("link", { name: /Review import 1/ });
    await expect.element(link).toHaveAttribute("data-attention", "true");
    await expect.element(link).toHaveAttribute("href", "/local/waiting1");
    await expect
      .element(screen.getByRole("link", { name: /Finished import/ }))
      .not.toBeInTheDocument();
    await userEvent.click(toggle);
    await expect.element(link).not.toBeInTheDocument();
  });

  it("shows running children and provider-managed work while the parent waits", async () => {
    await page.viewport(1366, 768);
    const environmentId = EnvironmentId.make("local");
    const parentId = ThreadId.make("parent");
    const childId = ThreadId.make("review");
    const parent = makeThreadFixture({
      environmentId,
      id: parentId,
      title: "Ship settings",
      blockedOnThreadWait: true,
      pendingBackgroundTasks: [
        { taskId: "review", kind: "subagent", childThreadId: childId },
        { taskId: "native", kind: "subagent", description: "Provider checks" },
      ],
    });
    const child = makeThreadFixture({
      environmentId,
      id: childId,
      title: "Schema review",
      lineage: {
        rootThreadId: parentId,
        parentThreadId: parentId,
        relationshipToParent: "subagent",
      },
      runtime: {
        status: "running",
        activeRunId: null,
        providerInstanceId: parent.providerInstanceId,
        providerName: "Codex",
        lastError: null,
        updatedAt: parent.updatedAt,
      },
    });
    const completed = {
      ...child,
      id: ThreadId.make("completed"),
      title: "Completed",
      runtime: null,
    };
    vi.mocked(useQuietThreadShells).mockReturnValue([parent, child, completed]);
    await using screen = await render(
      <AppSidebarLayout>
        <div />
      </AppSidebarLayout>,
    );
    const toggle = screen.getByRole("button", { name: "Toggle main sidebar" });
    if (toggle.element().getAttribute("aria-pressed") === "true") await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "Subagents" }));
    await expect
      .element(page.getByRole("link", { name: /Schema review.*Ship settings.*Running/ }))
      .toHaveAttribute("href", "/local/review");
    await expect
      .element(page.getByRole("link", { name: /Provider checks.*Running/ }))
      .toHaveAttribute("href", "/local/parent");
    await expect.element(page.getByRole("link", { name: /Completed/ })).not.toBeInTheDocument();
  });
});
