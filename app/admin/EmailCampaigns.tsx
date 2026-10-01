"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { campaignSchedule, CAMPAIGN_NIGHT_LIMIT, type Campaign, type CampaignCommand, type CampaignDashboard, type CampaignReview } from "@/lib/email-campaigns";
import type { Locale } from "@/lib/strings";

const errors: Record<string, string> = {
  unauthorized: "Your founder session could not be verified. Sign in again.",
  nights_changed: "A selected night changed or is no longer upcoming. Select the nights again and create a fresh preview.",
  audience_changed: "The eligible audience changed. Review the updated counts before confirming again.",
  empty_audience: "No eligible recipients remain. No emails were queued.",
  sending_disabled: "Sending is disabled in this environment. Use the production admin when delivery is enabled.",
  preview_rate_limit: "Too many previews were created. Please try again later.",
  campaign_not_found: "This campaign could not be found. Refresh the history.",
  invalid_request: "Check the selected nights and try again.",
  campaign_unavailable: "Email campaigns are unavailable. The campaign migration and server configuration must be ready.",
};

async function requestCampaign<T>(command?: CampaignCommand, offset = 0): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(errors.unauthorized);
  const response = await fetch(`/api/admin/email-campaigns${command ? "" : `?offset=${offset}`}`, {
    method: command ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    ...(command ? { body: JSON.stringify(command) } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(errors[body.error] ?? "The request could not be completed. Refresh history before trying again; a send may already be queued.");
  return body as T;
}

function SendConfirmation({ review, busy, onClose, onConfirm }: { review: CampaignReview; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="campaign-confirm-title"
    className="night-panel fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl p-6 text-cream backdrop:bg-velvet/85">
    <h2 id="campaign-confirm-title" className="font-display text-2xl">Send this campaign?</h2>
    <p className="mt-3 text-sm text-taupe">This queues delivery to {review.audience.eligible} subscribers worldwide. Sending cannot be undone. Consent and suppression are checked again before each email leaves.</p>
    <ul className="mt-4 space-y-2 text-sm">{review.campaign.nights.map(night => <li key={night.id}><strong>{night.name}</strong>{night.city ? ` · ${night.city}` : ""}<br />{campaignSchedule(night, "en")}</li>)}</ul>
    <p className="mt-4 text-sm">English: {review.audience.en} · French: {review.audience.fr} · Spanish: {review.audience.es}</p>
    <label className="my-5 flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-rose" />I reviewed the email and understand that sending is irreversible.</label>
    <div className="flex flex-wrap gap-3">
      <button className="night-button night-button-secondary px-4 py-3" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="night-button night-button-primary px-4 py-3 disabled:opacity-50" disabled={!checked || busy} onClick={onConfirm}>{busy ? "Queuing…" : `Send to ${review.audience.eligible} subscribers`}</button>
    </div>
  </dialog>;
}

function Counts({ campaign }: { campaign: Campaign }) {
  return <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
    {(Object.entries(campaign.counts)).map(([name, count]) => <div key={name} className="rounded-xl bg-velvet/50 p-3"><dt className="capitalize text-taupe">{name}</dt><dd className="mt-1 text-xl tabular-nums">{count}</dd></div>)}
  </dl>;
}

export function EmailCampaigns() {
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [plain, setPlain] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setDashboard(await requestCampaign<CampaignDashboard>(undefined, offset)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load campaigns."); }
    finally { setLoading(false); }
  }, [offset]);
  useEffect(() => {
    let active = true;
    requestCampaign<CampaignDashboard>(undefined, offset).then(data => {
      if (active) { setDashboard(data); setLoading(false); }
    }).catch(caught => {
      if (active) { setError(caught instanceof Error ? caught.message : "Could not load campaigns."); setLoading(false); }
    });
    return () => { active = false; };
  }, [offset]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Request failed. Refresh history before trying again."); }
    finally { setBusy(false); }
  }
  async function preview() {
    await run(async () => {
      setReview(await requestCampaign<CampaignReview>({ action: "preview", nightIds: selected }));
      setLocale("en"); setPlain(false);
      await load();
      requestAnimationFrame(() => previewHeading.current?.focus());
    });
  }
  async function reviewSend() {
    if (!review) return;
    await run(async () => {
      const next = await requestCampaign<CampaignReview>({ action: "review", campaignId: review.campaign.id });
      setReview(next);
      if (next.campaign.confirmed_at) { setNotice("This campaign is already queued. See its delivery counts below."); await load(); }
      else if (next.audience.eligible === 0) setError(errors.empty_audience);
      else setConfirming(true);
    });
  }
  async function confirm() {
    if (!review) return;
    await run(async () => {
      try {
        const campaign = await requestCampaign<Campaign>({ action: "confirm", campaignId: review.campaign.id, audience: review.audience, confirmed: true });
        setReview({ ...review, campaign }); setSelected([]);
        setNotice("Campaign queued. The background worker will process it; refresh history to follow delivery.");
      } finally { setConfirming(false); await load(); }
    });
  }
  const message = review?.campaign.messages[locale];
  return <section className="space-y-6" aria-labelledby="email-campaigns-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="email-campaigns-title" className="font-display text-3xl">Email</h2><p className="mt-2 max-w-xl text-sm text-taupe">Invite subscribers back to the bar. Choose upcoming nights, review the three languages, then send.</p></div>
      <button className="night-button night-button-secondary px-4 py-2" disabled={loading || busy} onClick={() => { setError(""); void load(); }}>Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-blush/30 p-4 text-sm text-blush">{error}</p>}
    {notice && <p role="status" className="night-panel rounded-xl p-4 text-sm">{notice}</p>}
    {loading && !dashboard && <p role="status" className="text-taupe">Loading email campaigns…</p>}
    {dashboard && <>
      {!dashboard.sendingEnabled && <p className="rounded-xl border border-champagne/20 p-4 text-sm text-taupe">Preview mode: sending and retries are disabled here. No campaign emails can be queued from this environment.</p>}
      <div className="night-panel rounded-3xl p-5 sm:p-6">
        <h3 className="text-lg font-semibold">New campaign</h3>
        <p className="mt-2 text-sm text-taupe">All eligible subscribers, across all cities. Select up to {CAMPAIGN_NIGHT_LIMIT} nights. Schedules use each venue’s local time.</p>
        {dashboard.nights.length === 0 ? <p className="my-5 text-sm">No upcoming nights. Prepare a future night in Venues first.</p> : <fieldset className="my-5 space-y-3" disabled={busy}>
          <legend className="sr-only">Upcoming nights</legend>
          {dashboard.nights.map(night => <label key={night.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-champagne/15 p-4">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={selected.includes(night.id)} disabled={!selected.includes(night.id) && selected.length >= CAMPAIGN_NIGHT_LIMIT}
              onChange={event => { setSelected(event.target.checked ? [...selected, night.id] : selected.filter(id => id !== night.id)); setReview(null); }} />
            <span className="min-w-0 break-words text-sm"><strong>{night.name}</strong>{night.city ? ` · ${night.city}` : ""}<span className="mt-1 block text-taupe">{campaignSchedule(night, "en")}</span></span>
          </label>)}
        </fieldset>}
        <button className="night-button night-button-primary mt-2 px-5 py-3 disabled:opacity-50" disabled={busy || selected.length === 0} onClick={() => void preview()}>{busy ? "Working…" : "Create preview"}</button>
      </div>
      {review && message && <div className="night-panel rounded-3xl p-5 sm:p-6">
        <h3 ref={previewHeading} tabIndex={-1} className="text-lg font-semibold">{review.campaign.confirmed_at ? "Campaign email" : "Preview and audience"}</h3>
        {!review.campaign.confirmed_at && <><p className="mt-3 text-sm">{review.audience.eligible} eligible · EN {review.audience.en} · FR {review.audience.fr} · ES {review.audience.es}</p>
          <p className="mt-2 text-sm text-taupe">Excluded: {review.audience.frequency} by frequency protection; {review.audience.suppressed} suppressed. Unsubscribed addresses are never included. Counts refresh before confirmation.</p></>}
        <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Preview language">
          {(["en", "fr", "es"] as const).map(lang => <button key={lang} aria-pressed={locale === lang} className={`night-button px-4 py-2 ${locale === lang ? "night-button-primary" : "night-button-secondary"}`} onClick={() => setLocale(lang)}>{lang.toUpperCase()}</button>)}
          <button aria-pressed={plain} className="night-button night-button-secondary px-4 py-2" onClick={() => setPlain(!plain)}>{plain ? "Show HTML" : "Show plain text"}</button>
        </div>
        <p className="mb-4 break-words text-sm"><strong>Subject:</strong> {message.subject}</p>
        <p className="mb-3 text-xs text-taupe">Recipients receive this email in their saved language, with their own unsubscribe link.</p>
        {plain ? <pre className="max-h-[650px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-velvet p-4 text-sm text-[#f5ead8]">{message.text}</pre> :
          <iframe title={`Campaign email preview ${locale.toUpperCase()}`} sandbox="" referrerPolicy="no-referrer" srcDoc={message.html} className="h-[650px] w-full rounded-xl border-0 bg-velvet" />}
        {review.campaign.confirmed_at ? <Counts campaign={review.campaign} /> : <button className="night-button night-button-primary mt-5 px-5 py-3 disabled:opacity-50" disabled={busy || !dashboard.sendingEnabled || review.audience.eligible === 0} onClick={() => void reviewSend()}>Review send</button>}
      </div>}
      <div>
        <h3 className="mb-3 text-lg font-semibold">Campaign history</h3>
        <p className="mb-4 text-sm text-taupe">Sent means accepted by the provider; delivered is confirmed by its webhook. Skipped includes withdrawn consent, suppression, frequency protection, and changed nights. Failed also includes provider suppression after acceptance. Unknown outcomes require provider verification and cannot be retried here.</p>
        {dashboard.campaigns.length === 0 && <p className="night-panel rounded-xl p-5 text-sm">No campaigns yet.</p>}
        <div className="space-y-4">{dashboard.campaigns.map(campaign => <article key={campaign.id} className="night-panel rounded-2xl p-5">
          <p className="break-words font-semibold">{campaign.nights.map(night => night.name).join(" · ")}</p>
          <p className="mt-1 text-xs text-taupe">{campaign.confirmed_at ? "Queued" : "Draft"} · {new Date(campaign.confirmed_at ?? campaign.created_at).toLocaleString()}</p>
          {campaign.confirmed_at && <Counts campaign={campaign} />}
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="night-button night-button-secondary px-4 py-2 text-sm" disabled={busy} onClick={() => void run(async () => {
              setReview(await requestCampaign<CampaignReview>({ action: "review", campaignId: campaign.id }));
              requestAnimationFrame(() => { previewHeading.current?.focus(); previewHeading.current?.scrollIntoView({ block: "start" }); });
            })}>Open {campaign.confirmed_at ? "email" : "draft"}</button>
            {campaign.counts.failed > 0 && <button className="night-button night-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={busy || !dashboard.sendingEnabled} onClick={() => void run(async () => {
              if (!window.confirm("Retry definite failures? This queues real emails. Consent, frequency and upcoming-night eligibility will be checked again. Unknown outcomes will not be retried.")) return;
              const result = await requestCampaign<{ retried: number }>({ action: "retry", campaignId: campaign.id, confirmed: true });
              setNotice(`${result.retried} definite failures queued for retry.`); await load();
            })}>Retry definite failures</button>}
          </div>
        </article>)}</div>
        <div className="mt-4 flex gap-3"><button className="night-button night-button-secondary px-4 py-2" disabled={offset === 0 || loading || busy} onClick={() => { setLoading(true); setOffset(offset - 20); }}>Newer</button><button className="night-button night-button-secondary px-4 py-2" disabled={!dashboard.hasMore || loading || busy} onClick={() => { setLoading(true); setOffset(offset + 20); }}>Older</button></div>
      </div>
    </>}
    {confirming && review && <SendConfirmation review={review} busy={busy} onClose={() => setConfirming(false)} onConfirm={() => void confirm()} />}
  </section>;
}
