"use client";

import { supabase } from "../lib/supabase";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  const [phone, setPhone] = useState("");

  async function handleContinue() {
  if (!email || !phone) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .or(`email.eq.${email},phone.eq.${phone}`)
    .limit(1);

  if (error) {
    console.error(error);
    return;
  }

  if (data && data.length > 0) {
  router.push(`/dashboard?userId=${data[0].id}`);
  return;
  }

  router.push(
    `/profile?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`
  );
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          Welcome to
        </p>

        <h1 className="mt-3 text-6xl font-black tracking-tight">
          BarTap
        </h1>

        <p className="mt-4 text-lg text-zinc-300">
          Scan. Tap. Start your night.
        </p>

        <div className="mt-8">
          <label className="text-sm text-zinc-400">Email address</label>

          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <button
          onClick={handleContinue}
          className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300"
        >
          Continue
        </button>

        <p className="mt-5 text-center text-xs text-zinc-500">
          No download needed. Just scan and go.
        </p>
      </div>
    </main>
  );
}