import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  ArrowUp,
  Bot,
  CheckCheck,
  GitBranch,
  GitCompareArrows,
  MessageSquare,
  Rss,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEnvironmentThread, threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useProjects, useQuietThreadShells } from "../state/entities";
import { newMessageId } from "../lib/utils";
import { buildThreadRouteParams, type ThreadRouteTarget } from "../threadRoutes";
import { usePanelAnimationSettings, usePanelPresence } from "../panelAnimations";
import { ThreadRouteView } from "./ThreadRouteView";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";
import { Button } from "./ui/button";
import { useEnvironmentScope } from "../state/session";
import { useEnvironmentShellStatus } from "../state/shell";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { AuthOrchestrationOperateScope, MessageId, CommandId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { T } from "gt-react";
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
  const [receipt, setReceipt] = useState("");
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
      setReceipt(result._tag === "Success" ? "Review sent to Claude" : "Review could not be sent");
    } catch {
      setReceipt("Review could not be sent");
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
        Review with Claude
      </Button>
      <small role="status">
        {receipt ||
          (!model
            ? "Connect Claude Code to request a review."
            : !patch
              ? "Select a complete diff to review."
              : prompt)}
      </small>
    </div>
  );
}
function category(thread: Shell) {
  const status = resolveSidebarThreadStatus(thread);
  if (["approval", "input", "request", "failed", "limited"].includes(status)) return "Needs you";
  if (thread.latestRun?.status === "completed" && !["working", "preparing"].includes(status))
    return "Ready to review";
  return "In progress";
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
  const shell = useQuietThreadShell(threadRef);
  const pr = resolveThreadCurrentPullRequestLink(shell?.pullRequests ?? []);
  if (!pr) return <p className="feed-pr">This task has no linked pull request.</p>;
  const snap = pr.snapshot;
  return (
    <section className="feed-pr">
      <h2>
        #{pr.number} {snap?.title}
      </h2>
      {snap && (
        <>
          <p>
            {snap.isDraft ? "Draft · " : ""}
            {snap.state} · {snap.headBranch} → {snap.baseBranch}
          </p>
          {snap.changedFiles != null && (
            <p>
              {snap.changedFiles} files changed{snap.additions != null && " · +" + snap.additions}
              {snap.deletions != null && " −" + snap.deletions}
            </p>
          )}
        </>
      )}
      {/^https?:\/\//i.test(pr.url) && (
        <a href={pr.url} target="_blank" rel="noreferrer">
          Open pull request ↗
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
  const ref = scopeThreadRef(thread.environmentId, thread.id);
  const params = buildThreadRouteParams(ref);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const draftKey = scopedThreadKey(ref);
  const [draft, setDraft] = useLocalStorage("daycrew:feed-reply:" + draftKey, null, FeedReplyDraft);
  const reply = draft?.text ?? "";
  const connected = useEnvironmentShellStatus(thread.environmentId) === "live";
  const [receipt, setReceipt] = useState("");
  const inFlight = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [visible, setVisible] = useState(false);
  const card = useRef<HTMLElement>(null);
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
    setReceipt("");
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
        setReceipt("Reply sent");
      } else setReceipt("Send failed. Retry with the send button.");
    } catch {
      setReceipt("Send failed. Retry with the send button.");
    }
    inFlight.current = false;
    setBusy(false);
  }
  const state = category(thread);
  return (
    <article ref={card} className="feed-card" data-state={state} data-selected={selected}>
      <div className="feed-byline">
        <Bot size={16} />
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
        <span className="feed-state">{state}</span>
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
          title="Open workspace changes"
        >
          {thumbnail && (
            <ResultThumbnail
              threadRef={ref}
              path={thumbnail.path}
              revision={branch?.diffHash ?? null}
            />
          )}
          <GitCompareArrows size={16} />
          <span>{files.length === 1 ? files[0]?.path : files.length + " files changed"}</span>
          {(lineStats.added > 0 || lineStats.removed > 0) && (
            <>
              <small aria-label={lineStats.added + " additions"} className="feed-added">
                +{lineStats.added}
              </small>
              <small aria-label={lineStats.removed + " deletions"} className="feed-removed">
                −{lineStats.removed}
              </small>
            </>
          )}
          {preview.data?.incomplete && <small>Tracked so far</small>}
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
          PR #{pr.number}
          {pr.snapshot?.title && " · " + pr.snapshot.title}
        </Link>
      )}
      <div className="feed-actions">
        {(files.length === 0 || state === "Needs you") && (
          <Link
            to="/feed/$environmentId/$threadId"
            params={params}
            aria-expanded={selected}
            aria-controls="feed-task-details"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onInspect(e.currentTarget);
            }}
            search={{ panel: state === "Needs you" ? "conversation" : "changes" }}
          >
            {state === "Needs you" ? <MessageSquare size={14} /> : <GitCompareArrows size={14} />}{" "}
            {state === "Needs you" ? "Review request" : "Review diff"}
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
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <MessageSquare size={14} /> Replies
        </button>
        <Link to="/$environmentId/$threadId" params={params}>
          Open thread ↗
        </Link>
      </div>
      <div className="feed-replies" data-open={expanded} inert={!expanded}>
        <div>
          <div className="feed-reply-body">
            {messages.slice(-4).map((item) => (
              <div className="feed-message" key={item.id}>
                <strong>{item.type === "user_message" ? "You" : "Agent"}</strong>
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
                aria-label={"Reply to " + thread.title}
                readOnly={connected && !canSend}
                aria-busy={busy}
                placeholder="Reply to this task…"
                value={reply}
                onChange={(e) => {
                  const text = e.target.value;
                  setDraft(
                    text
                      ? { text, messageId: newMessageId(), createdAt: new Date().toISOString() }
                      : null,
                  );
                  setReceipt("");
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
                aria-label="Send reply"
                disabled={!connected || !canSend || busy || !reply.trim()}
              >
                <ArrowUp size={16} />
              </Button>
            </form>
            <small role="status">
              {!connected ? (
                <T>Reconnecting. Your draft is saved.</T>
              ) : (
                receipt || (busy ? <T>Sending…</T> : "\u00a0")
              )}
            </small>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AgentFeed({ target }: { target: Target | null }) {
  const [review, setReview] = useState<{ key: string; text: string } | null>(null);
  const threads = useQuietThreadShells();
  const projects = useProjects();
  const [filter, setFilter] = useState("All");
  const [limit, setLimit] = useState(20);
  const navigate = useNavigate();
  const mode = useRouterState({
    select: (s) =>
      new URLSearchParams(s.location.searchStr).get("panel") === "pull-request"
        ? "pull-request"
        : new URLSearchParams(s.location.searchStr).get("panel") === "changes"
          ? "changes"
          : "conversation",
  });
  const { active, durationMs } = usePanelAnimationSettings();
  const environmentId = target?.threadRef.environmentId;
  const threadId = target?.threadRef.threadId;
  const selection = useMemo(
    () =>
      environmentId && threadId
        ? {
            target: { kind: "server" as const, threadRef: scopeThreadRef(environmentId, threadId) },
            mode,
          }
        : null,
    [environmentId, threadId, mode],
  );
  const { present, value } = usePanelPresence(!!target, selection, active, "feed", durationMs);
  const rows = threads
    .filter(
      (t) =>
        !t.archivedAt &&
        !t.deletedAt &&
        !t.lineage.sideChat &&
        (t.latestRun || t.hasPendingApprovals || t.hasPendingUserInput) &&
        projects.some(
          (p) => !p.archivedAt && p.id === t.projectId && p.environmentId === t.environmentId,
        ),
    )
    .sort(
      (a, b) =>
        Number(category(b) === "Needs you") - Number(category(a) === "Needs you") ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const filtered = rows.filter((t) => filter === "All" || category(t) === filter);
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
  }, [open, selectedKey, active, durationMs]);
  return (
    <SidebarInset
      className="feed-layout"
      data-open={open}
      style={{ "--feed-duration": (active ? durationMs : 0) + "ms" } as React.CSSProperties}
    >
      <section ref={scroller} className="feed-scroll" aria-label="Task feed">
        <div className="feed-stream">
          <header>
            <SidebarTrigger className="md:hidden" />
            <h1>
              <Rss size={22} /> Agent feed
            </h1>
          </header>
          <nav className="feed-filters" aria-label="Filter activity">
            {["All", "Needs you", "Ready to review", "In progress"].map((name) => (
              <button
                key={name}
                aria-pressed={filter === name}
                onClick={() => {
                  setFilter(name);
                  setLimit(20);
                }}
              >
                {name}
              </button>
            ))}
          </nav>
          {filtered.slice(0, limit).map((t) => (
            <TaskCard
              key={scopedThreadKey(scopeThreadRef(t.environmentId, t.id))}
              thread={t}
              selected={selectedKey === scopedThreadKey(scopeThreadRef(t.environmentId, t.id))}
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
              project={
                projects.find((p) => p.id === t.projectId && p.environmentId === t.environmentId)
                  ?.title ?? ""
              }
            />
          ))}
          {!filtered.length && (
            <div className="feed-empty">
              <CheckCheck />
              <h2>{filter === "Needs you" ? "You’re caught up" : "No activity here yet"}</h2>
              <Link to="/workspaces">Open workspaces ↗</Link>
            </div>
          )}
          {filtered.length > limit && (
            <Button variant="outline" onClick={() => setLimit(limit + 20)}>
              Show more
            </Button>
          )}
        </div>
      </section>
      <aside
        className="feed-detail"
        id="feed-task-details"
        inert={!open}
        aria-label="Task details"
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
                {value.mode === "pull-request"
                  ? "Pull request"
                  : value.mode === "changes"
                    ? "Changes"
                    : "Conversation"}
              </strong>
              <Button
                ref={closeButton}
                size="icon-sm"
                variant="ghost"
                aria-label="Close details"
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
                <Suspense fallback={<p>Loading changes…</p>}>
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
    </SidebarInset>
  );
}
