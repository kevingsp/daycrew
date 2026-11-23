import { useAtomValue } from "@effect/atom-react";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import { collectLimitAccounts, remainingPercent } from "@t3tools/shared/usageLimits";
import { formatResetsIn, limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { T, useGT, useLocale, useMessages } from "gt-react";
import { GaugeIcon, MonitorIcon, RefreshCwIcon } from "lucide-react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { useQuietThreadShells } from "../../state/entities";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { environmentPresentations } from "../../state/presentation";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { providerClients } from "../settings/providerDriverMeta";
import { Button } from "../ui/button";

function MachineRow({
  environment,
  activeAgents,
}: {
  readonly environment: EnvironmentPresentation;
  readonly activeAgents: number;
}) {
  const gt = useGT();
  const locale = useLocale();
  const connected = environment.connection.phase === "connected";
  const resources = useEnvironmentQuery(
    connected
      ? serverEnvironment.hostResources({ environmentId: environment.environmentId, input: {} })
      : null,
  );
  const snapshot = resources.error === null ? resources.data : null;
  const memory =
    snapshot && snapshot.totalMemoryBytes > 0
      ? Math.max(0, Math.min(1, 1 - snapshot.availableMemoryBytes / snapshot.totalMemoryBytes))
      : null;
  const gb = (bytes: number) =>
    (bytes / 2 ** 30).toLocaleString(locale, { maximumFractionDigits: 1 });
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            connected ? "bg-success" : "bg-muted-foreground/50",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{environment.label}</span>
        <span className="text-xs text-muted-foreground">
          {connected ? gt("Online") : gt("Offline")}
        </span>
        {connected && (
          <Button
            size="icon-xs"
            variant="ghost-muted"
            disabled={resources.isPending}
            aria-label={gt("Refresh {machine}", { machine: environment.label })}
            onClick={resources.refresh}
          >
            <RefreshCwIcon />
          </Button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-3.5 text-xs text-muted-foreground">
        <span>
          {connected
            ? gt("{count} active agents", { count: activeAgents })
            : gt("Reconnect to see activity")}
        </span>
        <span>
          {connected && snapshot && memory !== null
            ? gt("{used} / {total} GB memory", {
                used: gb(snapshot.totalMemoryBytes - snapshot.availableMemoryBytes),
                total: gb(snapshot.totalMemoryBytes),
              })
            : connected
              ? resources.isPending
                ? gt("Loading…")
                : gt("Memory unavailable")
              : gt("Unavailable")}
        </span>
      </div>
      {connected && memory !== null && (
        <div
          className="mt-2 ml-3.5 h-1 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={gt("Memory usage")}
          aria-valuenow={Math.round(memory * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full", memory > 0.9 ? "bg-warning" : "bg-foreground/35")}
            style={{ width: `${memory * 100}%` }}
          />
        </div>
      )}
    </li>
  );
}

export function WorkspaceResources() {
  const gt = useGT();
  const m = useMessages();
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const { environments } = useEnvironments();
  const threads = useQuietThreadShells();
  const connected = new Map(
    [...presentations].filter(([, presentation]) => presentation.connection.phase === "connected"),
  );
  const accounts = collectLimitAccounts(connected);
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2" data-workspace-resources="">
      <section
        data-workspace-glass=""
        className="min-w-0 rounded-xl border border-border/60 p-4"
        aria-label={gt("Provider headroom")}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <GaugeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <T>Provider headroom</T>
          </h2>
          <Link
            to="/usage"
            className="rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <T>View usage</T>
          </Link>
        </div>
        {accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            <T>No limits reported.</T>
          </p>
        ) : (
          <ul className="max-h-48 divide-y divide-border/50 overflow-y-auto">
            {accounts.map((account) => {
              const name =
                account.displayName ??
                providerClients.get(account.driver)?.label ??
                String(account.driver);
              const notice = limitsNotice(account.limits, m);
              return (
                <li key={account.key} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 text-sm">
                    <ProviderInstanceIcon
                      driverKind={account.driver}
                      displayName={name}
                      accentColor={account.accentColor}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 truncate font-medium">
                      {name}
                      {account.email ? ` · ${account.email}` : ""}
                    </span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {account.plan}
                    </span>
                  </div>
                  {notice ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">{notice}</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {account.limits.windows.map((window) => {
                        const left = remainingPercent(window);
                        const reset = formatResetsIn(window, now, m);
                        return (
                          <Link
                            key={window.id}
                            to="/usage"
                            className="grid grid-cols-[minmax(0,1fr)_4rem_auto] items-center gap-x-3 gap-y-0.5 rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <span className="truncate text-muted-foreground">{window.label}</span>
                            <span
                              className="h-1 overflow-hidden rounded-full bg-muted"
                              aria-hidden="true"
                            >
                              <span
                                className={cn(
                                  "block h-full rounded-full",
                                  left <= 10 ? "bg-warning" : "bg-foreground/45",
                                )}
                                style={{ width: `${left}%` }}
                              />
                            </span>
                            <span className="text-right tabular-nums">
                              {gt("{left}% left", { left })}
                            </span>
                            {reset && (
                              <span className="col-span-3 text-muted-foreground">{reset}</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section
        data-workspace-glass=""
        className="min-w-0 rounded-xl border border-border/60 p-4"
        aria-label={gt("Machines")}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <MonitorIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <T>Machines</T>
          </h2>
          <span className="text-xs text-muted-foreground">
            <T>Memory snapshot</T>
          </span>
        </div>
        <ul className="max-h-48 divide-y divide-border/50 overflow-y-auto">
          {environments.map((environment) => (
            <MachineRow
              key={environment.environmentId}
              environment={environment}
              activeAgents={
                threads.filter(
                  (thread) =>
                    thread.environmentId === environment.environmentId &&
                    thread.archivedAt === null &&
                    thread.deletedAt === null &&
                    threadRuntimeIsActive(thread.runtime),
                ).length
              }
            />
          ))}
        </ul>
        {environments.length === 0 && (
          <p className="text-xs text-muted-foreground">
            <T>No connected environments.</T>
          </p>
        )}
      </section>
    </div>
  );
}
