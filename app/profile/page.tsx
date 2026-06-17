"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const searchParams = useSearchParams();

  const email = searchParams.get("email") || "";
  const phone = searchParams.get("phone") || "";

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [message, setMessage] = useState("");

  async function handleSaveProfile() {
    if (!name || !bio) {
      setMessage("Please fill in your name and bio.");
      return;
    }

    const { error } = await supabase.from("profiles").insert({
      email,
      phone,
      name,
      bio,
      photo_url: "",
    });

    if (error) {
      setMessage("Something went wrong. Try again.");
      console.error(error);
      return;
    }

    setMessage("Profile saved successfully!");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap
        </p>

        <h1 className="mt-3 text-4xl font-black">Set up your profile</h1>

        <p className="mt-3 text-zinc-400">
          Tell us a little about yourself.
        </p>

        <div className="mt-8 flex justify-center">
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed border-zinc-500 bg-black/30 text-center text-sm text-zinc-400">
            Add Photo
          </div>
        </div>

        <input
          className="mt-8 w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <textarea
          className="mt-4 h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
          placeholder="Tell people about yourself..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />

        <button
          onClick={handleSaveProfile}
          className="mt-6 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300"
        >
          Save Profile
        </button>

        {message && (
          <p className="mt-4 text-center text-sm text-zinc-300">{message}</p>
        )}
      </div>
    </main>
  );
}