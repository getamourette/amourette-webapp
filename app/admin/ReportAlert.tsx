"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readModerationPages } from "@/lib/moderation-refresh";
import styles from "./AdminShell.module.css";

// #475: a founder alone at the door must learn about a report without keeping
// /admin/moderation on screen. The shell polls the open-report count (the same
// admin_moderation_queue rule the queue uses) and cues the device when it rises.
// A poll, not the founder-moderation channel: supabase-js shares one channel per
// topic, so a second subscriber would be torn down by the queue's own cleanup.
const POLL_MS = 10_000;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export function useOpenReports(enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const version = ++request.current;
    try {
      const result = await readModerationPages<{ report_id: string }>((after, signal) => {
        const query = supabase.rpc("admin_moderation_queue").select("report_id").eq("is_handled", false)
          .order("report_id", { ascending: true }).limit(200).abortSignal(signal);
        return after ? query.gt("report_id", after) : query;
      }, row => row.report_id, new AbortController().signal);
      // A failed read keeps the last known count: never hide an alert on a blip.
      if (version === request.current && !result.error) setCount(result.data?.length ?? 0);
    } catch { /* keep the last known count */ }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const requests = request;
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      requests.current++;
      setCount(null);
      window.clearTimeout(initial); window.clearInterval(timer);
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, load]);
  return enabled ? count : null;
}

/** Sound and vibration when the open count rises. Browsers only allow audio after a tap. */
function useReportCue(count: number | null) {
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const unlock = () => {
      try {
        // iOS keeps Web Audio silent behind the ring/silent switch unless the session plays back.
        const session = (navigator as AudioSessionNavigator).audioSession;
        if (session) session.type = "playback";
        audio.current ??= new AudioContext();
        void audio.current.resume();
      } catch { /* no audio on this device */ }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    const before = previous.current;
    previous.current = count;
    if (count === null || before === null || count <= before) return;
    try { navigator.vibrate?.([250, 120, 250]); } catch { /* unsupported */ }
    const context = audio.current;
    if (!context || context.state !== "running") return;
    for (const [offset, frequency] of [[0, 880], [0.22, 1175]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + offset;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.21);
    }
  }, [count]);
}

/** Shown on every admin screen except the queue itself, including the door. */
export function ReportAlert({ count, onModeration }: { count: number | null; onModeration: boolean }) {
  useReportCue(count);
  if (!count || onModeration) return null;
  return <div role="alert" className={styles.reportAlert}>
    <ShieldAlert size={18} aria-hidden="true" />
    <span>{count === 1 ? "1 open report" : `${count} open reports`}</span>
    <Link href="/admin/moderation">Open moderation</Link>
  </div>;
}
