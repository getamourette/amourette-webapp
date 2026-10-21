"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { attendanceBuckets, genderActivity, reportNumber as number, reportRate as rate, reportAverage as average, type NightReport } from "@/lib/night-report";

const genderLabels = { woman: "Women", man: "Men", nonbinary: "Non-binary" };

function Metric({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  return <article className="rounded-xl border border-[var(--admin-border)] bg-white p-6">
    <h4 className="text-xs font-semibold uppercase text-[var(--admin-secondary)] mb-4">{label}</h4>
    <p className={`${value === null ? "text-xl" : "text-4xl"} font-semibold tabular-nums text-[var(--admin-text)]`}>{number(value)}</p>
    {detail && <p className="text-[var(--admin-secondary)] mt-3 text-sm">{detail}</p>}
  </article>;
}

function Distribution({ title, values, labels, total }: { title: string; values: number[] | null; labels: string[]; total: number | null }) {
  return <article className="rounded-xl border border-[var(--admin-border)] bg-white p-6">
    <h4 className="mb-4 font-semibold text-[var(--admin-text)]">{title}</h4>
    {values ? <dl className="space-y-2">{labels.map((label, index) => <div key={label} className="flex justify-between gap-3 text-sm">
      <dt className="text-[var(--admin-secondary)]">{label}</dt><dd className="tabular-nums text-[var(--admin-text)]">{rate(values[index], total)}</dd>
    </div>)}</dl> : <p className="text-[var(--admin-secondary)] text-sm">Not available</p>}
  </article>;
}

export function NightReportPanel({ venueNightId }: { venueNightId: string }) {
  const [state, setState] = useState<{ id: string; report: NightReport | null; error: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      const { data, error } = await supabase.rpc("admin_venue_night_report", { p_venue_night_id: venueNightId });
      pending = false;
      if (active) setState({ id: venueNightId, report: data?.[0] ?? null, error: Boolean(error) });
    }
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [venueNightId]);
  if (!state || state.id !== venueNightId) return <p role="status" className="text-[var(--admin-secondary)]">Loading night report…</p>;
  if (state.error || !state.report) return <p role="alert" className="text-red-800">Could not load the night report. Retrying automatically.</p>;
  return <NightReportContent report={state.report} />;
}

