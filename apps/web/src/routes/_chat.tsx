import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";

import { lazy, Suspense, useEffect, useRef } from "react";
const AgentFeed = lazy(() => import("../components/AgentFeed"));

import { ThreadRouteView } from "../components/ThreadRouteView";
import { GlobalVoiceInputIndicator } from "../components/chat/GlobalVoiceInputIndicator";
import { isAppModalPage } from "../components/sidebar/mainAppLocation";
import { SidebarInset } from "../components/ui/sidebar";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { retainThreadFindForRoute } from "../components/chat/threadFindStore";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { useShownThreadRouteTarget } from "../hooks/useShownThreadRouteTarget";

import { usePanelAnimationSettings } from "../panelAnimations";

function ChatRouteLayout() {
  // Render both routes here so draft promotion keeps the same ChatView mounted.
  const { shownTarget, modalOpen } = useShownThreadRouteTarget();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const feed = /^\/feed(?:\/|$)/.test(pathname);
  const pageKey = feed ? "/feed" : pathname;
  const previousPage = useRef(pageKey);
  const { active, durationMs } = usePanelAnimationSettings();
  useEffect(() => {
    if (previousPage.current === pageKey) return;
    previousPage.current = pageKey;
    if (!active) return;
    const content = document.querySelector('[data-slot="sidebar-inset"]');
    const animation = content?.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: durationMs,
      easing: "ease-out",
    });
    return () => animation?.cancel();
  }, [active, durationMs, pageKey]);
  if (feed)
    return (
      <Suspense fallback={null}>
        <AgentFeed />
      </Suspense>
    );
  return (
    <>
      {shownTarget?.kind === "server" && !modalOpen ? (
        <ThreadLinkPrompt threadRef={shownTarget.threadRef} />
      ) : null}
      {shownTarget ? (
        <ThreadRouteView target={shownTarget} background={modalOpen} />
      ) : modalOpen ? (
        <SidebarInset className="h-dvh" />
      ) : (
        <Outlet />
      )}
      {modalOpen ? <Outlet /> : null}
      <GlobalVoiceInputIndicator hidden={modalOpen} />
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
    return { appModalPage: isAppModalPage(location.pathname) };
  },
  component: ChatRouteLayout,
  // Every match carries the whole location's params, so this layout sees the thread route's too.
  onEnter: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onStay: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onLeave: () => retainThreadFindForRoute({ modalPage: false, threadRef: null }),
});

function retainThreadFindForRouteMatch(
  modalPage: boolean,
  params: Partial<Record<"environmentId" | "threadId", string>>,
) {
  const target = resolveThreadRouteTarget(params);
  retainThreadFindForRoute({
    modalPage,
    threadRef: target?.kind === "server" ? target.threadRef : null,
  });
}
