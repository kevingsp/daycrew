import { getPairingTokenFromUrl, stripPairingTokenFromUrl } from "@t3tools/shared/remote";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { PairingRouteSurface } from "./PairingRouteSurface";

const submitCredential = vi.hoisted(() => vi.fn<(token: string) => Promise<void>>());

vi.mock("../../environments/primary", () => ({
  peekPairingTokenFromUrl: () => getPairingTokenFromUrl(new URL(window.location.href)),
  stripPairingTokenFromUrl: () =>
    window.history.replaceState(
      window.history.state,
      "",
      stripPairingTokenFromUrl(new URL(window.location.href)),
    ),
  submitServerAuthCredential: submitCredential,
}));
vi.mock("../../connection/onboarding", () => ({ connectPairing: {} }));

function pairingLocation(): Disposable {
  const previous = window.location.href;
  window.history.replaceState(window.history.state, "", "#token=expired-pairing-token");
  return {
    [Symbol.dispose]: () => window.history.replaceState(window.history.state, "", previous),
  };
}

it("accepts a fresh pairing link after an expired link without reloading the form", async () => {
  submitCredential.mockReset();
  submitCredential.mockRejectedValueOnce(new Error("The pairing token has expired."));
  submitCredential.mockResolvedValue(undefined);
  using _location = pairingLocation();
  const authenticated = vi.fn();
  await using screen = await render(
    <PairingRouteSurface
      auth={{
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["browser-session-cookie"],
        sessionCookieName: "test-session",
      }}
      onAuthenticated={authenticated}
    />,
  );
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("The pairing token has expired.");
  expect(window.location.hash).toBe("");
  await act(() => {
    window.history.replaceState(window.history.state, "", "#token=fresh-pairing-token");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await vi.waitFor(() => expect(authenticated).toHaveBeenCalledOnce());
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(window.location.hash).toBe("");
  await act(() => {
    window.history.replaceState(window.history.state, "", "#token=fresh-pairing-token");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(submitCredential.mock.calls.map(([token]) => token)).toEqual([
    "expired-pairing-token",
    "fresh-pairing-token",
  ]);
  expect(window.location.hash).toBe("");
});

it("keeps a fresh pairing result when an older request fails later", async () => {
  submitCredential.mockReset();
  const pending = Promise.withResolvers<void>();
  submitCredential.mockReturnValueOnce(pending.promise);
  submitCredential.mockResolvedValue(undefined);
  using _location = pairingLocation();
  const authenticated = vi.fn();
  await using screen = await render(
    <PairingRouteSurface
      auth={{
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["browser-session-cookie"],
        sessionCookieName: "test-session",
      }}
      onAuthenticated={authenticated}
    />,
  );
  await expect
    .element(screen.getByRole("button", { name: "Pairing...", exact: true }))
    .toBeDisabled();
  await act(() => {
    window.history.replaceState(window.history.state, "", "#token=fresh-pairing-token");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await vi.waitFor(() => expect(authenticated).toHaveBeenCalledOnce());
  await act(async () => {
    pending.reject(new Error("The old pairing token has expired."));
    await pending.promise.catch(() => {});
  });
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  expect(authenticated).toHaveBeenCalledOnce();
});
