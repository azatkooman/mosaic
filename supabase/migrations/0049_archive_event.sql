-- Archiving an event must archive it — including a draft.
--
-- 0018 gave `delete_event` two behaviours chosen by a field the person
-- clicking cannot see:
--
--   first_published_at is null  → the event, its forms, its form versions and
--                                 its participant types were DELETED outright
--   otherwise                   → soft delete (deleted_at + archived + unlisted)
--
-- So the same red "Delete" button either archived an event or destroyed it for
-- good, depending on whether it had ever been published. On production this
-- silently erased two never-published drafts (`igo-testing-ms2nhbtp`,
-- `new-test-event-msmxog50`) with their 3 forms, 5 form versions and 2
-- participant types; they never reached Admin ▸ Archived Events because there
-- was no row left to show. PurgeEventButton's own comment calls
-- DeleteEventButton "the counterpart ... which archives", so the destructive
-- branch contradicted the design it was written against.
--
-- Two changes here:
--
-- 1. `archive_event` — always a soft delete, whatever the publication history.
--    This is what the console now calls.
-- 2. `delete_event` — kept, because it is a granted API surface any
--    authenticated caller can reach through PostgREST, but redefined to
--    delegate. After this migration no non-admin path erases an event.
--
-- Permanent deletion stays exactly where 0036 put it: `purge_event`, admin
-- only, and only once an event is archived or has ended.
--
-- Deliberately not added: unarchiving. Nothing in the product restores a
-- soft-deleted row today (participants included), and inventing that here
-- would mean deciding what a restored event's status and visibility should be
-- without a screen asking for it. Admins can still see archived events, and
-- purge them.

create or replace function public.archive_event(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
begin
  -- `deleted_at is null` doubles as the already-archived guard: archiving an
  -- archived event would otherwise move its archived-at timestamp.
  select * into v_event from events where id = p_event_id and deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;

  -- The creator, or an admin. An event organizer who did not create the event
  -- deliberately cannot: managing an event is not the same as retiring it.
  -- private.is_admin() covers super_admin too (0007).
  if not (private.is_admin() or v_event.created_by = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Hidden everywhere (events_select_public admits deleted rows only for
  -- admins), marked archived so the badge reads correctly, and unlisted so it
  -- cannot resurface on the home page if it is ever restored by hand.
  update events
  set deleted_at = now(), status = 'archived', visibility = 'unlisted'
  where id = p_event_id;
end;
$$;

revoke execute on function public.archive_event(uuid) from public, anon;
grant execute on function public.archive_event(uuid) to authenticated;

-- Now a thin alias. Recreated in full rather than dropped: dropping would
-- break any client still calling it, and the point is that those callers
-- become safe, not that they start failing.
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.archive_event(p_event_id);
end;
$$;

revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

comment on function public.delete_event(uuid) is
  'Deprecated alias for archive_event. Kept so existing callers archive rather than delete; new code should call archive_event.';
