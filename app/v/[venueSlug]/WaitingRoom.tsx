"use client";

// Waiting room (#106): the empty state a checked-in user sees before any
// compatible profile has arrived. It speaks the v2 system (docs/design.md):
// velvet ground, Fraunces italic, Jost tracked labels, red only as an event,
// blush as the soft state. Editorial and structured ("En attendant", the chosen
// direction): a calm reframe, then the two things you can actually do now — the
// bio lever (the only real "improve your odds" move, no second photo) and the
// notify opt-in (browser push).
//
// The live count is intentionally NOT shown here: the persistent room chrome
// already renders "Amourette · venue · ● N" at the top, so repeating it duped.
// Copy stays agnostic of the launch trigger (1-compatible vs headcount/schedule
// is undecided, see docs/decisions.md), so the notify opt-in is the real safety
// net regardless of how a night ends up "opening".

import { useState } from "react";
import Link from "next/link";
import { t } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export function WaitingRoom({
  venueName,
  hasBio,
  polishPath,
  onLeave,
  s,
}: {
  venueName: string;
  hasBio: boolean;
  polishPath: string;
  onLeave: () => void;
  s: RoomStrings;
}) {
  const w = s.waiting;
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-10 pt-28">
      <h2 className="wordmark mt-2 text-[2.75rem] leading-[1.02] text-cream">
        {w.title}
      </h2>
      <p className="mt-4 max-w-sm leading-relaxed text-taupe">{w.body}</p>

      <p className="night-kicker mt-10">{w.kicker}</p>

      {/* The bio lever. Empty gets a pointed message + a blush "à compléter" tag
          (blush = soft state, never red); filled degrades to a gentle nudge. */}
      <Link
        href={polishPath}
        className="night-card-hot mt-4 flex items-start justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-body text-[15px] text-cream">
              {hasBio ? w.bioFullTitle : w.bioEmptyTitle}
            </p>
            {!hasBio && (
              <span className="rounded-full border border-blush/30 px-2 py-0.5 font-label text-[10px] uppercase tracking-[0.14em] text-blush">
                {w.bioEmptyBadge}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-snug text-taupe">
            {hasBio ? w.bioFullBody : w.bioEmptyBody}
          </p>
        </div>
        <span aria-hidden className="mt-0.5 shrink-0 text-taupe">
          →
        </span>
      </Link>

      <NotifyCard venueName={venueName} s={s} />

      <button
        type="button"
        onClick={onLeave}
        className="mt-8 self-center text-xs text-taupe/70 transition-colors hover:text-taupe"
      >
        {s.leave}
      </button>
    </div>
  );
}

type NotifPermission = "unsupported" | "default" | "granted" | "denied";

// The notify opt-in. This is the browser-permission brick of web-push: it asks
// for the Notification permission so a real subscription flow (service worker +
// pushManager.subscribe + persisting the subscription server-side) has something
// to build on — that backend piece is the next step, wired at the TODO below.
// Note: on iOS the Notification API only exists once the app is installed to the
// home screen (PWA); in plain mobile Safari this renders nothing ("unsupported")
// rather than promising a notification it cannot deliver.
function NotifyCard({
  venueName,
  s,
}: {
  venueName: string;
  s: RoomStrings;
}) {
  const w = s.waiting;
  // The waiting room only ever mounts client-side (the page starts at
  // status="loading" and resolves session/venue/candidates before this renders),
  // so reading the browser permission in a lazy initializer is safe: no SSR pass
  // renders this, hence no hydration mismatch and no set-state-in-effect.
  const [perm, setPerm] = useState<NotifPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission as NotifPermission;
  });

  async function enable() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result as NotifPermission);
    // TODO(web-push): if result === "granted", register the service worker,
    // subscribe via registration.pushManager.subscribe({ applicationServerKey }),
    // and POST the subscription to the backend so the night can push to it.
  }

  if (perm === "unsupported") return null;

  if (perm === "granted") {
    return (
      <div className="night-card mt-3 flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="font-body text-[15px] text-cream">{w.notifOnTitle}</p>
          <p className="mt-1 text-sm leading-snug text-taupe">
            {w.notifOnBody(venueName)}
          </p>
        </div>
        <span aria-hidden className="shrink-0 text-blush">
          ✓
        </span>
      </div>
    );
  }

  if (perm === "denied") {
    return (
      <div className="night-card mt-3 p-5">
        <p className="font-body text-[15px] text-cream">{w.notifOffTitle}</p>
        <p className="mt-1 text-sm leading-snug text-taupe">{w.notifOffBody}</p>
      </div>
    );
  }

  // default (not yet asked): the actionable opt-in, the one obvious "turn on
  // notifications" affordance.
  return (
    <button
      type="button"
      onClick={enable}
      className="night-card mt-3 flex w-full items-center justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
    >
      <div className="min-w-0">
        <p className="font-body text-[15px] text-cream">{w.notifTitle}</p>
        <p className="mt-1 text-sm leading-snug text-taupe">{w.notifBody}</p>
      </div>
      <span aria-hidden className="shrink-0 text-taupe">
        →
      </span>
    </button>
  );
}
