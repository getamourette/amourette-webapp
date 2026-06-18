"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const receiverId = params.id as string;
  const currentUserId = searchParams.get("userId");

  const [profile, setProfile] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUserId) return;

    loadProfile();
    loadMessages();
  }, [currentUserId, receiverId]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", Number(receiverId))
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setProfile(data);
  }

  async function loadMessages() {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_profile_id.eq.${currentUserId},receiver_profile_id.eq.${receiverId}),and(sender_profile_id.eq.${receiverId},receiver_profile_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setMessages(data || []);
  }

  async function sendMessage() {
    if (!message || !currentUserId) return;

    const { error } = await supabase.from("messages").insert({
      sender_email: "anonymous",
      receiver_id: Number(receiverId),
      sender_profile_id: Number(currentUserId),
      receiver_profile_id: Number(receiverId),
      message,
    });

    if (error) {
      console.error(error);
      setStatus("Message failed.");
      return;
    }

    setMessage("");
    setStatus("Message sent!");
    loadMessages();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap Chat
        </p>

        <div className="mt-6 flex items-center gap-4">
          {profile?.photo_url ? (
            <img
              src={profile.photo_url}
              alt={profile.name || "Profile photo"}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/10" />
          )}

          <h1 className="text-3xl font-black">
            {profile?.name || "Loading..."}
          </h1>
        </div>

        <div className="mt-8 space-y-3">
          {messages.map((msg) => {
            const isMine = msg.sender_profile_id === Number(currentUserId);

            return (
              <div
                key={msg.id}
                className={`rounded-2xl p-4 ${
                  isMine ? "bg-yellow-400 text-black" : "bg-white/5"
                }`}
              >
                <p className="text-sm opacity-70">
                  {isMine ? "You" : profile?.name || "Them"}
                </p>
                <p>{msg.message}</p>
              </div>
            );
          })}
        </div>

        <textarea
          className="mt-8 h-40 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button
          onClick={sendMessage}
          className="mt-4 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300"
        >
          Send Message
        </button>

        {status && (
          <p className="mt-4 text-center text-sm text-zinc-300">{status}</p>
        )}
      </div>
    </main>
  );
}