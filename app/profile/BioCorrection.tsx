'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isValidText } from '@/lib/input-validation';
import { invalidateParticipant } from '@/lib/participant-refresh';
import type { Locale } from '@/lib/strings';
import type { TextCorrection } from '@/lib/text-moderation';
import { textModerationStrings } from '@/lib/text-moderation-strings';
import { profileReviewStrings } from '@/lib/profile-review-strings';

export function BioCorrection({ state, locale, draft, onDraftChange, unified = false, focusRequested = false }: {
  state: TextCorrection; locale: Locale; draft: string; onDraftChange: (value: string) => void;
  unified?: boolean; focusRequested?: boolean;
}) {
  const s = textModerationStrings[locale];
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const receipt = useRef<{ id: string; text: string; revision: string } | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  // A direct edit can precede the field's correction read. Keep its focus intent
  // when the ordinary bio editor is replaced by this staged correction editor.
  useEffect(() => { if (focusRequested) editor.current?.focus(); }, [focusRequested, state.status]);
  async function submit() {
    if (busy.current || !isValidText(draft, 300, false) || state.status === 'pending') return;
    const text = draft.trim();
    if (!receipt.current || receipt.current.text !== text) receipt.current = { id: crypto.randomUUID(), text, revision: state.revision };
    busy.current = true; setWorking(true); setError(false);
    try {
      const result = await supabase.rpc('submit_bio_correction', {
        p_request_id: receipt.current.id, p_proposed_text: text, p_revision: receipt.current.revision,
      });
      if (result.error) {
        if (result.error.code === 'PT409') receipt.current = null;
        setError(true);
      } else { receipt.current = null; onDraftChange(''); }
    } catch { setError(true); }
    finally { busy.current = false; setWorking(false); invalidateParticipant(); }
  }
  async function cancel() {
    if (busy.current || !state.request_id) return;
    busy.current = true; setWorking(true); setError(false);
    try {
      const result = await supabase.rpc('cancel_bio_correction', { p_request_id: state.request_id });
      setError(Boolean(result.error));
      if (!result.error) receipt.current = null;
    } catch { setError(true); }
    finally { busy.current = false; setWorking(false); invalidateParticipant(); }
  }
  return <div data-testid="bio-correction">
    {state.status === 'pending' ? <>
      <p role="status" className="mt-3 text-sm">{unified ? profileReviewStrings[locale].fieldSaved : s.pending}</p>
      <p className="mt-3 whitespace-pre-wrap break-words">{state.proposed_text ?? s.emptyBio}</p>
      <button type="button" disabled={working} onClick={() => void cancel()} className="night-button night-button-secondary mt-4 w-full px-4 py-3">{s.cancel}</button>
    </> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor="corrected-bio" className="mt-4 block text-sm">{s.bio}</label>
      <textarea ref={editor} id="corrected-bio" value={draft} onChange={event => onDraftChange(event.target.value)}
        disabled={working} aria-describedby="corrected-bio-help" aria-invalid={!isValidText(draft, 300, false)}
        className="night-input mt-2 h-28 w-full resize-none px-4 py-3" />
      <p id="corrected-bio-help" className="mt-2 text-sm text-taupe">{s.bioHelp}</p>
      <button type="submit" disabled={working || !isValidText(draft, 300, false)} className="night-button night-button-primary mt-4 w-full px-4 py-3">{working ? s.working : unified ? profileReviewStrings[locale].saveBio : s.submit}</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-blush">{s.error}</p>}
  </div>;
}
