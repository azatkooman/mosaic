-- Harden two things introduced in 0023/0026.
--
-- 1. update_own_participant (0023) was granted to `authenticated`, so a
--    registrant could call it directly via PostgREST and store arbitrary,
--    unvalidated answers on their own participant — the same bypass the
--    codebase avoids everywhere else by making write RPCs service-role-only
--    (submit_registration, update_participant's route). Make it
--    service-role-only and take the registrant id explicitly; /api/my/
--    participants is the sole caller and runs the shared answer validation
--    (plus file-ownership) before invoking it.
--
-- 2. pending_role_invites (0026) enabled RLS with an admin policy but never
--    granted the table to `authenticated`, so the policy was dead and admins
--    could not list or cancel invites via the API. Grant it.

-- --- 1. service-role-only update_own_participant -----------------------------
drop function if exists public.update_own_participant(uuid, text, text, text, jsonb);

create function public.update_own_participant(
  p_participant_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_answers jsonb,
  p_registered_by uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_registered_by, auth.uid());
  v_p participants%rowtype;
  v_event events%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_p from participants where id = p_participant_id;
  if not found then
    raise exception 'participant not found';
  end if;
  if not exists (
    select 1 from registrations r
    where r.id = v_p.registration_id and r.registered_by = v_uid
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_p.status = 'cancelled' then
    raise exception 'participant is cancelled';
  end if;

  select * into v_event from events where id = v_p.event_id;
  if not found or v_event.status <> 'published' or v_event.deleted_at is not null then
    raise exception 'event not open for changes';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'registration has not opened yet';
  end if;
  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'registration is closed';
  end if;

  update participants
  set first_name = trim(coalesce(p_first_name, '')),
      last_name = trim(coalesce(p_last_name, '')),
      email = nullif(trim(coalesce(p_email, '')), ''),
      answers = coalesce(p_answers, '{}'::jsonb)
  where id = p_participant_id;
end;
$$;

revoke execute on function public.update_own_participant(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.update_own_participant(uuid, text, text, text, jsonb, uuid) to service_role;

-- --- 2. make the pending-invite admin policy reachable -----------------------
grant select, delete on pending_role_invites to authenticated;
