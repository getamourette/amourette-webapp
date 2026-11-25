"use client";

import { useSyncExternalStore } from "react";
import { guestSession } from "@/lib/auth";
import { t } from "@/lib/strings";
import { usePreferredLocale } from "@/lib/useLocale";

// Covers the page while the guest session cannot be used (#480): a failed
// refresh waits for the network with the same identity, and an ended session
// waits for the guest to choose to start again. Only guest pages call
// ensureAnonSession(), so the admin never sees it.
export function SessionNotice() {
  const state = useSyncExternalStore(guestSession.subscribe, guestSession.getState, () => "ok" as const);
  const s = t[usePreferredLocale()].session;
  if (state === "ok") return null;

  const ended = state === "ended";
  return (
    <div
      role={ended ? "alertdialog" : "status"}
      aria-modal={ended ? true : undefined}
      aria-labelledby="session-notice-title"
      aria-describedby="session-notice-body"
      data-testid="session-notice"
      className="night-shell fixed inset-0 z-[100] flex flex-col items-center justify-center px-8 text-center"
    >
      <div className="night-content flex w-full max-w-sm flex-col items-center gap-4">
        <h1 id="session-notice-title" className="font-display text-3xl italic text-cream">
          {ended ? s.endedTitle : s.reconnectingTitle}
        </h1>
        <p id="session-notice-body" className="text-base font-light leading-relaxed text-blush">
          {ended ? s.endedBody : s.reconnectingBody}
        </p>
        {ended && (
          <button
            type="button"
            className="night-button night-button-primary mt-4 w-full px-5 py-3"
            onClick={() => {
              guestSession.forgetIdentity();
              // A room or onboarding URL leads a new guest to her profile; a
              // chat or other page has nothing to show her, so start at home.
              const path = window.location.pathname;
              if (path.startsWith("/v/") || path === "/profile") window.location.reload();
              else window.location.assign("/");
            }}
          >
            {s.startAgain}
          </button>
        )}
      </div>
    </div>
  );
}
