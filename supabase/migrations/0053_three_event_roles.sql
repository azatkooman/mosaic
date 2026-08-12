-- Three fixed event roles, and the end of the privilege matrix.
--
-- 0008 built per-event custom roles over eight privilege booleans. Nothing has
-- ever used them: all fifteen memberships on production hold the single 'full'
-- preset, and the one custom role anybody made ("Custom role", view +
-- update_event) is attached to no one. Meanwhile two of the eight privileges,
-- can_scholarship and can_manage_payments, are enforced by nothing at all —
-- they have a column, a CASE arm, a wrapper function and a grant, and not one
-- policy or line of application code reads them. A checkbox reading "can
-- manage payments" that grants nothing is worse than an absent feature.
--
-- What replaces it:
--
--   owner         the creator. Everything, including the team.
--   co_organizer  invited by email. Everything except managing the team.
--   viewer        invited by email. Sees the event and its registrants only.
--
-- event_roles SURVIVES as a three-row internal lookup rather than being
-- dropped, and that is deliberate. submit_registration (0031),
-- update_participant (0023) and the manual-close function (0041) each join it
-- inline — `join event_roles er on er.id = m.role_id` — so dropping the table
-- means re-transcribing all three, including the ~150-line function that owns
-- capacity locking and waitlist promotion, to change six lines in each. The
-- risk of a transcription error there is worse than the indirection. Those
-- joins read can_add_registrants, which this migration leaves untouched, so
-- they keep working verbatim. Collapsing role_id into a plain column is a safe
-- follow-up once nothing else joins the table.
--
-- Also gone: requesting access to an event. 0012 let anyone ask to join by
-- slug, and 0021 had already removed the global-role equivalent; production
-- has never had a single 'requested' row, and the console's request queue
-- reads a status nothing produces.

-- ---------------------------------------------------------------------------
-- 1. The three roles
-- ---------------------------------------------------------------------------
-- The old check allowed only view/scholarship/checkin/update/full, so it has to
-- go before the new rows can be inserted; the NEW check cannot be added until
-- the old rows are gone, or it is validated against them and fails. So: drop
-- here, re-add at the end of step 3.
alter table event_roles drop constraint if exists event_roles_preset_key_check;

-- Insert before the remap, delete the old ones after it, so no membership is
-- ever pointing at a row that does not exist.
insert into event_roles (
  org_id, preset_key, name, can_view, can_scholarship, can_add_registrants,
  can_manage_payments, can_checkin, can_update_event, can_delete_registrants,
  can_manage_team
)
select o.id, x.k, x.n, x.v, false, x.a, false, x.c, x.u, x.d, x.t
from (select id from organizations order by created_at limit 1) o,
     (values
       -- view, add_registrants, checkin, update_event, delete_registrants, manage_team
       ('owner',        'Owner',        true, true,  true,  true,  true,  true),
       ('co_organizer', 'Co-organizer', true, true,  true,  true,  true,  false),
       ('viewer',       'Viewer',       true, false, false, false, false, false)
     ) as x(k, n, v, a, c, u, d, t)
where not exists (select 1 from event_roles where preset_key = x.k);

-- ---------------------------------------------------------------------------
-- 2. Remap every membership. The creator of the event becomes its owner;
--    everyone else becomes a co-organizer, which is what the 'full' preset
--    they all hold today already granted them.
-- ---------------------------------------------------------------------------
update event_organizers m
set role_id = (select id from event_roles where preset_key = 'owner')
from events e
where e.id = m.event_id and e.created_by = m.user_id;

update event_organizers m
set role_id = (select id from event_roles where preset_key = 'co_organizer')
where m.role_id is not null
  and m.role_id <> (select id from event_roles where preset_key = 'owner');

-- A membership with no role_id can only be a 'requested' row (the state
-- constraint below allowed exactly that pairing). Those are going.
delete from event_organizers where status = 'requested';

