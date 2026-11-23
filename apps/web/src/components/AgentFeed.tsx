/* oxlint-disable shadcn/no-unknown-classes -- Feed classes are defined in the imported agentFeed.css. */
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import { Link, useMatch, useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  ArrowUp,
  Bot,
  CheckCheck,
  GitBranch,
  GitCompareArrows,
  MessageSquare,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEnvironmentThread, threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { newMessageId } from "../lib/utils";
import {
  buildThreadRouteParams,
  resolveThreadRouteTarget,
  type ThreadRouteTarget,
} from "../threadRoutes";
import { usePanelAnimationSettings, usePanelPresence } from "../panelAnimations";
import { ThreadRouteView } from "./ThreadRouteView";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";
import { Button } from "./ui/button";
import { useEnvironmentScope } from "../state/session";
import { useEnvironmentShellStatus } from "../state/shell";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { AuthOrchestrationOperateScope, MessageId, CommandId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { msg, T, useGT, useMessages } from "gt-react";
import { serverEnvironment } from "../state/server";
import { useQuietThreadShell } from "../state/entities";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  getDefaultProviderInstanceModel,
  isProviderInstancePickerReady,
} from "../providerInstances";
import { useEnvironmentQuery } from "../state/query";
import { useFilesystemReadAccess } from "../state/filesystem";
import { reviewEnvironment } from "../state/review";
import { revisionedQuery } from "../state/revisionedQuery";
import { useClientSettings } from "../hooks/useSettings";
import { useDiffPanelStore, selectThreadBranchBaseRef } from "../diffPanelStore";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { useAssetUrlState } from "../assets/assetUrls";
import { useAgentRows } from "./agents/useAgentRows";
import "./agentFeed.css";

const DiffPanel = lazy(() => import("./DiffPanel"));
type Shell = EnvironmentThreadShell;
type Target = Extract<ThreadRouteTarget, { kind: "server" }>;
// Keep the receipt identity alongside the text: an acknowledgement can be lost after commit.
const FeedReplyDraft = Schema.NullOr(
  Schema.Struct({
    text: Schema.String,
    messageId: MessageId,
    createdAt: Schema.String,
  }),
);

const feedFilters = {
  all: msg("All"),
  attention: msg("Needs you"),
  review: msg("Ready to review"),
  progress: msg("In progress"),
};

type FeedFilter = keyof typeof feedFilters;
function ReviewAction({
  threadRef,
  patch,
  prompt,
}: {
  threadRef: Target["threadRef"];
  patch: string | null;
  prompt: string;
}) {
  const thread = useQuietThreadShell(threadRef);
  const config = useAtomValue(serverEnvironment.configValueAtom(threadRef.environmentId));
  const providers = config?.providers ?? [];
  const reviewer =
    config &&
    applyProviderInstanceSettings(
      deriveProviderInstanceEntries(providers),
      config.settings,
      thread?.projectId ?? null,
    ).find((entry) => entry.driverKind === "claudeAgent" && isProviderInstancePickerReady(entry));
  const model = reviewer && getDefaultProviderInstanceModel(providers, reviewer.instanceId);
  const allowed = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const send = useOrchestrationCommand(threadEnvironment.startTurn);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<"sent" | "failed" | null>(null);
  async function submit() {
    if (lock.current || !allowed || !thread || !patch || !model || !reviewer) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await send({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text:
              prompt +
              "\nReview the following patch as it appeared when submitted. Report findings in this thread. Leave files unchanged.\n\n" +
              patch,
            attachments: [],
          },
          modelSelection: { instanceId: reviewer.instanceId, model },
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          dispatchMode: "auto",
          createdAt: new Date().toISOString(),
        },
      });
      setReceipt(result._tag === "Success" ? "sent" : "failed");
    } catch {
      setReceipt("failed");
    }
    lock.current = false;
    setBusy(false);
  }
  return (
    <div className="feed-review">
      <Button
        size="sm"
        variant="outline"
        disabled={!allowed || !patch || !model || busy}
        onClick={() => void submit()}
      >
        <T>Review with Claude</T>
      </Button>
      <small role="status">
        {receipt === "sent" ? (
          <T>Review sent to Claude</T>
        ) : receipt === "failed" ? (
          <T>Review could not be sent</T>
        ) : !model ? (
          <T>Connect Claude Code to request a review.</T>
        ) : !patch ? (
          <T>Select a complete diff to review.</T>
        ) : (
          prompt
        )}
      </small>
    </div>
  );
}
function category(thread: Shell): Exclude<FeedFilter, "all"> {
  const status = resolveSidebarThreadStatus(thread);
  if (["approval", "input", "request", "failed", "limited"].includes(status)) return "attention";
  if (thread.latestRun?.status === "completed" && !["working", "preparing"].includes(status))
    return "review";
  return "progress";
}

