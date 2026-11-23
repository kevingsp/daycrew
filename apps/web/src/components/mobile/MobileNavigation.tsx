import { Link, useLocation } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import { BotIcon, MenuIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import * as Schema from "effect/Schema";

import { isElectron } from "../../env";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useSoftwareKeyboardOpen } from "../../hooks/useSoftwareKeyboardOpen";
import { cn } from "../../lib/utils";
import { useSidebar } from "../ui/sidebar";

const savedPromptSchema = Schema.NullOr(DraftId);

export function MobileNavigation() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Safari's keyboard resizes the visual viewport without resizing dvh; keep the shell above it without rerendering the conversation.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isMobile || isElectron || !viewport) return;
    const root = document.documentElement;
    const update = () => {
      if (viewport.scale === 1)
        root.style.setProperty("--daycrew-viewport-height", `${Math.round(viewport.height)}px`);
      else root.style.removeProperty("--daycrew-viewport-height");
    };
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      root.style.removeProperty("--daycrew-viewport-height");
    };
  }, [isMobile]);
  return isMobile ? (
    <NavigationContents sidebarOpen={openMobile} openSidebar={() => setOpenMobile(true)} />
  ) : null;
}

function NavigationContents({
  sidebarOpen,
  openSidebar,
}: {
  readonly sidebarOpen: boolean;
  readonly openSidebar: () => void;
}) {
  const gt = useGT();
  const pathname = useLocation({ select: (location) => location.pathname });
  const target = useThreadRouteTarget();
  const currentDraftId = target?.kind === "draft" ? target.draftId : null;
  const [savedDraftId, setSavedDraftId] = useLocalStorage(
    "daycrew:mobile-prompt:v1",
    null,
    savedPromptSchema,
  );
  const promptDraftId = useComposerDraftStore((state) =>
    savedDraftId !== null && state.draftThreadsByThreadKey[savedDraftId] ? savedDraftId : null,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- remembers the draft route in device storage so switching mobile tabs returns to the unsent prompt.
  useEffect(() => {
    if (currentDraftId !== null && currentDraftId !== savedDraftId) setSavedDraftId(currentDraftId);
  }, [currentDraftId, savedDraftId, setSavedDraftId]);
  const keyboardOpen = useSoftwareKeyboardOpen();
  const feed = pathname === "/feed" || pathname.startsWith("/feed/");
  const prompt = pathname === "/" || pathname.startsWith("/draft/");
  const itemClass =
    "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-2xs font-medium outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  return (
    <nav
      data-slot="mobile-navigation"
      aria-label={gt("Main navigation")}
      hidden={keyboardOpen || sidebarOpen}
      className="shrink-0 border-t border-border/50 bg-background/90 px-3 pt-1 text-muted-foreground"
    >
      <div className="mx-auto flex max-w-lg items-center gap-1">
        <Link
          to="/feed"
          className={cn(itemClass, feed && "bg-accent/70 text-foreground")}
          aria-current={feed ? "page" : undefined}
        >
          <BotIcon aria-hidden="true" className="size-5" />
          <T>Agents</T>
        </Link>
        <Link
          {...(promptDraftId
            ? { to: "/draft/$draftId" as const, params: { draftId: promptDraftId } }
            : { to: "/" as const })}
          className={cn(itemClass, prompt && "bg-accent/70 text-foreground")}
          aria-current={prompt ? "page" : undefined}
        >
          <PlusIcon aria-hidden="true" className="size-5" />
          <T>Prompt</T>
        </Link>
        <button
          type="button"
          className={itemClass}
          onClick={openSidebar}
          aria-label={gt("Open menu")}
        >
          <MenuIcon aria-hidden="true" className="size-5" />
          <T>Menu</T>
        </button>
      </div>
    </nav>
  );
}
