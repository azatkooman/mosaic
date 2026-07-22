-- Join by event code: request access to an event by its slug. Unlike the
-- browse list (published events only), this also works for drafts, so teams
-- can assemble before an event goes public. The organizer shares the code
-- from the Team page. Archived events are not joinable.
--
-- Deliberate trade-off: probing a slug reveals that an event exists (the
-- requester still gets zero access — just a pending request the team can
-- deny).

create or replace function public.request_event_access_by_slug(p_slug text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_event from events where slug = lower(trim(p_slug));
  if not found or v_event.status = 'archived' then
    raise exception 'no event with that code';
  end if;
  if exists (
    select 1 from event_organizers
    where event_id = v_event.id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'you are already on this event''s team';
  end if;
  if exists (
    select 1 from event_organizers
    where event_id = v_event.id and user_id = auth.uid() and status = 'requested'
  ) then
    raise exception 'your request for this event is already pending';
  end if;
  insert into event_organizers (event_id, user_id, status)
  values (v_event.id, auth.uid(), 'requested');
end;
$$;
revoke execute on function public.request_event_access_by_slug(text) from public, anon;
grant execute on function public.request_event_access_by_slug(text) to authenticated;
