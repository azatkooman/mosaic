-- Event visibility + deletion.
--
-- 1. visibility: 'public' events appear on the home-page list; 'unlisted'
--    events are reachable by link only. (A future visibility feature can
--    extend the check constraint with more values.)
-- 2. first_published_at: stamped by trigger the first time an event is
--    published — the deletion policy depends on it.
-- 3. delete_event RPC (admins + the event creator): never-published drafts
--    are removed permanently; anything once published is soft-deleted
--    (deleted_at + archived + unlisted) so the history of past public
--    events stays in the database for future admin tooling.
-- 4. RLS hides soft-deleted events from everyone except admins.

alter table events add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'unlisted'));
alter table events add column if not exists first_published_at timestamptz;
alter table events add column if not exists deleted_at timestamptz;

-- Existing published events were, by definition, published at some point.
update events set first_published_at = now()
  where status = 'published' and first_published_at is null;

create or replace function private.stamp_first_published()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.first_published_at is null then
    new.first_published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists events_stamp_first_published on events;
create trigger events_stamp_first_published
  before insert or update on events
  for each row execute function private.stamp_first_published();

-- Soft-deleted events are invisible to everyone but admins.
drop policy events_select_public on events;
create policy events_select_public on events for select to anon, authenticated
  using (
    (deleted_at is null or private.is_admin())
    and (status = 'published' or private.can_view_event(id))
  );

create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
begin
  select * into v_event from events where id = p_event_id and deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;
  if not (private.is_admin() or v_event.created_by = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_event.first_published_at is null then
    -- Never published: remove permanently. participants.event_id has no
    -- ON DELETE rule, so children are cleared explicitly (deepest first);
    -- forms cascade to form_versions, registrations to participants,
    -- event_roles/event_organizers cascade from events.
    delete from participants where event_id = p_event_id;
    delete from registrations where event_id = p_event_id;
    delete from participant_types where event_id = p_event_id;
    delete from forms where event_id = p_event_id;
    delete from events where id = p_event_id;
  else
    -- Once published: hide everywhere, keep the row as archive history.
    update events
    set deleted_at = now(), status = 'archived', visibility = 'unlisted'
    where id = p_event_id;
  end if;
end;
$$;
revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;
