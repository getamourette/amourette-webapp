"use client";

// TEMPORARY preview route (#73). Three comparable directions for the reworked
// match-chat surface, rendered on the real tokens/fonts so the founder can pick
// or mix on a phone via the Vercel preview. Delete this route before the real
// PR — nothing here is wired to data.

import { useState } from "react";

type Variant = "A" | "B" | "C";

type Msg = { id: number; mine: boolean; body: string; time?: string };

const OTHER = {
  name: "Camille",
  photo:
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=600&fit=crop&crop=faces",
  venue: "Le Comptoir",
};

const THREAD: Msg[] = [
  { id: 1, mine: false, body: "J'hésitais à taper. Contente de l'avoir fait." },
  { id: 2, mine: true, body: "Pareil. Tu es où dans la salle ?", time: "22:16" },
  { id: 3, mine: false, body: "Près de la fenêtre. Veste rouge." },
  { id: 4, mine: true, body: "Je te vois. J'arrive.", time: "22:17" },
];

const VARIANT_LABEL: Record<Variant, string> = {
  A: "A · Le chat s'efface",
  B: "B · In-person first",
  C: "C · Couture",
};

function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Received bubble is shared across variants. */
function TheirBubble({ body }: { body: string }) {
  return (
    <div className="max-w-[80%] self-start">
      <p
        className="rounded-[20px] rounded-bl-[7px] border border-cream/[0.06] px-[15px] py-[11px] text-[14.5px] font-light leading-[1.5] text-cream"
        style={{ background: "var(--bordeaux-deep)" }}
      >
        {body}
      </p>
    </div>
  );
}

