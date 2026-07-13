-- Moderation: blocks need context.
--
-- Reports already carry a reason/note. Blocks are also moderation signals, so
-- store the user's reason to help founders decide whether an ejection is
-- warranted.

alter table public.blocks
  add column if not exists reason text,
  add column if not exists note text;

update public.blocks
  set reason = 'other'
  where reason is null;

alter table public.blocks
  alter column reason set not null;

alter table public.blocks
  drop constraint if exists blocks_reason_check;

alter table public.blocks
  add constraint blocks_reason_check check (
    reason in (
      'harassment',
      'fake_profile',
      'underage',
      'unsafe_behavior',
      'other'
    )
  );

alter table public.blocks
  drop constraint if exists blocks_note_length;

alter table public.blocks
  add constraint blocks_note_length check (note is null or length(note) <= 500);
