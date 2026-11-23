import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { getThemeSnapshot, setAppearanceMode } from "../hooks/useTheme";
import { compositeSkyColor, resolveDaycrewSky, skyContrastRatio } from "../lib/daycrewSky";
import { makeThreadFixture } from "../test-fixtures";
import { useQuietThreadShells } from "../state/entities";
import { render, stubGlobal } from "../../test/render";
import { ComposerBanner } from "./chat/ComposerBanner";
import { ComposerControl } from "./chat/ComposerControl";
import { ComposerSurface } from "./chat/ComposerSurface";
import { SidebarInset } from "./ui/sidebar";

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

it("keeps composer text and controls readable over a bright sky in dark mode", async () => {
  await page.viewport(1280, 800);
  using _minute = stubGlobal("__DAYCREW_SKY_MINUTE__", 720);
  const { appearanceMode } = getThemeSnapshot();
  using _appearance = { [Symbol.dispose]: () => setAppearanceMode(appearanceMode) };
  setAppearanceMode("dark");
  const surfaces = ["plain", "context row", "attached banner"] as const;
  const layout = (surface: (typeof surfaces)[number]) => (
    <AppSidebarLayout showSidebar={false}>
      <SidebarInset data-sky-surface={surface === "context row" ? "draft" : "chat"}>
        <ComposerSurface.Shell contextRow={surface === "context row"}>
          <ComposerSurface.Host>
            {surface === "attached banner" ? (
              <ComposerBanner.Root>Review required</ComposerBanner.Root>
            ) : null}
            <ComposerSurface.Main>
              <div className="composer-tiptap">Prompt text</div>
              <ComposerControl>Choose model</ComposerControl>
            </ComposerSurface.Main>
          </ComposerSurface.Host>
          {surface === "context row" ? <ComposerSurface.ContextStrip /> : null}
        </ComposerSurface.Shell>
      </SidebarInset>
    </AppSidebarLayout>
  );
  const skySamples = Object.values(resolveDaycrewSky(720, "dark").compositedSamples);
  await using screen = await render(layout("plain"));
  for (const surface of surfaces) {
    await screen.rerender(layout(surface));
    const selector =
      surface === "plain"
        ? '[data-slot="composer-shell"]'
        : surface === "context row"
          ? '[data-slot="composer-host"]'
          : "[data-chat-composer-main-surface]";
    const fill = getComputedStyle(screen.container.querySelector(selector)!, "::before");
    expect(fill.backgroundImage).toContain("linear-gradient");
    const promptInk = getComputedStyle(screen.getByText("Prompt text").element()).color;
    const controlInk = getComputedStyle(
      screen.getByRole("button", { name: "Choose model" }).element(),
    ).color;
    for (const sky of skySamples) {
      const backing = compositeSkyColor(fill.backgroundColor, sky);
      expect(skyContrastRatio(promptInk, backing), surface).toBeGreaterThanOrEqual(4.5);
      expect(skyContrastRatio(controlInk, backing), surface).toBeGreaterThanOrEqual(4.5);
    }
    if (surface === "attached banner") {
      const banner = screen.getByText("Review required").element();
      const bannerBacking = getComputedStyle(banner, "::before");
      expect(bannerBacking.backgroundImage).toContain("linear-gradient");
      for (const sky of skySamples) {
        expect(
          skyContrastRatio(
            getComputedStyle(banner).color,
            compositeSkyColor(bannerBacking.backgroundColor, sky),
          ),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

it("uses separate focus colors for the sky and glass during the draft", async () => {
  await page.viewport(1280, 800);
  using _minute = stubGlobal("__DAYCREW_SKY_MINUTE__", 0);
  await using screen = await render(
    <AppSidebarLayout showSidebar={false}>
      <SidebarInset data-sky-surface="draft">
        <ComposerSurface.Shell contextRow>
          <ComposerSurface.Host>
            <button type="button" className="focus-visible:outline-2">
              On glass
            </button>
          </ComposerSurface.Host>
          <ComposerSurface.ContextStrip>
            <button type="button">On sky</button>
          </ComposerSurface.ContextStrip>
        </ComposerSurface.Shell>
      </SidebarInset>
    </AppSidebarLayout>,
  );
  const glass = screen.getByRole("button", { name: "On glass" }).element();
  const sky = screen.getByRole("button", { name: "On sky" }).element();
  await userEvent.keyboard("{Tab}");
  expect(glass).toHaveFocus();
  const glassStyle = getComputedStyle(glass);
  expect(glassStyle.outlineWidth).toBe("2px");
  await userEvent.keyboard("{Tab}");
  expect(sky).toHaveFocus();
  const skyStyle = getComputedStyle(sky);
  expect(skyStyle.outlineWidth).toBe("2px");
  expect(skyStyle.outlineColor).not.toBe(glassStyle.outlineColor);
  const restingInk = skyStyle.color;
  await userEvent.hover(page.elementLocator(sky));
  const hoverStyle = getComputedStyle(sky);
  expect(hoverStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  for (const sample of Object.values(resolveDaycrewSky(0).compositedSamples)) {
    const tintedSky = compositeSkyColor(hoverStyle.backgroundColor, sample);
    expect(skyContrastRatio(hoverStyle.color, tintedSky)).toBeGreaterThanOrEqual(4.5);
  }
  expect(hoverStyle.color).not.toBe(restingInk);
});

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
});
