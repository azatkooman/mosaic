-- Harden archive_event's permission guard against a NULL auth.uid().
--
-- 0049 inherited 0018's guard shape verbatim:
--
--   if not (private.is_admin() or v_event.created_by = auth.uid()) then
--     raise exception 'not allowed' ...
--
-- With no JWT — a service_role call, or any definer context where auth.uid()
-- is NULL — that does not raise. is_admin() returns false (its EXISTS matches
-- no row), but `created_by = NULL` is NULL, so `false or NULL` is NULL,
-- `not NULL` is NULL, and PL/pgSQL does not take an IF whose condition is
-- NULL. The guard is skipped and the archive proceeds. Found by calling
-- archive_event with the service_role key against production, which archived a
-- draft it should have refused; the row was restored.
--
-- Not reachable by an ordinary caller: execute is revoked from anon and
-- granted only to authenticated, whose auth.uid() is never NULL. The exposure
-- is server-side code holding the service key — this app's own API routes and
-- anything else using it — where the intent has always been that these RPCs
-- enforce their own rules rather than trust the caller.
--
-- Fixed by demanding a caller up front instead of by rearranging the boolean:
-- an explicit `auth.uid() is null` check states the precondition the rest of
-- the function was already assuming. events.created_by is NOT NULL, so once
-- auth.uid() is known non-NULL the comparison can no longer produce NULL.
--
-- delete_event needs no change here: 0049 made it a thin `perform
-- archive_event(...)`, so it inherits this. 0018's original two-branch body,
-- which had the same hole in front of a hard DELETE, is gone.

create or replace function public.archive_event(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
begin
  -- Archiving is always somebody's decision; there is no system actor for it.
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_event from events where id = p_event_id and deleted_at is null;
  if not found then
    raise exception 'event not found';
  end if;

  if not (private.is_admin() or v_event.created_by = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update events
  set deleted_at = now(), status = 'archived', visibility = 'unlisted'
  where id = p_event_id;
end;
$$;

revoke execute on function public.archive_event(uuid) from public, anon;
grant execute on function public.archive_event(uuid) to authenticated;
