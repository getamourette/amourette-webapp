'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { TEXT_REASONS, type TextReason, type TextReview as Review } from '@/lib/text-moderation';
import { textModerationStrings } from '@/lib/text-moderation-strings';
import { invalidateParticipant } from '@/lib/participant-refresh';

type History = Database['public']['Functions']['admin_text_history']['Returns'];
type Context = { profile: string; night?: string; report?: string };
const copy = textModerationStrings.en;

export function TextReview({ profile, night, report }: Context) {
  const [rows, setRows] = useState<Review[]>([]);
  const [history, setHistory] = useState<History>([]);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [reviewAgain, setReviewAgain] = useState(false);
  const [reason, setReason] = useState<TextReason>('inappropriate');
  const busy = useRef(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    const args = { p_profile: profile, p_night: night, p_report: report };
    const [result, events] = await Promise.all([
      supabase.rpc('admin_text_reviews', args), supabase.rpc('admin_text_history', args),
    ]);
    if (request !== sequence.current) return;
    if (result.error || events.error) { setError(true); return; }
    setRows(result.data); setHistory(events.data); setError(false); setReviewAgain(false);
  }, [profile, night, report]);
  useEffect(() => {
    void (async () => { await load(); })();
    const requests = sequence;
    return () => { requests.current++; };
  }, [load]);
  async function act(row: Review, action: 'required' | 'approved' | 'rejected') {
    if (busy.current || reviewAgain) return;
    busy.current = true; setWorking(true); setMessage(''); setReviewAgain(true);
    try {
      const result = action === 'required'
        ? await supabase.rpc('require_profile_text_correction', {
          p_profile: profile, p_field: row.field, p_revision: row.revision, p_reason: reason,
          p_night: night, p_report: report,
        })
        : row.request_id ? await supabase.rpc(row.field === 'first_name' ? 'decide_name_correction' : 'decide_bio_correction', {
          p_request_id: row.request_id, p_action: action,
        }) : { error: { message: 'Request unavailable' } };
      setMessage(result.error
        ? 'Could not confirm this decision. Reload and inspect the latest text before deciding again.'
        : 'Decision processed. Reload to see its outcome. Reports and other restrictions are handled separately.');
    } catch {
      setMessage('Could not confirm this decision. Reload and inspect the latest text before deciding again.');
    } finally { busy.current = false; setWorking(false); invalidateParticipant(); }
  }
  return <section className="mt-6 border-t border-white/10 pt-5" data-testid="admin-text-review" aria-busy={working}>
    <h3 className="text-lg font-semibold">First name and bio</h3>
    <p className="mt-2 text-sm text-white/60">Participants write their own corrections. Approval applies only to the submission shown.</p>
    {error && <p role="alert" className="mt-3">Could not load this review.</p>}
    {message && <p role="status" className="mt-3">{message}</p>}
    {(error || reviewAgain) && <button type="button" disabled={working} onClick={() => void load()} className="night-button night-button-secondary mt-3 px-4 py-3">Reload review</button>}
    <label className="mt-4 block text-sm">Reason for requiring a correction
      <select value={reason} disabled={working || reviewAgain} onChange={event => setReason(event.target.value as TextReason)} className="night-input mt-2 w-full px-3 py-3">
        {TEXT_REASONS.map(value => <option key={value} value={value}>{copy.reasons[value]}</option>)}
      </select>
    </label>
    {rows.map(row => <div key={row.field} className="mt-4 rounded-xl bg-white/5 p-4">
      <h4 className="font-semibold">{copy[row.field]}</h4>
      <p className="mt-2 text-xs text-white/60">{row.required ? 'Hidden · correction required' : 'Published'}</p>
      <p className="mt-2 whitespace-pre-wrap break-words">{row.required ? row.rejected_text : row.published_text ?? 'None'}</p>
      {row.reason && <p className="mt-2 text-sm">{copy.reasons[row.reason]}</p>}
      {row.status === 'pending' && <>
        <p className="mt-4 text-xs text-white/60">Exact submission awaiting approval</p>
        <p className="mt-2 whitespace-pre-wrap break-words">{row.proposed_text ?? copy.emptyBio}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={working || reviewAgain || error} onClick={() => void act(row, 'approved')} className="night-button night-button-primary px-4 py-3">Approve {copy[row.field].toLowerCase()}</button>
          <button type="button" disabled={working || reviewAgain || error} onClick={() => void act(row, 'rejected')} className="night-button night-button-secondary px-4 py-3">Reject correction</button>
        </div>
      </>}
      {!row.required && row.published_text !== null && <button type="button" disabled={working || reviewAgain || error} onClick={() => void act(row, 'required')} className="night-button night-button-danger mt-3 px-4 py-3">Require {copy[row.field].toLowerCase()} correction</button>}
    </div>)}
    <details className="mt-5 text-sm"><summary className="cursor-pointer py-3">Text correction history</summary>
      <ol className="space-y-3">{history.map(event => <li key={event.id} className="break-words">
        <span>{event.field === 'first_name' ? 'First name' : 'Bio'} · {event.action} · {new Date(event.created_at).toLocaleString()}</span>
        {event.reason && <p>{copy.reasons[event.reason as TextReason]}</p>}
        <p className="text-xs text-white/60">Actor: {event.actor_id ?? 'Deleted account'}</p>
      </li>)}</ol>
    </details>
  </section>;
}

export function TextCorrectionQueue() {
  const [rows, setRows] = useState<Review[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      if (document.visibilityState !== 'visible') return;
      const result = await supabase.rpc('admin_text_reviews', {});
      if (!active) return;
      setError(Boolean(result.error));
      if (!result.error) setRows(result.data);
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const profiles = [...new Map(rows.map(row => [row.profile_id, row])).values()];
  return <section className="mb-10" data-testid="admin-text-corrections">
    <button type="button" aria-expanded={expanded} aria-controls="text-correction-queue" onClick={() => setExpanded(value => !value)} className="py-3 text-xl font-semibold">Required text corrections · {profiles.length}</button>
    {error && <p role="alert">Could not load text corrections. Retrying automatically.</p>}
    <div id="text-correction-queue" hidden={!expanded}>
      {profiles.map(row => <button type="button" key={row.profile_id} onClick={() => setSelected(row.profile_id)} className="night-button night-button-secondary m-1 px-4 py-3">{row.first_name ?? 'Participant'} · review</button>)}
      {!profiles.length && !error && <p>No text corrections awaiting resolution.</p>}
      {selected && <><button type="button" onClick={() => setSelected(null)} className="mt-3 min-h-11 underline">Close text review</button><TextReview key={selected} profile={selected} /></>}
    </div>
  </section>;
}
