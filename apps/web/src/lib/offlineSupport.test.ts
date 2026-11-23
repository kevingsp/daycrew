// @effect-diagnostics nodeBuiltinImport:off -- Executes the standalone service worker in a disposable VM to verify its cache boundaries.
import * as NodeFS from "node:fs";
import * as NodeVM from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";

const workerSource = NodeFS.readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const files = new Map<string, Response>();
  const addAll = vi.fn(async (urls: string[]) => {
    for (const url of urls) files.set(url, new Response(url));
  });
  const remove = vi.fn(async () => true);
  const fetch = vi.fn(async (_request: unknown) => new Response("private live response"));
  const claim = vi.fn(async () => {});
  NodeVM.runInNewContext(workerSource, {
    self: {
      location: new URL("https://daycrew.example"),
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
      skipWaiting: async () => {},
      clients: { claim },
    },
    caches: {
      open: async () => ({ addAll }),
      match: async (url: string) => files.get(url)?.clone(),
      keys: async () => ["another-app-cache", "daycrew-offline-v0", "daycrew-offline-v1"],
      delete: remove,
    },
    fetch,
    URL,
    Response,
  });
  function lifecycle(name: string) {
    let pending: Promise<void> | undefined;
    handlers.get(name)?.({
      waitUntil: (promise: Promise<void>) => {
        pending = promise;
      },
    });
    return pending;
  }
  function request(path: string, mode = "navigate", method = "GET") {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")?.({
      request: { url: new URL(path, "https://daycrew.example").href, method, mode },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    return response;
  }
  return { lifecycle, request, addAll, remove, fetch, claim };
}

describe("Home Screen offline support", () => {
  it("caches only the public fallback and keeps authenticated navigation network-only", async () => {
    const app = worker();
    await app.lifecycle("install");
    const response = await app.request("/agents");
    expect(await response?.text()).toBe("private live response");
    expect(app.addAll).toHaveBeenCalledExactlyOnceWith(["/offline.html", "/offline-retry.js"]);
    app.fetch.mockRejectedValue(new Error("offline"));
    const offline = await app.request("/feed");
    expect(await offline?.text()).toBe("/offline.html");
    const retry = await app.request("/offline-retry.js", "same-origin");
    expect(await retry?.text()).toBe("/offline-retry.js");
    await app.lifecycle("activate");
    expect(app.remove).toHaveBeenCalledExactlyOnceWith("daycrew-offline-v0");
    expect(app.claim).toHaveBeenCalledOnce();
  });

  it.each([
    ["/api/threads", "navigate", "GET"],
    ["/oauth/callback?code=private", "navigate", "GET"],
    ["/.well-known/openid-configuration", "navigate", "GET"],
    ["https://other.example/agents", "navigate", "GET"],
    ["/api/threads", "same-origin", "POST"],
    ["/assets/private-file.png", "no-cors", "GET"],
  ])("leaves API, auth and non-navigation traffic untouched: %s", async (path, mode, method) => {
    const app = worker();
    await app.lifecycle("install");
    expect(app.request(path, mode, method)).toBeUndefined();
    expect(app.fetch).not.toHaveBeenCalled();
  });
});
