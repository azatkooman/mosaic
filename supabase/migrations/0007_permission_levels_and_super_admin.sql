-- Permission levels + super admin + access requests.
--
-- Global roles gain 'super_admin': exactly one account that no admin can
-- modify or delete; only the super admin can hand it to someone else
-- (transfer_super_admin). Admins keep managing everything else.
--
-- Per-event roles become a six-level ladder (each level includes the ones
-- below it):
--   requested   — asked for access, has none yet
--   view        — view/export registrations and payments
--   scholarship — view + manage/add scholarships
--   checkin     — scholarship + add registrants, edit/add/delete payments
--   update      — checkin + change the event/questions, delete registrants
--   full        — everything, including managing the team
-- Existing rows map organizer -> full, viewer -> view.

-- ---------------------------------------------------------------------------
-- 1. Recreate enums (new types + column casts; ALTER TYPE ADD VALUE cannot be
--    used inside the migration transaction).
-- ---------------------------------------------------------------------------
alter type global_role rename to global_role_old;
create type global_role as enum ('super_admin', 'admin', 'organizer');
alter table user_roles
  alter column role type global_role using role::text::global_role;
drop function public.grant_global_role(text, global_role_old);
-- 0006 created approve_role_request against the pre-swap enum; drop it here
-- (it still depends on global_role_old) and recreate it at the end of this
-- migration with the new type.
drop function if exists public.approve_role_request(uuid, global_role_old);
drop type global_role_old;

alter type event_role rename to event_role_old;
create type event_role as enum
  ('requested', 'view', 'scholarship', 'checkin', 'update', 'full');
drop function public.add_event_organizer(uuid, text, event_role_old);
alter table event_organizers
  alter column role type event_role
  using (case role::text when 'organizer' then 'full' else 'view' end)::event_role;
drop type event_role_old;

-- ---------------------------------------------------------------------------
-- 2. Bootstrap the super admin: the earliest-granted admin becomes it.
--    (Mirrors 0003's first-admin bootstrap for environments with no roles.)
-- ---------------------------------------------------------------------------
insert into user_roles (user_id, org_id, role)
select p.id, p.org_id, 'admin'
from profiles p
where p.org_id is not null
  and not exists (select 1 from user_roles)
order by p.created_at
limit 1
on conflict do nothing;

update user_roles
set role = 'super_admin'
where not exists (select 1 from user_roles where role = 'super_admin')
  and (user_id, org_id) in (
    select user_id, org_id from user_roles
    where role = 'admin'
    order by created_at
    limit 1
  );

-- ---------------------------------------------------------------------------
-- 3. Role helpers. is_admin() now includes the super admin, so every existing
--    admin-gated policy automatically covers them.
-- ---------------------------------------------------------------------------
create or replace function private.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function private.is_global_organizer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role in ('admin', 'super_admin', 'organizer')
  );
$$;

create or replace function private.event_role_rank(r event_role)
returns integer
language sql immutable
as $$
  select case r
    when 'requested'   then 0
    when 'view'        then 1
    when 'scholarship' then 2
    when 'checkin'     then 3
    when 'update'      then 4
    when 'full'        then 5
  end;
$$;

