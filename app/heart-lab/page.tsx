"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

type Variant = "button" | "lucide" | "slender" | "soft";

const OPTIONS: { id: Variant; label: string; note: string }[] = [
  {
    id: "button",
    label: "A · Button shape",
    note: "The exact Craquer outline with an inset fill.",
  },
  {
    id: "lucide",
    label: "B · Lucide",
    note: "The clean icon-library heart, filled without a stroke.",
  },
  {
    id: "slender",
    label: "C · Slender",
    note: "A narrower waist and a longer, lighter point.",
  },
  {
    id: "soft",
    label: "D · Soft",
    note: "Rounder lobes with a shorter, warmer silhouette.",
  },
];

function HeartShape({ variant }: { variant: Variant }) {
  if (variant === "button") {
    return (
      <span className="relative block h-[52px] w-[52px] text-red">
        <span className="absolute inset-0 flex items-center justify-center text-[39px] leading-none">
          ♥
        </span>
        <span className="absolute inset-0 flex items-center justify-center text-[52px] leading-none">
          ♡
        </span>
      </span>
    );
  }

  if (variant === "lucide") {
    return <Heart strokeWidth={0} className="h-[52px] w-[52px] fill-current" />;
  }

  if (variant === "slender") {
    return (
      <svg viewBox="0 0 48 48" className="h-[52px] w-[52px]">
        <path
          fill="currentColor"
          d="M24 45C20.8 42.3 6 31.2 6 18.5 6 10.7 10.8 6 17.2 6c3.6 0 5.8 1.8 6.8 4.7C25 7.8 27.2 6 30.8 6 37.2 6 42 10.7 42 18.5 42 31.2 27.2 42.3 24 45Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" className="h-[52px] w-[52px]">
      <path
        fill="currentColor"
        d="M24 43.5C21.6 41.8 4.5 31.5 4.5 18.2 4.5 10.6 9.8 5.5 17.1 5.5c3.1 0 5.6 1.3 6.9 3.8 1.3-2.5 3.8-3.8 6.9-3.8 7.3 0 12.6 5.1 12.6 12.7 0 13.3-17.1 23.6-19.5 25.3Z"
      />
    </svg>
  );
}

function VariantCard({ option }: { option: (typeof OPTIONS)[number] }) {
  const [replay, setReplay] = useState(0);

  return (
    <button
      type="button"
      onClick={() => setReplay((value) => value + 1)}
      className="night-panel flex min-h-52 flex-col items-center rounded-[1.75rem] p-5 text-center"
      aria-label={`Replay ${option.label}`}
    >
      <span className="night-kicker">{option.label}</span>
      <span className="mt-6 flex h-20 items-center justify-center text-red">
        <span key={replay} className="gesture-heart block">
          <HeartShape variant={option.id} />
        </span>
      </span>
      <span className="mt-4 text-sm font-light leading-relaxed text-taupe">
        {option.note}
      </span>
      <span className="mt-auto pt-4 font-label text-[10px] uppercase tracking-[0.16em] text-cream/60">
        Tap to replay
      </span>
    </button>
  );
}

export default function HeartLabPage() {
  return (
    <main className="night-shell min-h-dvh px-5 py-10 text-cream">
      <div className="mx-auto max-w-xl">
        <p className="night-kicker">Temporary QA lab · #166</p>
        <h1 className="wordmark mt-3 text-4xl">Choose the filled heart</h1>
        <p className="mt-4 max-w-md font-light leading-relaxed text-taupe">
          All four render at 52px with the same 700ms animation. Tap a card to
          replay it, then choose A, B, C, or D.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {OPTIONS.map((option) => (
            <VariantCard key={option.id} option={option} />
          ))}
        </div>
      </div>
    </main>
  );
}