-- ---------------------------------------------------------------------------
-- 3. Retire the old roles: the five presets, and any per-event custom role.
--    Nothing references them now.
-- ---------------------------------------------------------------------------
delete from event_roles
where preset_key not in ('owner', 'co_organizer', 'viewer') or event_id is not null;

-- Now that only the three survive, the rule they satisfy can be enforced.
alter table event_roles add constraint event_roles_preset_key_check
  check (preset_key in ('owner', 'co_organizer', 'viewer'));

-- Roles are the product's, not an event's, from here on.
alter table event_roles add constraint event_roles_global_only check (event_id is null);
alter table event_roles alter column preset_key set not null;

-- ---------------------------------------------------------------------------
-- 4. Drop the two privileges nothing enforces.
-- ---------------------------------------------------------------------------
drop function if exists private.can_manage_scholarships(uuid);
drop function if exists private.can_manage_payments(uuid);
alter table event_roles drop column if exists can_scholarship;
alter table event_roles drop column if exists can_manage_payments;

-- Recreated without the two CASE arms whose columns just went. The shape is
-- otherwise 0011's, global organizers included.
create or replace function private.has_event_privilege(eid uuid, priv text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select private.is_global_organizer() or exists (
    select 1
    from event_organizers m
    join event_roles r on r.id = m.role_id
    where m.event_id = eid
      and m.user_id = auth.uid()
      and m.status = 'active'
      and case priv
        when 'view'               then r.can_view
        when 'add_registrants'    then r.can_add_registrants
        when 'checkin'            then r.can_checkin
        when 'update_event'       then r.can_update_event
        when 'delete_registrants' then r.can_delete_registrants
        when 'manage_team'        then r.can_manage_team
        else false
      end
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. No more requesting access.
-- ---------------------------------------------------------------------------
drop function if exists public.request_event_access(uuid);
drop function if exists public.request_event_access_by_slug(text);

alter table event_organizers drop constraint if exists event_org_role_state;
alter table event_organizers drop constraint if exists event_organizers_status_check;
alter table event_organizers add constraint event_organizers_status_check
  check (status = 'active');
alter table event_organizers add constraint event_org_role_state check (role_id is not null);

-- The delete policy admitted a member withdrawing their own pending request.
-- There are no pending requests now; managing the team is the only route.
drop policy if exists event_org_delete on event_organizers;
create policy event_org_delete on event_organizers for delete to authenticated
  using (private.can_manage_team(event_id));

-- ---------------------------------------------------------------------------
-- 6. Inviting a co-organizer needs only their email — including an email that
--    has never signed in. Mirrors pending_role_invites (0026): park it, and
--    apply it the first time that address appears.
-- ---------------------------------------------------------------------------
create table if not exists pending_event_invites (
  event_id    uuid not null references events(id) on delete cascade,
  email       text not null,
  preset_key  text not null check (preset_key in ('co_organizer', 'viewer')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (event_id, email)
);

alter table pending_event_invites enable row level security;

-- Readable and cancellable by whoever manages that event's team; all writes
-- otherwise go through the security-definer function below.
create policy pending_event_invites_team on pending_event_invites
  for all to authenticated
  using (private.can_manage_team(event_id))
  with check (private.can_manage_team(event_id));

-- Replaces add_event_organizer(uuid, text, uuid): a role KEY rather than a
-- role id, since there are three of them and they are no longer rows anyone
-- picks from a list. Returns 'granted' or 'invited', like invite_global_role.
drop function if exists public.add_event_organizer(uuid, text, uuid);

create or replace function public.add_event_organizer(
  p_event_id uuid, p_email text, p_preset_key text
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
  v_role uuid;
begin
  if not private.can_manage_team(p_event_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Owner is held by the event's creator and is not something to hand out.
  if p_preset_key not in ('co_organizer', 'viewer') then
    raise exception 'invalid role';
  end if;
  select id into v_role from event_roles where preset_key = p_preset_key;

  select id into v_user from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    insert into pending_event_invites (event_id, email, preset_key, invited_by)
    values (p_event_id, lower(trim(p_email)), p_preset_key, auth.uid())
    on conflict (event_id, email) do update
      set preset_key = excluded.preset_key, invited_by = excluded.invited_by;
    return 'invited';
  end if;

  -- Never demote the creator out of their own event.
  insert into event_organizers (event_id, user_id, role_id, status, granted_by)
  values (p_event_id, v_user, v_role, 'active', auth.uid())
  on conflict (event_id, user_id) do update
    set role_id = case
          when exists (select 1 from events e where e.id = p_event_id and e.created_by = v_user)
            then event_organizers.role_id
          else excluded.role_id
        end,
        granted_by = excluded.granted_by;
  return 'granted';
end;
$$;

revoke execute on function public.add_event_organizer(uuid, text, text) from public, anon;
grant execute on function public.add_event_organizer(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Apply parked invites on first sign-in. Recreated from 0026 with the
--    event-invite block appended; the profile and global-role halves are
--    unchanged.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, org_id, full_name, email, preferred_locale)
  values (
    new.id,
    (select id from public.organizations order by created_at limit 1),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'locale',''), 'en')
  )
  on conflict (id) do nothing;

  -- Apply a pending global-role invite, if one exists for this email.
  insert into public.user_roles (user_id, org_id, role)
  select
    new.id,
    coalesce(pri.org_id, (select id from public.organizations order by created_at limit 1)),
    pri.role
  from public.pending_role_invites pri
  where lower(pri.email) = lower(new.email)
  on conflict (user_id, org_id) do update set role = excluded.role;

  delete from public.pending_role_invites where lower(email) = lower(new.email);

  -- And any event invitations waiting on this address.
  insert into public.event_organizers (event_id, user_id, role_id, status, granted_by)
  select pei.event_id, new.id, r.id, 'active', pei.invited_by
  from public.pending_event_invites pei
  join public.event_roles r on r.preset_key = pei.preset_key
  where lower(pei.email) = lower(new.email)
  on conflict (event_id, user_id) do nothing;

  delete from public.pending_event_invites where lower(email) = lower(new.email);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. A new event's creator is its owner.
-- ---------------------------------------------------------------------------
create or replace function private.grant_creator_event_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.event_organizers (event_id, user_id, role_id, status, granted_by)
  values (
    new.id, new.created_by,
    (select id from event_roles where preset_key = 'owner'),
    'active', new.created_by
  )
  on conflict do nothing;
  return new;
end;
$$;

comment on table event_roles is
  'Three fixed roles: owner, co_organizer, viewer. Not user-editable — the '
  'custom-role feature was removed in 0053. Kept as a lookup because '
  'submit_registration, update_participant and the manual-close function join '
  'it inline; collapsing it into a column on event_organizers is a safe '
  'follow-up once those no longer do.';

-- ---------------------------------------------------------------------------
-- 9. Roles are read-only to clients now. Nothing creates, edits or deletes
--    them: the three rows are the product's definition of what a team member
--    can be, and the console has no editor for them any more. Select stays,
--    because the team page shows a member's role by name.
-- ---------------------------------------------------------------------------
drop policy if exists event_roles_insert on event_roles;
drop policy if exists event_roles_update on event_roles;
drop policy if exists event_roles_delete on event_roles;

-- The rename guard was for an editor that no longer exists, and nothing can
-- reach UPDATE to trip it.
drop trigger if exists protect_preset_roles on event_roles;
drop function if exists private.protect_preset_roles();

-- ---------------------------------------------------------------------------
-- 10. The team page needs to know whether to render its controls at all.
--     Same shape as can_view_event_api and its siblings (0002): a thin public
--     wrapper so the console can ask, with the RPC still doing the enforcing.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_team_api(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select private.can_manage_team(eid);
$$;
revoke execute on function public.can_manage_team_api(uuid) from public, anon;
grant execute on function public.can_manage_team_api(uuid) to authenticated;
