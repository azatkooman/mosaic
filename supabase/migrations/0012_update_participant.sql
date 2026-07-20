-- Let organizers edit a registrant's details from the console.
--
-- Editing is gated on the can_add_registrants privilege (Check-in role and
-- above). Answers are validated in the /api/participants route with the same
-- shared engine registration uses, then written through this RPC, which
-- re-checks the privilege server-side so a direct call can't bypass it.

create or replace function public.update_participant(
  p_participant_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_answers jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event uuid;
begin
  select event_id into v_event from participants where id = p_participant_id;
  if v_event is null then
    raise exception 'participant not found';
  end if;
  if not private.can_add_registrants(v_event) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_first_name, ''))) = 0
     or length(trim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'participant name required';
  end if;

  update participants
  set first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = nullif(trim(coalesce(p_email, '')), ''),
      answers = coalesce(p_answers, '{}'::jsonb)
  where id = p_participant_id;
end;
$$;
revoke execute on function public.update_participant(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.update_participant(uuid, text, text, text, jsonb) to authenticated;

-- UX wrapper: lets a server component decide whether to show the Edit button.
-- Authoritative enforcement is inside update_participant above.
create or replace function public.can_add_registrants_api(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.can_add_registrants(eid); $$;
revoke execute on function public.can_add_registrants_api(uuid) from public, anon;
grant execute on function public.can_add_registrants_api(uuid) to authenticated;