function ResultThumbnail({
  threadRef,
  path,
  revision,
}: {
  threadRef: Target["threadRef"];
  path: string;
  revision: string | null;
}) {
  const asset = useAssetUrlState(
    threadRef.environmentId,
    { _tag: "workspace-file", threadId: threadRef.threadId, path },
    revision,
  );
  return asset._tag === "Success" ? (
    <img className="feed-thumbnail" src={asset.url} alt={path} loading="lazy" />
  ) : null;
}

function FeedPullRequest({ threadRef }: { threadRef: Target["threadRef"] }) {
  const gt = useGT();
  const shell = useQuietThreadShell(threadRef);
  const pr = resolveThreadCurrentPullRequestLink(shell?.pullRequests ?? []);
  if (!pr)
    return (
      <p className="feed-pr">
        <T>This task has no linked pull request.</T>
      </p>
    );
  const snap = pr.snapshot;
  return (
    <section className="feed-pr">
      <h2>
        #{pr.number} {snap?.title}
      </h2>
      {snap && (
        <>
          <p>
            {snap.isDraft && <>{gt("Draft", { $context: "pull request state" })} · </>}
            {snap.state} · {snap.headBranch} → {snap.baseBranch}
          </p>
          {snap.changedFiles != null && (
            <p>
              {gt("{count, plural, one {{count} file changed} other {{count} files changed}}", {
                count: snap.changedFiles,
              })}
              {snap.additions != null && " · +" + snap.additions}
              {snap.deletions != null && " −" + snap.deletions}
            </p>
          )}
        </>
      )}
      {/^https?:\/\//i.test(pr.url) && (
        <a href={pr.url} target="_blank" rel="noreferrer">
          <T>Open pull request</T> ↗
        </a>
      )}
    </section>
  );
}

