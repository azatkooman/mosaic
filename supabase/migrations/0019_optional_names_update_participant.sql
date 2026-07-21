-- 0016 made name/email removable form questions, so a participant can
-- legitimately have no name — but update_participant still raised
-- 'participant name required', blocking organizers from editing such a
-- registrant. Drop the check and default missing names to empty strings
-- (first_name/last_name are NOT NULL columns), mirroring submit_registration.
-- When a form does include a required name question, requiredness is still
-- enforced on the answers by the shared validation engine in /api/participants.

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

  update participants
  set first_name = trim(coalesce(p_first_name, '')),
      last_name = trim(coalesce(p_last_name, '')),
      email = nullif(trim(coalesce(p_email, '')), ''),
      answers = coalesce(p_answers, '{}'::jsonb)
  where id = p_participant_id;
end;
$$;

-- Re-assert grants (create or replace preserves them, but be explicit).
revoke execute on function public.update_participant(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.update_participant(uuid, text, text, text, jsonb) to authenticated;
