"use client";

// SCRATCH ROUTE — room-screen chrome exploration for #83. Self-contained (no
// auth, no Supabase): it renders the real full-bleed RoomFeedCard surface with
// the real CSS classes and mock data, so the chrome can be judged on the true
// surface before locking pixels. Deleted before merge, like room-hero-lab.
//
// Converged direction (Marwane's calls on the 3-variant lab):
//  - Wordmark-led: "Amourette" anchors top-left (brand recall), with the venue
//    name + a red-dot "N here now" live line beneath (the venue-led treatment he
//    liked). The slim-bar variant is dropped.
//  - ONE ⋯ only, top-right. It is context-aware: because the feed is one profile
//    per viewport, the menu carries that person's safety actions (Report/Block)
//    on top, then the room/self actions. This kills the two-stacked-⋯ problem.
//  - Matches float as an overlay (never push the photo). Two presentations to
//    compare: the full pill "strip" vs a compact collapsed "pill".

import { useState } from "react";

// A bright, white/gold-topped synthetic photo to stress-test on-photo header
// legibility (the real risk: cream micro-label over a light top third). The
// night grade + top scrim must keep it readable.
const BRIGHT_PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fdf6e3"/><stop offset="0.5" stop-color="#e9c46a"/><stop offset="1" stop-color="#b08968"/></linearGradient></defs><rect width="800" height="1100" fill="url(#g)"/><circle cx="400" cy="430" r="230" fill="#f2d3b6"/><rect x="150" y="40" width="500" height="120" rx="16" fill="#ffffff" opacity="0.85"/></svg>`
  );

type Candidate = {
  first_name: string;
  photo_url: string;
  bio: string | null;
  justArrived: boolean;
};

const CANDIDATES: Candidate[] = [
  {
    first_name: "Camille",
    photo_url: "/test-profiles/portrait-1.svg",
    bio: "Architecte le jour, DJ house le week-end. Je cherche quelqu'un qui sait perdre à la belote.",
    justArrived: true,
  },
  {
    first_name: "Sofia",
    photo_url: "/test-profiles/portrait-2.svg",
    bio: "Trop de livres, pas assez d'étagères.",
    justArrived: false,
  },
  {
    first_name: "Léa",
    photo_url: "/test-profiles/portrait-3.svg",
    bio: "Je fais le meilleur negroni de l'arrondissement et je ne l'ai jamais prouvé à personne. Peut-être ce soir. On verra si tu tiens la conversation assez longtemps pour mériter le deuxième verre, parce que le premier est offert d'office mais le deuxième se gagne.",
    justArrived: false,
  },
  {
    first_name: "Inès",
    photo_url: BRIGHT_PHOTO,
    bio: "Photo trop lumineuse exprès — test du scrim.",
    justArrived: true,
  },
  {
    first_name: "Jade",
    photo_url: "/test-profiles/portrait-5.svg",
    bio: null,
    justArrived: false,
  },
];

const SHORT_VENUE = "Le Perchoir";
const LONG_VENUE = "The Absolutely Enormous Rooftop Bar & Cocktail Lounge";

type MatchMode = "off" | "strip" | "pill";

export default function RoomChromeLab() {
  const [idx, setIdx] = useState(0);
  const [matchMode, setMatchMode] = useState<MatchMode>("off");
  const [longVenue, setLongVenue] = useState(false);

  const candidate = CANDIDATES[idx];
  const venue = longVenue ? LONG_VENUE : SHORT_VENUE;
  const count = 12;

  return (
    <main className="night-shell flex h-dvh min-h-0 flex-col text-cream">
      {/* The phone column. The full-bleed card fills it; all chrome floats on
          top as overlays, so the photo is ALWAYS full-screen (the fix for
          "matches strip pushes the photo down"). */}
      <div className="night-content relative mx-auto min-h-0 w-full max-w-md flex-1 overflow-hidden sm:border-x sm:border-champagne/10">
        <CardSurface candidate={candidate} />
        <Chrome venue={venue} count={count} matchMode={matchMode} name={candidate.first_name} />
      </div>

      <LabControls
        matchMode={matchMode}
        setMatchMode={setMatchMode}
        longVenue={longVenue}
        setLongVenue={setLongVenue}
        onPrev={() => setIdx((i) => (i - 1 + CANDIDATES.length) % CANDIDATES.length)}
        onNext={() => setIdx((i) => (i + 1) % CANDIDATES.length)}
        candidateName={candidate.first_name}
      />
    </main>
  );
}

