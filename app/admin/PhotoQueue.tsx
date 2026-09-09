'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { photos } from '@/lib/photo-client';
import { supabase } from '@/lib/supabase';
import { PHOTO_REASONS, type PhotoQueueRow, type PhotoReason } from '@/lib/photo-moderation';
import { photoStrings } from '@/lib/photo-strings';
import { PHOTO_REFRESH_EVENT, invalidatePhotos } from '@/lib/usePhotoState';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Modal } from '@/components/ui/modal';

export function PhotoQueue({ reportProfileId, onCloseReport }: { reportProfileId?: string | null; onCloseReport?: () => void }) {
  const [rows, setRows] = useState<PhotoQueueRow[]>([]);
  const [count, setCount] = useState(0);
  const [nights, setNights] = useState<{id: string; label: string}[]>([]);
  const [night, setNight] = useState('');
  const [selected, setSelected] = useState<PhotoQueueRow | null>(null);
  const [reason, setReason] = useState<PhotoReason>('face_unclear');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    const [result, open] = await Promise.all([
      photos.rpc('admin_photo_queue', { p_night: night || undefined, p_profile: reportProfileId || undefined }).returns<PhotoQueueRow[]>(),
      photos.rpc('admin_photo_queue', {}).returns<PhotoQueueRow[]>(),
    ]);
    if (request !== sequence.current) return;
    if (result.error || open.error) { setError('Could not load photo reviews.'); return; }
    setError(''); setRows(result.data);
    setCount(open.data.filter(row => row.pending_id || row.displayed_status === 'unverified').length);
    // Preserve the revision the founder inspected. A concurrent change must
    // fail as stale, never silently approve a different submission.
    if (reportProfileId) setSelected(current => current?.profile_id === reportProfileId ? current : result.data[0] ?? null);
  }, [night, reportProfileId]);
  useEffect(() => {
    void (async () => { await load(); })();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000);
    window.addEventListener(PHOTO_REFRESH_EVENT, load);
    const requests = sequence;
    return () => { requests.current++; clearInterval(timer); window.removeEventListener(PHOTO_REFRESH_EVENT, load); };
  }, [load]);
  useEffect(() => {
    let active = true;
    void supabase.from('venue_nights').select('id, waiting_opens_at, venues(name)').order('waiting_opens_at', { ascending: false }).then(({ data }) => {
      if (active) setNights((data ?? []).map(row => ({ id: row.id, label: `${row.venues?.name ?? 'Venue'} · ${new Date(row.waiting_opens_at).toLocaleDateString()}` })));
    });
    return () => { active = false; };
  }, []);
  const close = () => { setSelected(null); setMessage(''); onCloseReport?.(); };
  async function decide(version: string, action: 'approved' | 'rejected') {
    if (!selected) return;
    setWorking(true); setMessage('');
    const result = await photos.rpc('decide_profile_photo', { p_owner: selected.profile_id, p_version: version, p_expected_revision: selected.revision, p_action: action, p_reason: action === 'rejected' ? reason : undefined });
    if (result.error) {
      setMessage(result.error.code === 'PT409' ? 'This review changed while you were looking. The latest photos are loaded below; review them again.' : 'Could not save this decision. Please try again.');
    } else setMessage('Photo decision saved. Any report remains open until handled separately.');
    const latest = await photos.rpc('admin_photo_queue', { p_profile: selected.profile_id, p_night: night || undefined }).returns<PhotoQueueRow[]>();
    setSelected(latest.data?.[0] ?? null);
    setWorking(false); invalidatePhotos(); void load();
  }
  function photo(path: string | null, label: string) {
    if (!path) return null;
    return <figure className="min-w-0"><button type="button" aria-label={`Enlarge ${label.toLowerCase()}`} onClick={() => setEnlarged(path)} className="w-full"><ProfilePhoto src={path} alt={label} className="h-52 w-full rounded-xl object-cover" /></button><figcaption className="mt-2 text-sm text-white/65">{label}</figcaption></figure>;
  }
  return <section className="mb-10" data-testid="admin-photo-queue">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-black">Photos <span className="ml-2 rounded-full bg-amber-300/15 px-3 py-1 text-sm">{count} pending</span></h3>
      <label className="text-sm">Night <select value={night} onChange={e => setNight(e.target.value)} className="night-input ml-2 max-w-64 px-3 py-2"><option value="">All open reviews</option>{nights.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label></div>
    {error && <p role="alert">{error}</p>}
    {message && !selected && <p role="status" className="mb-3">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(row => <button key={row.profile_id} onClick={() => { setSelected(row); setMessage(''); }} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
      <ProfilePhoto src={row.pending_path ?? row.displayed_path} alt="" loading="lazy" className="h-16 w-14 rounded-lg object-cover"/>
      <span><strong>{row.first_name}</strong><span className="mt-1 block text-xs text-white/60">{row.correction_required ? row.pending_id ? 'Correction to review' : 'Awaiting correction' : row.displayed_status === 'unverified' ? 'First photo · unverified' : row.pending_id ? 'Voluntary replacement' : 'Verified photo'}</span><span className="mt-1 block text-xs text-white/40">{row.submitted_at && new Date(row.submitted_at).toLocaleString()}</span></span>
    </button>)}</div>
    {!error && rows.length === 0 && <p className="py-5 text-sm text-white/50">No photos to review here.</p>}
    {selected && <Modal onClose={close} labelledById="photo-detail-title" closeLabel="Close photo review" dismissable={!working && !enlarged} panelClassName="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl p-6">
      <h3 id="photo-detail-title" className="text-xl font-bold">{selected.first_name} · Photo review</h3>
      <p className="mt-2 text-sm text-white/60">{selected.correction_required ? 'Correction required' : 'Review the exact version before deciding.'}</p>
      <div className="mt-5 grid grid-cols-2 gap-4">{photo(selected.displayed_path, selected.correction_required ? 'Rejected displayed photo' : 'Visible to others')}{photo(selected.pending_path, 'Waiting for review')}</div>
      {selected.reason && <p className="mt-3 text-sm">{photoStrings.en.reasons[selected.reason]}</p>}
      <label className="mt-5 block text-sm">Rejection reason<select value={reason} onChange={e => setReason(e.target.value as PhotoReason)} className="night-input mt-2 w-full px-3 py-3">{PHOTO_REASONS.map(r => <option key={r} value={r}>{photoStrings.en.reasons[r]}</option>)}</select></label>
      <p className="mt-2 text-xs text-white/50">Underage concerns belong in safety moderation.</p>
      {message && <p role="status" className="mt-4 rounded-xl bg-white/10 p-3 text-sm">{message}</p>}
      <div className="mt-5 flex flex-col gap-2">
        {selected.pending_id && <><button disabled={working} onClick={() => void decide(selected.pending_id!, 'approved')} className="night-button night-button-primary px-4 py-3">Approve new photo</button><button disabled={working} onClick={() => void decide(selected.pending_id!, 'rejected')} className="night-button night-button-secondary px-4 py-3">Reject new photo</button></>}
        {selected.displayed_id && !selected.correction_required && <>{selected.displayed_status === 'unverified' && <button disabled={working} onClick={() => void decide(selected.displayed_id!, 'approved')} className="night-button night-button-secondary px-4 py-3">Approve displayed photo</button>}<button disabled={working} onClick={() => void decide(selected.displayed_id!, 'rejected')} className="night-button night-button-danger px-4 py-3">Reject displayed photo · require correction</button></>}
      </div>
    </Modal>}
    {enlarged && <Modal onClose={() => setEnlarged(null)} labelledById="photo-zoom-title" closeLabel="Close enlarged photo" overlayClassName="z-50" panelClassName="w-full max-w-3xl p-4"><h3 id="photo-zoom-title" className="sr-only">Enlarged photo</h3><ProfilePhoto src={enlarged} alt="Profile under review" className="max-h-[80dvh] w-full object-contain"/></Modal>}
  </section>;
}
