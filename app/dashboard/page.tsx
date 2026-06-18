"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentUserId = searchParams.get("userId");

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    const { data, error } = await supabase.from("profiles").select("*");

    if (error) {
      console.error(error);
      return;
    }

    setProfiles(data || []);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap
        </p>

        <h1 className="mt-3 text-4xl font-black">Discover people</h1>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              onClick={() =>
                router.push(`/chat/${profile.id}?userId=${currentUserId}`)
              }
              className="cursor-pointer rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-yellow-400"
            >
              {profile.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt={profile.name || "Profile photo"}
                  className="h-48 w-full rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center rounded-2xl bg-black/40 text-zinc-500">
                  No photo
                </div>
              )}

              <h2 className="mt-4 text-2xl font-bold">
                {profile.name || "Unnamed user"}
              </h2>

              <p className="mt-2 text-zinc-400">
                {profile.bio || "No bio yet."}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}