/* My bubble carries the variant's signature: sober lift (A/B) vs warm wine (C). */
function MyBubble({ body, time, variant }: { body: string; time?: string; variant: Variant }) {
  const warm = variant === "C";
  return (
    <div className="flex max-w-[80%] flex-col items-end self-end">
      <p
        className="rounded-[20px] rounded-br-[7px] px-[15px] py-[11px] text-[14.5px] font-light leading-[1.5] text-cream"
        style={
          warm
            ? {
                background: "linear-gradient(160deg, var(--wine), var(--red-deep))",
                border: "1px solid rgba(var(--champagne-rgb), 0.16)",
              }
            : { background: "var(--bordeaux-warm)" }
        }
      >
        {body}
      </p>
      {time && (
        <time className="mt-[5px] px-1 font-label text-[9.5px] uppercase tracking-[0.12em] text-taupe">
          {time}
        </time>
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-center gap-2 self-start">
      <span
        className="flex gap-1 rounded-[20px] rounded-bl-[7px] border border-cream/[0.06] px-[14px] py-[11px]"
        style={{ background: "var(--bordeaux-deep)" }}
      >
        {[0, 120, 240].map((d) => (
          <span
            key={d}
            className="h-[5px] w-[5px] animate-pulse rounded-full bg-taupe/70"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function Avatar({ size, ring }: { size: number; ring?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={OTHER.photo}
      alt={OTHER.name}
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${ring ? "night-photo-ring" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}

function LiveKicker() {
  return (
    <span className="mt-[6px] flex items-center gap-[7px] font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
      <span
        className="h-[6px] w-[6px] rounded-full bg-red"
        style={{ boxShadow: "0 0 8px rgba(var(--red-rgb),0.9)" }}
      />
      Dans la salle · maintenant
    </span>
  );
}

/* Sober top bar used by A and B. */
function SoberHeader({ variant }: { variant: Variant }) {
  return (
    <header className="flex items-center gap-3 px-[18px] py-4">
      <button className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-cream/[0.08] bg-cream/[0.04] text-cream">
        <BackChevron />
      </button>
      <Avatar size={40} ring />
      <div>
        <div className="font-display text-[22px] italic leading-none">{OTHER.name}</div>
        {variant === "A" ? (
          <div className="mt-[6px] font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
            Ce soir
          </div>
        ) : (
          <LiveKicker />
        )}
      </div>
      <button className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-cream/[0.08] bg-cream/[0.04] text-lg text-taupe">
        ···
      </button>
    </header>
  );
}

/* Photo-bleed header for C. */
function PhotoHeader() {
  return (
    <div className="relative h-[150px] shrink-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={OTHER.photo}
        alt={OTHER.name}
        className="h-full w-full object-cover"
        style={{ objectPosition: "50% 30%" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(var(--velvet-rgb),0.15) 0%, rgba(var(--velvet-rgb),0.35) 40%, var(--velvet) 100%)",
        }}
      />
      <button className="absolute left-[14px] top-[14px] z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full border border-cream/[0.1] bg-velvet/40 text-cream">
        <BackChevron />
      </button>
      <button className="absolute right-[14px] top-[14px] z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full border border-cream/[0.1] bg-velvet/40 text-lg text-taupe">
        ···
      </button>
      <div className="absolute inset-x-[18px] bottom-3 z-10">
        <div className="font-display text-[28px] italic leading-none">{OTHER.name}</div>
        <LiveKicker />
      </div>
    </div>
  );
}

/* B's presence signal: the north-star made visible. */
function PresenceBlock() {
  return (
    <div
      className="mx-[18px] mb-1 flex items-center gap-[11px] rounded-2xl px-[14px] py-3"
      style={{
        background: "linear-gradient(180deg, rgba(var(--wine-rgb),0.18), rgba(29,15,21,0.5))",
        border: "1px solid rgba(var(--champagne-rgb),0.14)",
      }}
    >
      <span
        className="h-[5px] w-[5px] shrink-0 rounded-full bg-champagne"
        style={{ boxShadow: "0 0 8px rgba(var(--champagne-rgb),0.7)" }}
      />
      <div>
        <div className="font-label text-[9.5px] uppercase tracking-[0.22em] text-blush">
          {OTHER.venue} · jusqu&apos;à l&apos;aube
        </div>
        <div className="mt-[3px] text-[13px] font-light text-cream">
          Vous y êtes tous les deux. Le chat ferme au petit matin.
        </div>
      </div>
    </div>
  );
}

function PinnedOpener() {
  return (
    <div className="mx-auto mb-2 mt-1 max-w-[88%] text-center">
      <div className="font-display text-[17px] italic text-cream">Vous avez tapé tous les deux.</div>
      <div className="mt-[7px] font-label text-[9px] uppercase tracking-[0.22em] text-taupe">
        Elle est là, maintenant
      </div>
    </div>
  );
}

function Composer({ variant }: { variant: Variant }) {
  const warmSend = variant === "C";
  return (
    <div
      className="flex items-center gap-[10px] px-[18px] pb-[22px] pt-[14px]"
      style={{ borderTop: "1px solid rgba(var(--cream-rgb),0.06)", background: "rgba(var(--velvet-rgb),0.6)" }}
    >
      <input
        placeholder="Écris quelque chose…"
        className="min-w-0 flex-1 rounded-full border border-cream/[0.08] bg-bordeaux px-4 py-3 text-[14px] font-light text-cream outline-none placeholder:text-taupe/70"
      />
      <button
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={
          warmSend
            ? { background: "var(--cream)", color: "var(--red-deep)" }
            : { background: "rgba(var(--cream-rgb),0.1)", color: "var(--cream)", border: "1px solid rgba(var(--cream-rgb),0.14)" }
        }
      >
        <SendArrow />
      </button>
    </div>
  );
}

function ChatSurface({ variant }: { variant: Variant }) {
  return (
    <div className="night-shell flex h-full flex-col text-cream">
      <div className="night-content flex h-full flex-col">
        {variant === "C" ? <PhotoHeader /> : <SoberHeader variant={variant} />}
        {variant !== "C" && <div className="hairline mx-[18px]" />}
        {variant === "B" && <PresenceBlock />}

        <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] pb-[14px] pt-2">
          {variant === "B" ? (
            <PinnedOpener />
          ) : (
            <div className="my-1 self-center font-label text-[9px] uppercase tracking-[0.24em] text-taupe">
              22:14
            </div>
          )}
          {THREAD.map((m) =>
            m.mine ? (
              <MyBubble key={m.id} body={m.body} time={m.time} variant={variant} />
            ) : (
              <TheirBubble key={m.id} body={m.body} />
            )
          )}
          <TypingBubble />
        </div>

        <Composer variant={variant} />
      </div>
    </div>
  );
}

export default function ChatPreviewPage() {
  const [variant, setVariant] = useState<Variant>("B");

  return (
    <div className="flex h-[100dvh] flex-col bg-velvet">
      {/* Chooser strip — NOT part of the surface, just to switch on the phone. */}
      <div className="flex shrink-0 items-center justify-center gap-1 border-b border-cream/10 bg-[#0a0608] px-3 py-2">
        {(["A", "B", "C"] as Variant[]).map((v) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            className={`rounded-full px-3 py-[6px] font-label text-[10px] uppercase tracking-[0.16em] transition-colors ${
              variant === v ? "bg-cream text-ink" : "text-taupe"
            }`}
          >
            {VARIANT_LABEL[v]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ChatSurface variant={variant} />
      </div>
    </div>
  );
}
