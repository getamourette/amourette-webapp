'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { Dialog } from 'radix-ui';
import { PHOTO_REFRESH_EVENT } from '@/lib/usePhotoState';

type Request = Database['public']['Functions']['admin_name_corrections']['Returns'][number];

export function NameCorrectionQueue() {
  const [rows, setRows] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const queueButton = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    const result = await supabase.rpc('admin_name_corrections', {});
    if (seq !== sequence.current) return;
    if (result.error) { setError('Could not load name corrections.'); return; }
    setError(''); setLoaded(true); setRows(result.data);
    // Keep the exact inspected request while the queue refreshes.
  }, []);
  useEffect(() => {
    void (async () => { await load(); })();
    const requests = sequence;
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(PHOTO_REFRESH_EVENT, refresh);
    return () => {
      requests.current++; window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(PHOTO_REFRESH_EVENT, refresh);
    };
  }, [load]);
  async function decide(action: 'approved' | 'rejected') {
    if (!selected || busy.current || reviewRequired) return;
    busy.current = true; setWorking(true); setMessage(''); setReviewRequired(true);
    try {
      const result = await supabase.rpc('decide_name_correction', { p_request_id: selected.id, p_action: action });
      if (result.error) setMessage('Could not confirm this decision. Close this review and inspect the request again.');
      else setMessage(result.data[0]?.applied ? `Correction ${result.data[0].status}.` : `This request is now ${result.data[0]?.status}. Close this review and inspect another request before deciding.`);
      // Even after an uncertain response, never allow an opposite action without
      // a new explicit review. A retry on the server cannot overwrite a decision.
      setReviewRequired(true);
      const latest = await supabase.rpc('admin_name_corrections', { p_request_id: selected.id });
      if (!latest.error && latest.data[0]) setSelected(latest.data[0]);
      await load();
    } catch {
      setMessage('Could not confirm this decision. Close this review and inspect the request again.');
    } finally { busy.current = false; setWorking(false); }
  }
  return <Dialog.Root open={Boolean(selected)} onOpenChange={open => { if (!open && !busy.current) setSelected(null); }}><section className="mb-10" data-testid="admin-name-corrections">
    <h3 className="text-xl font-black"><button ref={queueButton} type="button" aria-expanded={expanded} aria-controls="name-correction-list" onClick={() => setExpanded(value => !value)} className="flex flex-wrap items-center gap-2 py-2">
      Name corrections <span className="rounded-full bg-amber-300/15 px-3 py-1 text-sm">{loaded ? `${rows.length} pending` : 'Loading…'}</span><span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
    </button></h3>
    {error && <p role="alert">{error}</p>}
    <div id="name-correction-list" hidden={!expanded}>
      <p className="mb-4 text-sm text-white/55">All participants · oldest requests first</p>
      <div className="grid max-h-[32rem] gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{rows.map(row => <button type="button" key={row.id} onClick={event => { reviewButton.current = event.currentTarget; setSelected(row); setMessage(''); setReviewRequired(false); }} className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
        <strong className="break-words">{row.current_name} → {row.proposed_name}</strong><span className="mt-2 block text-xs text-white/60">{new Date(row.created_at).toLocaleString()}</span>
      </button>)}</div>
      {loaded && !error && rows.length === 0 && <p className="py-5 text-sm text-white/50">No name corrections to review.</p>}
    </div>
    {selected && <>
    <Dialog.Overlay className="fixed inset-0 z-40 bg-velvet/85 backdrop-blur-[2px]" />
    <Dialog.Content aria-describedby={undefined} onEscapeKeyDown={event => { if (working) event.preventDefault(); }} onPointerDownOutside={event => { if (working) event.preventDefault(); }} onCloseAutoFocus={event => {
      event.preventDefault();
      (reviewButton.current?.isConnected ? reviewButton.current : queueButton.current)?.focus();
    }} className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-3rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6">
      <Dialog.Title className="pr-12 text-xl font-bold">Name correction</Dialog.Title>
      <Dialog.Close disabled={working} aria-label="Close name review" className="night-button night-button-secondary absolute right-4 top-4 h-11 w-11 p-0 text-lg">×</Dialog.Close>
      <dl className="mt-5 space-y-3 break-words"><div><dt className="text-sm text-white/60">Current name</dt><dd>{selected.current_name}</dd></div><div><dt className="text-sm text-white/60">Requested name</dt><dd>{selected.proposed_name}</dd></div><div><dt className="text-sm text-white/60">Submitted</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div><div><dt className="text-sm text-white/60">Status</dt><dd>{selected.status}</dd></div></dl>
      {message && <p role="status" className="mt-4 rounded-xl bg-white/10 p-3 text-sm">{message}</p>}
      {selected.status === 'pending' && !reviewRequired && <div className="mt-5 flex flex-col gap-2"><button disabled={working} onClick={() => void decide('approved')} className="night-button night-button-primary px-4 py-3">Approve correction</button><button disabled={working} onClick={() => void decide('rejected')} className="night-button night-button-secondary px-4 py-3">Reject correction</button></div>}
    </Dialog.Content></>}
  </section></Dialog.Root>;
}
