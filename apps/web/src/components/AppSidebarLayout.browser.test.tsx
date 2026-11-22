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
// The thread list needs live environments; the shortcut lives in the shell around it.
vi.mock(import("./Sidebar"), () => ({ default: (() => null) as never }));

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
    vi.mocked(useQuietThreadShells).mockReturnValue([working, waiting, idle]);
    await using screen = await render(
      <AppSidebarLayout>
        <div />
      </AppSidebarLayout>,
    );
    const toggle = screen.getByRole("button", { name: "Toggle main sidebar" });
    if (toggle.element().getAttribute("aria-pressed") === "true") await userEvent.click(toggle);
    await expect
      .element(screen.getByRole("link", { name: /Run checks/ }))
      .toHaveAttribute("data-attention", "false");
    const link = screen.getByRole("link", { name: /Review import/ });
    await expect.element(link).toHaveAttribute("data-attention", "true");
    await expect.element(link).toHaveAttribute("href", "/local/waiting");
    await expect
      .element(screen.getByRole("link", { name: /Finished import/ }))
      .not.toBeInTheDocument();
    await userEvent.click(toggle);
    await expect.element(link).not.toBeInTheDocument();
  });
});
