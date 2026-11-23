import { T, useGT } from "gt-react";
import { ShareIcon, SmartphoneIcon } from "lucide-react";

import { isElectron } from "../../env";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { T3Wordmark } from "../T3Wordmark";

export function InstallDaycrew() {
  const gt = useGT();
  const mobile = useMediaQuery("max-md");
  const standalone = useMediaQuery("(display-mode: standalone)");
  if (isElectron || !mobile || standalone) return null;
  return (
    <Dialog>
      <DialogTrigger
        render={<Button size="sm" variant="ghost" />}
        aria-label={gt("Install Daycrew")}
      >
        <SmartphoneIcon />
        <T>Install</T>
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl border border-border bg-muted">
            <T3Wordmark aria-hidden="true" className="size-6" />
          </span>
          <DialogTitle>
            <T>Daycrew on your Home Screen</T>
          </DialogTitle>
          <DialogDescription>
            <T>Your prompts and agents, one tap away.</T>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-6 text-sm">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <T>Open Daycrew in Safari on your iPhone.</T>
            </li>
            <li>
              <T>Tap Share, then Add to Home Screen.</T>{" "}
              <ShareIcon aria-hidden="true" className="ml-1 inline size-4" />
            </li>
            <li>
              <T>Choose Open as Web App if shown, then tap Add.</T>
            </li>
          </ol>
          <p className="text-muted-foreground">
            <T>On Android, open your browser menu and choose Install app or Add to Home screen.</T>
          </p>
          <p className="border-t border-border pt-4 text-muted-foreground">
            <T>Keep your computer and Daycrew running to reach your agents from your phone.</T>
          </p>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
