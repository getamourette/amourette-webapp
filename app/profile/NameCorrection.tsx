'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { isValidText } from '@/lib/input-validation';
import { FIRST_NAME_MAX_LENGTH } from '@/lib/profile';
import { nameCorrectionStrings } from '@/lib/name-correction-strings';
import type { Locale } from '@/lib/strings';
import { Dialog } from 'radix-ui';

type Correction = Database['public']['Functions']['my_name_correction']['Returns'][number];

export function NameCorrection({ currentName, locale, onNameChange, onDirtyChange }: {
  currentName: string; locale: Locale; onNameChange: (name: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const s = nameCorrectionStrings[locale];
  const [request, setRequest] = useState<Correction | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const receipt = useRef<{ id: string; name: string } | null>(null);
  const sequence = useRef(0);
  const onChange = useRef(onNameChange);
  useEffect(() => { onChange.current = onNameChange; }, [onNameChange]);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    const result = await supabase.rpc('my_name_correction').maybeSingle();
    if (seq !== sequence.current) return;
    setLoadError(Boolean(result.error) || !result.data);
    if (result.error || !result.data) return;
    setLoaded(true);
    // A successful reread confirms a submission whose response may have been
    // lost. Future requests after cancellation/decision need a fresh identifier.
    if (receipt.current?.id === result.data.id) receipt.current = null;
    setRequest(result.data);
    onChange.current(result.data.current_name);
  }, []);
  useEffect(() => {
    void (async () => { await load(); })();
    const requests = sequence;
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      requests.current++;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [load]);
  const valid = isValidText(draft, FIRST_NAME_MAX_LENGTH) && draft.trim() !== currentName.trim();
  const dirty = Boolean(draft.trim()) && draft.trim() !== currentName.trim() &&
    !(request?.status === 'pending' && draft.trim() === request.proposed_name);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  async function submit() {
    if (busy.current || !valid || request?.status === 'pending') return;
    busy.current = true; setWorking(true); setError(false);
    const name = draft.trim();
    if (!receipt.current || receipt.current.name !== name) receipt.current = { id: crypto.randomUUID(), name };
    try {
      const result = await supabase.rpc('submit_name_correction', { p_request_id: receipt.current.id, p_proposed_name: name });
      if (result.error) { setError(true); return; }
      receipt.current = null; setDraft(''); setOpen(false);
    } catch { setError(true); }
    finally { await load(); busy.current = false; setWorking(false); }
  }
  async function cancel() {
    if (busy.current || !request?.id) return;
    busy.current = true; setWorking(true); setError(false);
    try {
      const result = await supabase.rpc('cancel_name_correction', { p_request_id: request.id });
      setError(Boolean(result.error));
    } catch { setError(true); }
    finally { await load(); busy.current = false; setWorking(false); }
  }
  const status = request?.status;
  const statusLabel = status === 'pending' || status === 'approved' || status === 'rejected' || status === 'cancelled' ? s[status] : '';
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy.current) setOpen(value); }}><div className="mt-6" data-testid="name-correction">
    <p className="night-input break-words px-5 py-4" data-testid="current-first-name">{currentName}</p>
    {request?.id && <p role="status" className="mt-3 break-words text-sm text-taupe">{request.proposed_name} · {statusLabel}</p>}
    {loadError && <p role="alert" className="mt-3 text-sm text-blush">{s.loadError} <button type="button" onClick={() => void load()} className="underline">{s.retry}</button></p>}
    {status === 'pending'
      ? <button type="button" disabled={working} onClick={() => void cancel()} className="night-button night-button-secondary mt-3 w-full px-4 py-3">{s.cancel}</button>
      : <Dialog.Trigger asChild><button type="button" disabled={!loaded || working} onClick={() => { setOpen(true); setError(false); }} className="night-button night-button-secondary mt-3 w-full px-4 py-3">{s.request}</button></Dialog.Trigger>}
    {error && !open && <p role="alert" className="mt-3 text-sm text-blush">{s.error}</p>}
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-velvet/85" />
    <Dialog.Content onEscapeKeyDown={event => { if (working) event.preventDefault(); }} onPointerDownOutside={event => { if (working) event.preventDefault(); }} className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-3rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6">
      <Dialog.Title className="font-display text-2xl text-cream">{s.title}</Dialog.Title>
      <Dialog.Description className="mt-3 text-sm text-taupe">{s.explanation}</Dialog.Description>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="mt-4 block text-sm">{s.label}<input autoFocus value={draft} onChange={event => setDraft(event.target.value)} disabled={working} aria-invalid={Boolean(draft) && !valid} aria-describedby="name-correction-help" className="night-input mt-2 w-full px-4 py-3" /></label>
        <p id="name-correction-help" className="mt-2 text-sm text-taupe">{s.invalid}</p>
        {error && <p role="alert" className="mt-3 text-sm text-blush">{s.error}</p>}
        <button type="submit" disabled={working || !valid || status === 'pending'} className="night-button night-button-primary mt-5 w-full px-4 py-3 disabled:opacity-50">{working ? s.sending : s.send}</button>
      </form>
      <Dialog.Close disabled={working} className="night-button night-button-secondary mt-3 w-full px-4 py-3">{s.close}</Dialog.Close>
    </Dialog.Content></Dialog.Portal>
  </div></Dialog.Root>;
}