function TaskCard({
  thread,
  project,
  onReview,
  selected,
  onInspect,
}: {
  thread: Shell;
  project: string;
  selected: boolean;
  onInspect: (el: HTMLElement) => void;
  onReview: (thread: Shell, text: string) => void;
}) {
  const gt = useGT();
  const messagesForLocale = useMessages();
  const ref = scopeThreadRef(thread.environmentId, thread.id);
  const params = buildThreadRouteParams(ref);
  const [busy, setBusy] = useState(false);
  const draftKey = scopedThreadKey(ref);
  const [draft, setDraft] = useLocalStorage("daycrew:feed-reply:" + draftKey, null, FeedReplyDraft);
  const [expanded, setExpanded] = useState(() => Boolean(draft?.text));
  const reply = draft?.text ?? "";
  const connected = useEnvironmentShellStatus(thread.environmentId) === "live";
  const [receipt, setReceipt] = useState<"sent" | "failed" | null>(null);
  const inFlight = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const focusReplyOnOpen = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The textarea can receive focus only after the reply panel stops being inert.
  useLayoutEffect(() => {
    if (expanded && focusReplyOnOpen.current) {
      focusReplyOnOpen.current = false;
      composer.current?.focus({ preventScroll: true });
    }
  }, [expanded]);
  const [visible, setVisible] = useState(false);
  const card = useRef<HTMLElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Track the card's viewport intersection so distant cards can release their live subscriptions.
  useEffect(() => {
    if (!card.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting === true),
      { rootMargin: "150px" },
    );
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const active = visible || expanded;
  const detail = useEnvironmentThread(
    active ? ref.environmentId : null,
    active ? ref.threadId : null,
  );
  const data = Option.getOrNull(detail.data);
  const { canReadFiles } = useFilesystemReadAccess(active ? thread.environmentId : null);
  const baseRef = useDiffPanelStore((state) => selectThreadBranchBaseRef(state, ref));
  const ignoreWhitespace = useClientSettings((settings) => settings.diffIgnoreWhitespace);
  const mutation = data?.turnItems.findLast(
    (item) =>
      (item.type === "command_execution" || item.type === "file_change") &&
      item.status === "completed",
  )?.id;
  const preview = useEnvironmentQuery(
    active && canReadFiles && thread.worktreePath
      ? revisionedQuery(
          reviewEnvironment.diffPreview({
            environmentId: thread.environmentId,
            input: {
              cwd: thread.worktreePath,
              metadataOnly: true,
              sourceKind: "branch-range",
              ignoreWhitespace,
              ...(baseRef ? { baseRef } : {}),
            },
          }),
          JSON.stringify([thread.latestRun?.status, mutation]),
        )
      : null,
  );
  const branch = preview.data?.sources.find((source) => source.kind === "branch-range");
  const files = branch?.files ?? [];
  const thumbnail = files.find(
    (file) => file.changeType !== "deleted" && /\.(png|jpe?g|webp|gif|avif)$/i.test(file.path),
  );
  const lineStats = files.reduce(
    (sum, file) => ({ added: sum.added + file.additions, removed: sum.removed + file.deletions }),
    { added: 0, removed: 0 },
  );
  const pr = resolveThreadCurrentPullRequestLink(thread.pullRequests);
  const request = data ? derivePendingThreadRequests(data) : null;
  const question = request?.userInputs[0]?.questions[0]?.question;
  const approval = request?.approvals[0];
  const messages =
    data?.turnItems.filter(
      (item) => item.type === "assistant_message" || item.type === "user_message",
    ) ?? [];
  const lastAssistant = messages.findLast((item) => item.type === "assistant_message");
  const summary =
    question ||
    approval?.detail ||
    approval?.reason ||
    thread.runtime?.lastError ||
    lastAssistant?.text;
  const send = useOrchestrationCommand(threadEnvironment.startTurn);
  const canSend = useEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope);
  async function submit() {
    const text = reply.trim();
    if (!draft || !text || inFlight.current || !canSend || !connected) return;
    if (/^@claude(?:\s+code)?\b/i.test(text)) {
      onReview(thread, text);
      return;
    }
    inFlight.current = true;
    composer.current?.focus({ preventScroll: true });
    setBusy(true);
    setReceipt(null);
    try {
      const result = await send({
        environmentId: ref.environmentId,
        input: {
          threadId: ref.threadId,
          commandId: CommandId.make(draft.messageId),
          message: { messageId: draft.messageId, role: "user", text, attachments: [] },
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          createdAt: draft.createdAt,
          dispatchMode: "auto",
        },
      });
      if (result._tag === "Success") {
        setDraft((current) => (current?.messageId === draft.messageId ? null : current));
        setReceipt("sent");
      } else setReceipt("failed");
    } catch {
      setReceipt("failed");
    }
    inFlight.current = false;
    setBusy(false);
  }
  const state = category(thread);
  return (
    <article ref={card} className="feed-card" data-state={state} data-selected={selected}>
      <div className="feed-byline">
        <Bot size={16} aria-hidden="true" />
        <strong>{thread.providerInstanceId}</strong>
        <span>·</span>
        <span>{project}</span>
        <time dateTime={thread.updatedAt}>
          {new Date(thread.updatedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </div>
      <h2>{thread.title}</h2>
      <div className="feed-context">
        <span className="feed-state">{messagesForLocale(feedFilters[state])}</span>
        {thread.branch && (
          <span>
            <GitBranch size={12} /> {thread.branch}
          </span>
        )}
      </div>
      {summary && <p className="feed-summary">{summary}</p>}
      {active && files.length > 0 && (
        <Link
          className="feed-result"
          to="/feed/$environmentId/$threadId"
          params={params}
          search={{ panel: "changes" }}
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
              onInspect(e.currentTarget);
              useDiffPanelStore.getState().selectGitScope(ref, "branch");
            }
          }}
          aria-controls="feed-task-details"
          aria-expanded={selected}
          title={gt("Open workspace changes")}
        >
          {thumbnail && (
            <ResultThumbnail
              threadRef={ref}
              path={thumbnail.path}
              revision={branch?.diffHash ?? null}
            />
          )}
          <GitCompareArrows size={16} />
          <span>
            {files.length === 1
              ? files[0]?.path
              : gt("{count, plural, one {{count} file changed} other {{count} files changed}}", {
                  count: files.length,
                })}
          </span>
          {(lineStats.added > 0 || lineStats.removed > 0) && (
            <>
              <small
                aria-label={gt(
                  "{count, plural, one {{count} addition} other {{count} additions}}",
                  { count: lineStats.added },
                )}
                className="feed-added"
              >
                +{lineStats.added}
              </small>
              <small
                aria-label={gt(
                  "{count, plural, one {{count} deletion} other {{count} deletions}}",
                  { count: lineStats.removed },
                )}
                className="feed-removed"
              >
                −{lineStats.removed}
              </small>
            </>
          )}
          {preview.data?.incomplete && (
            <small>
              <T>Tracked so far</T>
            </small>
          )}
        </Link>
      )}
      {pr && /^https?:\/\//i.test(pr.url) && (
        <Link
          className="feed-result"
          to="/feed/$environmentId/$threadId"
          params={params}
          search={{ panel: "pull-request" }}
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) onInspect(e.currentTarget);
          }}
        >
          {gt("PR #{number}", { number: pr.number })}
          {pr.snapshot?.title && " · " + pr.snapshot.title}
        </Link>
      )}
      <div className="feed-actions">
        {(files.length === 0 || state === "attention") && (
          <Link
            to="/feed/$environmentId/$threadId"
            params={params}
            aria-expanded={selected}
            aria-controls="feed-task-details"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onInspect(e.currentTarget);
            }}
            search={{ panel: state === "attention" ? "conversation" : "changes" }}
          >
            {state === "attention" ? (
              <>
                <MessageSquare size={14} /> <T>Review request</T>
              </>
            ) : (
              <>
                <GitCompareArrows size={14} /> <T>Review diff</T>
              </>
            )}
          </Link>
        )}
        {thread.runtime?.status === "failed" && (
          <Link
            to="/settings/providers"
            search={{ environmentId: thread.environmentId, instanceId: thread.providerInstanceId }}
          >
            <T>Provider settings</T>
          </Link>
        )}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            focusReplyOnOpen.current = !expanded;
            setExpanded(!expanded);
          }}
        >
          <MessageSquare size={14} aria-hidden="true" /> <T>Reply</T>
        </button>
        <Link to="/$environmentId/$threadId" params={params}>
          <T>Open thread</T> ↗
        </Link>
      </div>
      <div className="feed-replies" data-open={expanded} inert={!expanded}>
        <div>
          <div className="feed-reply-body">
            {messages.slice(-4).map((item) => (
              <div className="feed-message" key={item.id}>
                <strong>{item.type === "user_message" ? <T>You</T> : <T>Agent</T>}</strong>
                <p>{item.text}</p>
              </div>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <textarea
                ref={composer}
                rows={2}
                aria-label={gt("Reply to {title}", { title: thread.title })}
                readOnly={connected && !canSend}
                aria-busy={busy}
                placeholder={gt("Reply to this task…")}
                value={reply}
                onChange={(e) => {
                  const text = e.target.value;
                  setDraft(
                    text
                      ? { text, messageId: newMessageId(), createdAt: new Date().toISOString() }
                      : null,
                  );
                  setReceipt(null);
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              <Button
                type="submit"
                size="icon-sm"
                aria-label={gt("Send reply")}
                disabled={!connected || !canSend || busy || !reply.trim()}
              >
                <ArrowUp size={16} />
              </Button>
            </form>
            <small role="status">
              {!connected ? (
                <T>Reconnecting. Your draft is saved.</T>
              ) : receipt === "sent" ? (
                <T>Reply sent</T>
              ) : receipt === "failed" ? (
                <T>Send failed. Retry with the send button.</T>
              ) : busy ? (
                <T>Sending…</T>
              ) : (
                "\u00a0"
              )}
            </small>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AgentFeed() {
  const gt = useGT();
  const messagesForLocale = useMessages();
  const [review, setReview] = useState<{ key: string; text: string } | null>(null);
  const agents = useAgentRows();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [limit, setLimit] = useState(20);
  const navigate = useNavigate();
  // During navigation the URL can advance before the route commits. Keep the
  // thread and panel from the same match through the closing animation.
  const panelRoute = useMatch({
    from: "/_chat/feed_/$environmentId/$threadId",
    shouldThrow: false,
    structuralSharing: true,
    select: ({ params, search }) => ({
      environmentId: params.environmentId,
      threadId: params.threadId,
      panel: search.panel,
    }),
  });
  // oxlint-disable-next-line t3code/no-manual-memo -- Panel presence tracks this selection by reference while retaining closing content.
  const selection = useMemo(() => {
    if (!panelRoute) return null;
    const target = resolveThreadRouteTarget(panelRoute);
    return target?.kind === "server" ? { target, mode: panelRoute.panel } : null;
  }, [panelRoute]);
  const target = selection?.target;
  const { active, durationMs } = usePanelAnimationSettings();
  const { present, value } = usePanelPresence(!!target, selection, active, "feed", durationMs);
  const rows = agents
    .filter(
      ({ thread }) => thread.latestRun || thread.hasPendingApprovals || thread.hasPendingUserInput,
    )
    .sort(
      (a, b) =>
        Number(category(b.thread) === "attention") - Number(category(a.thread) === "attention") ||
        b.thread.updatedAt.localeCompare(a.thread.updatedAt),
    );
  const filtered = rows.filter(({ thread }) => filter === "all" || category(thread) === filter);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = !!target;
  const scroller = useRef<HTMLElement>(null);
  const anchor = useRef<{ card: HTMLElement; top: number; left: number } | null>(null);
  const wasOpen = useRef(false);
  function remember(element: HTMLElement | null) {
    const card = element?.closest<HTMLElement>(".feed-card");
    if (!card || !element) return;
    trigger.current = element;
    const rect = card.getBoundingClientRect();
    anchor.current = { card, top: rect.top, left: rect.left };
  }
  function closeDetails() {
    remember(trigger.current);
    void navigate({ to: "/feed" });
  }
  const selectedKey = target && scopedThreadKey(target.threadRef);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Route selection changes restore the clicked card's geometry and native keyboard focus.
  useLayoutEffect(() => {
    const origin = anchor.current;
    const scroll = scroller.current;
    let anim: Animation | undefined;
    if (origin?.card.isConnected && scroll) {
      const rect = origin.card.getBoundingClientRect();
      scroll.scrollTop += rect.top - origin.top;
      const dx = origin.left - rect.left;
      if (active && Math.abs(dx) > 1)
        anim = scroll.firstElementChild?.animate(
          [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
          { duration: durationMs, easing: "cubic-bezier(.2,.75,.25,1)" },
        );
    }
    if (selectedKey) closeButton.current?.focus({ preventScroll: true });
    else if (wasOpen.current) {
      const back = trigger.current?.isConnected
        ? trigger.current
        : scroll?.querySelector<HTMLElement>('button[aria-pressed="true"]');
      back?.focus({ preventScroll: true });
      anchor.current = null;
    }
    wasOpen.current = open;
    return () => anim?.cancel();
  }, [open, selectedKey, active, durationMs, anchor, closeButton, scroller, trigger, wasOpen]);
  return (
    <div
      className="feed-layout"
      data-open={open}
      style={{ "--feed-duration": (active ? durationMs : 0) + "ms" } as React.CSSProperties}
    >
      <section
        ref={scroller}
        className="feed-scroll"
        aria-label={gt("Task feed")}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest('[data-slot="agent-link"]')
          ) {
            remember(event.target);
          }
        }}
      >
        <div data-workspace-content="" className="feed-stream">
          <nav className="feed-filters" aria-label={gt("Filter activity")}>
            {(["all", "attention", "review", "progress"] as const).map((name) => (
              <button
                type="button"
                key={name}
                aria-pressed={filter === name}
                onClick={() => {
                  setFilter(name);
                  setLimit(20);
                }}
              >
                {messagesForLocale(feedFilters[name])}
              </button>
            ))}
          </nav>
          {filtered.slice(0, limit).map(({ key, thread, project }) => (
            <TaskCard
              key={key}
              thread={thread}
              selected={selectedKey === key}
              onInspect={remember}
              onReview={(thread, text) => {
                const ref = scopeThreadRef(thread.environmentId, thread.id);
                remember(
                  document.activeElement instanceof HTMLElement ? document.activeElement : null,
                );
                setReview({ key: scopedThreadKey(ref), text });
                void navigate({
                  to: "/feed/$environmentId/$threadId",
                  params: buildThreadRouteParams(ref),
                  search: { panel: "changes" },
                });
              }}
              project={project.title}
            />
          ))}
          {!filtered.length && (
            <div className="feed-empty">
              <CheckCheck />
              <h2>
                {filter === "attention" ? <T>You’re caught up</T> : <T>No activity here yet</T>}
              </h2>
              <Link to="/workspaces">
                <T>Open workspaces</T> ↗
              </Link>
            </div>
          )}
          {filtered.length > limit && (
            <Button variant="outline" onClick={() => setLimit(limit + 20)}>
              <T>Show more</T>
            </Button>
          )}
        </div>
      </section>
      <aside
        className="feed-detail"
        id="feed-task-details"
        inert={!open}
        aria-label={gt("Task details")}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            closeDetails();
          }
        }}
      >
        {present && value && (
          <div className="feed-detail-inner">
            <header>
              <strong>
                {value.mode === "pull-request" ? (
                  <T>Pull request</T>
                ) : value.mode === "changes" ? (
                  <T>Changes</T>
                ) : (
                  <T>Conversation</T>
                )}
              </strong>
              <Button
                ref={closeButton}
                size="icon-sm"
                variant="ghost"
                aria-label={gt("Close details")}
                onClick={closeDetails}
              >
                <X size={16} />
              </Button>
            </header>
            <div
              className="feed-detail-content"
              key={value.mode + scopedThreadKey(value.target.threadRef)}
            >
              {value.mode === "pull-request" ? (
                <FeedPullRequest threadRef={value.target.threadRef} />
              ) : value.mode === "changes" ? (
                <Suspense
                  fallback={
                    <p>
                      <T>Loading changes…</T>
                    </p>
                  }
                >
                  <DiffPanel
                    renderReview={(patch) => (
                      <ReviewAction
                        threadRef={value.target.threadRef}
                        patch={patch}
                        prompt={
                          review?.key === scopedThreadKey(value.target.threadRef)
                            ? review.text
                            : "Review this diff"
                        }
                      />
                    )}
                    mode="embedded"
                    visible={open}
                    threadRef={value.target.threadRef}
                    composerDraftTarget={value.target.threadRef}
                    workspaceMutationId={null}
                  />
                </Suspense>
              ) : (
                <ThreadRouteView target={value.target} background={false} />
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