// ── The real full-bleed card surface, minus the on-photo header (chrome owns
//    that). Faithful port of RoomFeedCard's layered night treatment + identity
//    block + heart. ────────────────────────────────────────────────────────────
function CardSurface({ candidate }: { candidate: Candidate }) {
  const c = candidate;
  const [liked, setLiked] = useState(false);
  return (
    <section className="absolute inset-0 h-full w-full overflow-hidden bg-bordeaux">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={c.photo_url}
        alt={c.first_name}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="room-grade pointer-events-none absolute inset-0" />
      <div className="room-key pointer-events-none absolute inset-0" />
      <div className="room-vignette pointer-events-none absolute inset-0" />
      <div className="room-grain pointer-events-none absolute inset-0" />
      <div className="room-top-scrim pointer-events-none absolute inset-x-0 top-0 h-40" />
      <div className="room-identity-scrim pointer-events-none absolute inset-0" />

      <div className="room-card-enter absolute inset-x-6 bottom-11 text-center">
        {c.justArrived && (
          <p className="night-kicker mb-3 text-[10px]">Just arrived</p>
        )}
        <h2
          className="wordmark text-[3.25rem] leading-[0.96] text-cream"
          style={{ textShadow: "0 1px 22px rgba(18,10,15,.7)" }}
        >
          {c.first_name}
        </h2>
        {c.bio && (
          <p
            className="mx-auto mt-3 line-clamp-2 max-w-[250px] font-body text-sm font-light leading-relaxed text-taupe"
            style={{ textShadow: "0 1px 16px rgba(18,10,15,.6)" }}
          >
            {c.bio}
          </p>
        )}
        <hr className="hairline mx-auto my-5 w-16" />
        <button
          onClick={() => setLiked((v) => !v)}
          className={`heart-button px-8 py-[15px] text-xs ${liked ? "heart-liked cursor-default" : "heart-idle"}`}
        >
          <span aria-hidden className="text-base leading-none">
            {liked ? "♥" : "♡"}
          </span>
          {liked ? "Liked" : "Like"}
        </button>
      </div>
    </section>
  );
}

// ── The converged chrome ─────────────────────────────────────────────────────
function Chrome({
  venue,
  count,
  matchMode,
  name,
}: {
  venue: string;
  count: number;
  matchMode: MatchMode;
  name: string;
}) {
  return (
    <>
      {/* Header row: wordmark + live line (left), the single ⋯ (right). */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p
            className="wordmark text-lg text-cream"
            style={{ textShadow: "0 1px 18px rgba(18,10,15,.9)" }}
          >
            Amourette
          </p>
          <div className="mt-1">
            <LiveLine venue={venue} count={count} />
          </div>
        </div>
        <div className="shrink-0">
          <RoomMenu name={name} />
        </div>
      </div>

      {/* Matches float below the header, never pushing the photo. */}
      {matchMode !== "off" && (
        <div className="absolute inset-x-0 top-[92px] z-20 px-5">
          {matchMode === "strip" ? <MatchesStrip /> : <MatchesPill />}
        </div>
      )}
    </>
  );
}

// The live line, reworked from "Tonight at <venue>": the venue name is its own
// token (truncated), the live count a separate red-dot micro-label.
function LiveLine({ venue, count }: { venue: string; count: number }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      style={{ textShadow: "0 1px 18px rgba(18,10,15,.95)" }}
    >
      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-red shadow-[0_0_10px_rgba(204,20,54,.85)]" />
      <span className="min-w-0 truncate font-label text-[10px] uppercase tracking-[0.24em] text-taupe">
        <span className="text-cream">{venue}</span>
        <span className="px-1.5 text-champagne/50">·</span>
        {count} here now
      </span>
    </div>
  );
}

