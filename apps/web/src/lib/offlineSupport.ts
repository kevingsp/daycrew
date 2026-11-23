import { isElectron } from "../env";

export function registerOfflineSupport() {
  if (
    !import.meta.env.PROD ||
    isElectron ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  )
    return;
  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .catch((error: unknown) => {
      console.warn("Could not prepare Daycrew for offline navigation.", error);
    });
}