export function NightReportContent({ report: r }: { report: NightReport }) {
  const genders = genderActivity(r.likes_by_gender);
  const buckets = attendanceBuckets(r.attendance);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: r.timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return <section className="space-y-5" aria-label="Night report">
    <header>
      <h3 className="text-xl font-semibold text-[var(--admin-text)]">Night report · {r.finalized_at ? "Final" : "Provisional"}</h3>
      <p className="text-[var(--admin-secondary)] mt-2 text-sm">Unique participants across this night, including people who left. Returns count once.</p>
      {r.partial && <p className="mt-2 text-sm text-red-800">Partial history: available counts use surviving sources. Measurements introduced after this night began are not available.</p>}
    </header>

    <h4 className="text-xs font-semibold uppercase text-[var(--admin-secondary)]">Entry funnel</h4>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Metric label="Unique QR scanners" value={r.scanners} />
      <Metric label="Already completed at first scan" value={r.preexisting_profiles} detail={rate(r.preexisting_profiles, r.scanners)} />
      <Metric label="Completed during entry" value={r.completed_profiles} detail={`${rate(r.completed_profiles, r.incomplete_scanners)} of initially incomplete scanners`} />
      <Metric label={r.finalized_at ? "Onboarding drop-offs" : "Not yet completed"} value={r.dropoffs} detail={`${rate(r.dropoffs, r.incomplete_scanners)} of initially incomplete scanners`} />
      <Metric label="Scanners entering the room" value={r.scan_entrants} detail={rate(r.scan_entrants, r.scanners)} />
      <Metric label="Unique room participants" value={r.participants} detail="Denominator for like and match participation" />
    </div>

    <h4 className="text-xs font-semibold uppercase text-[var(--admin-secondary)]">Likes and matches</h4>
    <div className="grid gap-4 sm:grid-cols-2">
      <Metric label="Likes sent" value={r.likes} detail={`${rate(r.like_senders, r.participants)} of participants sent at least one`} />
      <Metric label="Mutual matches" value={r.matches} detail={`${rate(r.matched_participants, r.participants)} of participants had at least one`} />
      <Distribution title="Likes sent per participant" values={r.likes_distribution} labels={["0 likes", "1 like", "2 likes", "3+ likes"]} total={r.participants} />
      <Distribution title="Matches per participant" values={r.matches_distribution} labels={["0 matches", "1 match", "2 matches", "3+ matches"]} total={r.participants} />
      <Metric label="Matches with a first message" value={r.conversations} detail={`${rate(r.conversations, r.matches)} of mutual matches`} />
      <Metric label="Matches with a reply" value={r.replies} detail={`${rate(r.replies, r.conversations)} of started conversations · ${rate(r.replies, r.matches)} of all matches`} />
      <Distribution title="Profiles available at first live display" values={r.arrival_distribution} labels={["0 profiles", "1–4 profiles", "5+ profiles"]} total={r.arrival_observations} />
      <article className="rounded-xl border border-[var(--admin-border)] bg-white p-6">
        <h4 className="text-xs font-semibold uppercase text-[var(--admin-secondary)] mb-4">Median time to first match</h4>
        <p className="text-2xl font-semibold text-[var(--admin-text)]">{r.first_match_median_seconds === null ? "Not available" : `${(r.first_match_median_seconds / 60).toFixed(1)} min`}</p>
        <p className="text-[var(--admin-secondary)] mt-3 text-sm">From first entry · {number(r.first_match_sample)} matched participants in the sample.</p>
        <p className="text-[var(--admin-secondary)] mt-2 text-sm">First live display observed for {rate(r.arrival_observations, r.participants)} of participants. Missing or failed loads are not zero-profile arrivals.</p>
      </article>
    </div>

    <article className="rounded-xl border border-[var(--admin-border)] bg-white p-6">
      <h4 className="font-semibold text-[var(--admin-text)]">Attendance · peak {number(r.peak)}</h4>
      <p className="text-[var(--admin-secondary)] mt-2 text-sm">Maximum simultaneous participants per 30 minutes · {r.timezone}. Overlapping visits count once.</p>
      {buckets ? buckets.length ? <ol className="mt-5 max-h-80 space-y-3 overflow-y-auto" aria-label="Attendance by half hour">{buckets.map((bucket) => <li key={bucket.at} className="text-xs text-[var(--admin-secondary)]">
        <div className="flex justify-between gap-3"><span>{time.format(new Date(bucket.at))}</span><span>{bucket.count} people</span></div>
        <div className="mt-1 h-2 rounded bg-gray-100" aria-hidden="true"><div className="h-2 rounded bg-[var(--admin-primary)]" style={{ width: `${r.peak ? bucket.count / r.peak * 100 : 0}%` }} /></div>
      </li>)}</ol> : <p className="text-[var(--admin-secondary)] mt-4 text-sm">No attendance interval yet.</p> : <p className="text-[var(--admin-secondary)] mt-4 text-sm">Not available</p>}
    </article>

    <article className="rounded-xl border border-[var(--admin-border)] bg-white p-6">
      <h4 className="font-semibold text-[var(--admin-text)]">Gender mix across the night</h4>
      <p className="text-[var(--admin-secondary)] mt-2 text-sm">Gender at first entry · {number(r.participants)} unique participants.</p>
      {r.gender_mix !== null && genders ? <dl className="mt-4 space-y-2">{genders.map((g) => <div key={g.gender} className="flex justify-between gap-4 text-sm"><dt>{genderLabels[g.gender]}</dt><dd>{rate(g.participants, r.participants)}</dd></div>)}</dl> : <p className="text-[var(--admin-secondary)] mt-4 text-sm">Not available for this partial history.</p>}
    </article>
    <section aria-label="Likes by gender" className="grid gap-4 sm:grid-cols-3">
      {genders ? genders.map((g) => <article className="rounded-xl border border-[var(--admin-border)] bg-white p-6" key={g.gender}>
        <h4 className="font-semibold text-[var(--admin-text)]">{genderLabels[g.gender]} · likes</h4>
        <p className="text-[var(--admin-secondary)] mt-2 text-sm">{g.participants} participants, including those with no likes</p>
        <dl className="mt-4 space-y-3 text-sm">
          <div><dt className="text-[var(--admin-secondary)]">Sent / received</dt><dd>{g.sent} / {g.received}</dd></div>
          <div><dt className="text-[var(--admin-secondary)]">Average sent / received</dt><dd>{average(g.sent, g.participants)} / {average(g.received, g.participants)}</dd></div>
          <div><dt className="text-[var(--admin-secondary)]">Sent at least one</dt><dd>{rate(g.senders, g.participants)}</dd></div>
          <div><dt className="text-[var(--admin-secondary)]">Received at least one</dt><dd>{rate(g.receivers, g.participants)}</dd></div>
        </dl>
      </article>) : <p className="text-[var(--admin-secondary)] text-sm">Likes by gender: not available.</p>}
    </section>
  </section>;
}