// The single, context-aware ⋯. Closes on ANY outside tap (fixes the #83 bug:
// today's backdrop sits behind the sticky bar so tapping the bar can't close
// it). Top zone = this person's safety actions; then room/self actions.
function RoomMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Options"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/60 text-lg leading-none text-cream backdrop-blur"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="night-panel absolute right-0 z-50 mt-2 grid w-56 gap-2 p-2">
            {/* This person — safety, blush, never red. */}
            <p className="px-2 pt-1 font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
              {name}
            </p>
            <button className="night-button night-button-danger px-4 py-3 text-xs">
              Report
            </button>
            <button className="night-button night-button-danger px-4 py-3 text-xs">
              Block
            </button>
            <hr className="hairline my-1" />
            {/* You & the room. */}
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Edit my profile
            </button>
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Language
            </button>
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Go invisible
            </button>
            <button className="night-button night-button-secondary px-4 py-3 text-xs">
              Leave the room
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const MATCHES = [
  { name: "Anaïs", src: "/test-profiles/portrait-4.svg", unread: 2 },
  { name: "Manon", src: "/test-profiles/portrait-6.svg", unread: 0 },
];

// Full pill strip: avatar + name + unread badge per match.
function MatchesStrip() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {MATCHES.map((p) => (
        <div
          key={p.name}
          className="night-card-hot flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 backdrop-blur"
        >
          <span className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.name} className="night-photo-ring h-8 w-8 rounded-full object-cover" />
            {p.unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blush px-1 text-[10px] font-semibold text-ink">
                {p.unread}
              </span>
            )}
          </span>
          <span className="text-sm font-medium text-cream">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// Collapsed pill: overlapping avatars + "N matches" + unread dot. Taps open the
// full strip inline (would route to the matches list in the real app).
function MatchesPill() {
  const [expanded, setExpanded] = useState(false);
  const unread = MATCHES.reduce((n, m) => n + m.unread, 0);
  if (expanded) return <MatchesStrip />;
  return (
    <button
      onClick={() => setExpanded(true)}
      className="night-card-hot inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 backdrop-blur"
    >
      <span className="flex items-center">
        {MATCHES.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.name}
            src={p.src}
            alt={p.name}
            className={`night-photo-ring h-8 w-8 rounded-full object-cover ${i > 0 ? "-ml-3" : ""}`}
          />
        ))}
      </span>
      <span className="text-sm font-medium text-cream">
        {MATCHES.length} matches
      </span>
      {unread > 0 && <span className="h-2 w-2 rounded-full bg-blush" />}
    </button>
  );
}

// ── Lab controls (scaffolding, not part of the design). ──────────────────────
function LabControls({
  matchMode,
  setMatchMode,
  longVenue,
  setLongVenue,
  onPrev,
  onNext,
  candidateName,
}: {
  matchMode: MatchMode;
  setMatchMode: (v: MatchMode) => void;
  longVenue: boolean;
  setLongVenue: (v: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  candidateName: string;
}) {
  const modes: MatchMode[] = ["off", "strip", "pill"];
  return (
    <div className="shrink-0 border-t border-champagne/20 bg-ink/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-taupe">
          <span className="shrink-0">Matches</span>
          <div className="grid flex-1 grid-cols-3 gap-2">
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => setMatchMode(m)}
                className={`rounded-full px-2 py-2 transition ${
                  matchMode === m ? "bg-cream text-ink" : "border border-champagne/25 text-taupe"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-taupe">
          <button
            onClick={() => setLongVenue(!longVenue)}
            className={`rounded-full border px-3 py-1.5 transition ${longVenue ? "border-blush/50 text-cream" : "border-champagne/25"}`}
          >
            {longVenue ? "Long venue" : "Short venue"}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onPrev} className="rounded-full border border-champagne/25 px-3 py-1.5">
              ‹
            </button>
            <span className="w-16 text-center normal-case text-cream">{candidateName}</span>
            <button onClick={onNext} className="rounded-full border border-champagne/25 px-3 py-1.5">
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