create or replace function private.has_event_level(eid uuid, minimum event_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select private.is_admin() or exists (
    select 1 from event_organizers
    where event_id = eid
      and user_id = auth.uid()
      and private.event_role_rank(role) >= private.event_role_rank(minimum)
  );
$$;

-- Level-specific helpers; RLS and future features gate on these.
create or replace function private.can_view_event(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.has_event_level(eid, 'view'); $$;

create or replace function private.can_manage_scholarships(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.has_event_level(eid, 'scholarship'); $$;

create or replace function private.can_checkin_event(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.has_event_level(eid, 'checkin'); $$;

create or replace function private.can_manage_event(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.has_event_level(eid, 'update'); $$;

create or replace function private.can_manage_team(eid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select private.has_event_level(eid, 'full'); $$;

grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.event_role_rank(event_role) to authenticated, anon;
grant execute on function private.has_event_level(uuid, event_role) to authenticated;
grant execute on function private.can_manage_scholarships(uuid) to authenticated;
grant execute on function private.can_checkin_event(uuid) to authenticated;
grant execute on function private.can_manage_team(uuid) to authenticated;

-- Event creators now get 'full'.
create or replace function private.grant_creator_event_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.event_organizers (event_id, user_id, role, granted_by)
  values (new.id, new.created_by, 'full', new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Policy updates.
-- ---------------------------------------------------------------------------
-- user_roles: admins manage roles but can never touch a super_admin row or
-- create one; super admin changes hands only via transfer_super_admin().
drop policy user_roles_insert on user_roles;
create policy user_roles_insert on user_roles for insert to authenticated
  with check (private.is_admin() and role <> 'super_admin');
drop policy user_roles_update on user_roles;
create policy user_roles_update on user_roles for update to authenticated
  using (private.is_admin() and role <> 'super_admin')
  with check (role <> 'super_admin');
drop policy user_roles_delete on user_roles;
create policy user_roles_delete on user_roles for delete to authenticated
  using (private.is_admin() and role <> 'super_admin');

-- event_organizers: team membership is managed at 'full'; users may cancel
-- their own pending request. (Requests are created via request_event_access.)
drop policy event_org_insert on event_organizers;
create policy event_org_insert on event_organizers for insert to authenticated
  with check (private.can_manage_team(event_id));
drop policy event_org_update on event_organizers;
create policy event_org_update on event_organizers for update to authenticated
  using (private.can_manage_team(event_id))
  with check (private.can_manage_team(event_id));
drop policy event_org_delete on event_organizers;
create policy event_org_delete on event_organizers for delete to authenticated
  using (
    private.can_manage_team(event_id)
    or (user_id = auth.uid() and role = 'requested')
  );

-- participants: status changes (check-in work) at 'checkin'; deleting
-- registrants is 'update'.
drop policy participants_update on participants;
create policy participants_update on participants for update to authenticated
  using (private.can_checkin_event(event_id));
create policy participants_delete on participants for delete to authenticated
  using (private.can_manage_event(event_id));

-- ---------------------------------------------------------------------------
-- 5. RPCs.
-- ---------------------------------------------------------------------------
-- Grant/change a global role by email. Never touches super_admin (either as
-- the target's current role or as the requested role).
create or replace function public.grant_global_role(p_email text, p_role global_role)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
  v_org uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_role = 'super_admin' then
    raise exception 'super admin can only be assigned via transfer_super_admin';
  end if;
  select id, org_id into v_user, v_org
    from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no user with that email — they must sign in once first';
  end if;
  if exists (select 1 from user_roles where user_id = v_user and role = 'super_admin') then
    raise exception 'the super admin''s role cannot be changed';
  end if;
  if v_org is null then
    select id into v_org from organizations order by created_at limit 1;
  end if;
  insert into user_roles (user_id, org_id, role)
  values (v_user, v_org, p_role)
  on conflict (user_id, org_id) do update set role = excluded.role;
end;
$$;
revoke execute on function public.grant_global_role(text, global_role) from public, anon;
grant execute on function public.grant_global_role(text, global_role) to authenticated;

-- Remove a user's global role entirely. Super admin excluded.
create or replace function public.revoke_global_role(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from user_roles where user_id = p_user_id and role = 'super_admin') then
    raise exception 'the super admin''s role cannot be removed';
  end if;
  delete from user_roles where user_id = p_user_id;
end;
$$;
revoke execute on function public.revoke_global_role(uuid) from public, anon;
grant execute on function public.revoke_global_role(uuid) to authenticated;

-- Hand super admin to another user (caller becomes a regular admin).
-- The only path by which a super_admin row is ever written.
create or replace function public.transfer_super_admin(p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
  v_org uuid;
begin
  if not private.is_super_admin() then
    raise exception 'only the super admin can transfer super admin';
  end if;
  select id, org_id into v_user, v_org
    from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no user with that email — they must sign in once first';
  end if;
  if v_user = auth.uid() then
    return;
  end if;
  if v_org is null then
    select id into v_org from organizations order by created_at limit 1;
  end if;
  update user_roles set role = 'admin'
    where user_id = auth.uid() and role = 'super_admin';
  insert into user_roles (user_id, org_id, role)
  values (v_user, v_org, 'super_admin')
  on conflict (user_id, org_id) do update set role = excluded.role;
end;
$$;
revoke execute on function public.transfer_super_admin(text) from public, anon;
grant execute on function public.transfer_super_admin(text) to authenticated;

-- Add/change a team member by email at a real access level.
create or replace function public.add_event_organizer(
  p_event_id uuid, p_email text, p_role event_role
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
begin
  if not private.can_manage_team(p_event_id) then
    raise exception 'not allowed';
  end if;
  if p_role = 'requested' then
    raise exception 'invalid access level';
  end if;
  select id into v_user from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no user with that email';
  end if;
  insert into event_organizers (event_id, user_id, role, granted_by)
  values (p_event_id, v_user, p_role, auth.uid())
  on conflict (event_id, user_id) do update
    set role = excluded.role, granted_by = excluded.granted_by;
end;
$$;
revoke execute on function public.add_event_organizer(uuid, text, event_role) from public, anon;
grant execute on function public.add_event_organizer(uuid, text, event_role) to authenticated;

-- Any signed-in user may ask for access to a published event. The row sits at
-- 'requested' (no privileges) until an admin or full organizer approves it by
-- setting a real level, or denies it by deleting the row.
create or replace function public.request_event_access(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from events where id = p_event_id and status = 'published'
  ) then
    raise exception 'event not found';
  end if;
  insert into event_organizers (event_id, user_id, role)
  values (p_event_id, auth.uid(), 'requested')
  on conflict (event_id, user_id) do nothing;
end;
$$;
revoke execute on function public.request_event_access(uuid) from public, anon;
grant execute on function public.request_event_access(uuid) to authenticated;

-- Recreate 0006's approve_role_request against the new global_role enum
-- (dropped above during the enum swap). Body identical apart from the type.
create or replace function public.approve_role_request(p_user_id uuid, p_role global_role)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_role = 'super_admin' then
    raise exception 'super admin can only be assigned via transfer_super_admin';
  end if;
  select org_id into v_org from role_requests where user_id = p_user_id;
  if v_org is null then
    raise exception 'no pending request for that user';
  end if;
  if exists (select 1 from user_roles where user_id = p_user_id and role = 'super_admin') then
    raise exception 'the super admin''s role cannot be changed';
  end if;
  insert into user_roles (user_id, org_id, role)
  values (p_user_id, v_org, p_role)
  on conflict (user_id, org_id) do update set role = excluded.role;
  delete from role_requests where user_id = p_user_id;
end;
$$;
revoke execute on function public.approve_role_request(uuid, global_role) from public, anon;
grant execute on function public.approve_role_request(uuid, global_role) to authenticated;
