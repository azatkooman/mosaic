-- Custom event roles: the fixed five-level ladder becomes a roles table with
-- one row per role and eight privilege flags. The five standard levels are
-- seeded as locked presets (preset_key set); custom roles are either global
-- (event_id null, managed by admins) or scoped to one event (managed by that
-- event's team managers).
--
-- event_organizers changes shape: the role enum is replaced by role_id (a
-- reference into event_roles) plus a status ('requested' | 'active').

-- ---------------------------------------------------------------------------
-- 1. Roles table.
-- ---------------------------------------------------------------------------
create table event_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  event_id uuid references events(id) on delete cascade, -- null = all events
  preset_key text unique check (preset_key in ('view','scholarship','checkin','update','full')),
  name text not null check (char_length(name) between 1 and 60),
  -- every role can at least view (the ladder's floor)
  can_view boolean not null default true check (can_view),
  can_scholarship boolean not null default false,
  can_add_registrants boolean not null default false,
  can_manage_payments boolean not null default false,
  can_checkin boolean not null default false,
  can_update_event boolean not null default false,
  can_delete_registrants boolean not null default false,
  can_manage_team boolean not null default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  -- presets are global by definition
  check (preset_key is null or event_id is null)
);

-- unique name per scope (global scope shares one namespace)
create unique index event_roles_scoped_name on event_roles
  (coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

insert into event_roles (
  org_id, preset_key, name, can_view, can_scholarship, can_add_registrants,
  can_manage_payments, can_checkin, can_update_event, can_delete_registrants,
  can_manage_team
)
select o.id, x.preset_key, x.name, x.v, x.s, x.a, x.p, x.c, x.u, x.d, x.t
from (select id from organizations order by created_at limit 1) o,
     (values
       ('view',        'View',        true, false, false, false, false, false, false, false),
       ('scholarship', 'Scholarship', true, true,  false, false, false, false, false, false),
       ('checkin',     'Check-in',    true, true,  true,  true,  true,  false, false, false),
       ('update',      'Update',      true, true,  true,  true,  true,  true,  true,  false),
       ('full',        'Full',        true, true,  true,  true,  true,  true,  true,  true)
     ) as x(preset_key, name, v, s, a, p, c, u, d, t);

-- ---------------------------------------------------------------------------
-- 2. Memberships point at roles; 'requested' becomes a status.
-- ---------------------------------------------------------------------------
alter table event_organizers add column role_id uuid references event_roles(id);
alter table event_organizers add column status text not null default 'active'
  check (status in ('requested','active'));

update event_organizers set status = 'requested' where role = 'requested';
update event_organizers eo
set role_id = r.id
from event_roles r
where r.preset_key = eo.role::text
  and eo.role <> 'requested';

alter table event_organizers add constraint event_org_role_state check (
  (status = 'requested' and role_id is null)
  or (status = 'active' and role_id is not null)
);

-- Old enum machinery: drop everything that references it, then the column/type.
drop function public.add_event_organizer(uuid, text, event_role);
drop function private.has_event_level(uuid, event_role);
drop function private.event_role_rank(event_role);
drop policy event_org_delete on event_organizers; -- referenced the role column
alter table event_organizers drop column role;
drop type event_role;

-- ---------------------------------------------------------------------------
-- 3. Privilege helpers. Policy names stay stable; their meaning is now
--    per-privilege instead of level rank.
-- ---------------------------------------------------------------------------
create or replace function private.has_event_privilege(eid uuid, priv text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select private.is_admin() or exists (
    select 1
    from event_organizers m
    join event_roles r on r.id = m.role_id
    where m.event_id = eid
      and m.user_id = auth.uid()
      and m.status = 'active'
      and case priv
        when 'view'               then r.can_view
        when 'scholarship'        then r.can_scholarship
        when 'add_registrants'    then r.can_add_registrants
        when 'manage_payments'    then r.can_manage_payments
        when 'checkin'            then r.can_checkin
        when 'update_event'       then r.can_update_event
        when 'delete_registrants' then r.can_delete_registrants
        when 'manage_team'        then r.can_manage_team
        else false
      end
  );
$$;

create or replace function private.can_view_event(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'view'); $$;

create or replace function private.can_manage_scholarships(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'scholarship'); $$;

create or replace function private.can_add_registrants(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'add_registrants'); $$;

create or replace function private.can_manage_payments(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'manage_payments'); $$;

create or replace function private.can_checkin_event(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'checkin'); $$;

create or replace function private.can_manage_event(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'update_event'); $$;

create or replace function private.can_delete_registrants(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'delete_registrants'); $$;

create or replace function private.can_manage_team(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select private.has_event_privilege(eid, 'manage_team'); $$;

grant execute on function private.has_event_privilege(uuid, text) to authenticated;
grant execute on function private.can_add_registrants(uuid) to authenticated;
grant execute on function private.can_manage_payments(uuid) to authenticated;
grant execute on function private.can_delete_registrants(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Policies.
-- ---------------------------------------------------------------------------
alter table event_roles enable row level security;
grant select, insert, update, delete on event_roles to authenticated;

-- presets and global roles are readable by any signed-in user (they populate
-- role dropdowns); event-scoped roles by that event's team.
create policy event_roles_select on event_roles for select to authenticated
  using (event_id is null or private.can_view_event(event_id));
-- global custom roles: admins; event-scoped: that event's team managers.
-- presets (preset_key set) can never be created, changed, or deleted.
create policy event_roles_insert on event_roles for insert to authenticated
  with check (
    preset_key is null
    and (
      (event_id is null and private.is_admin())
      or (event_id is not null and private.can_manage_team(event_id))
    )
  );
create policy event_roles_update on event_roles for update to authenticated
  using (
    preset_key is null
    and (
      (event_id is null and private.is_admin())
      or (event_id is not null and private.can_manage_team(event_id))
    )
  )
  with check (
    preset_key is null
    and (
      (event_id is null and private.is_admin())
      or (event_id is not null and private.can_manage_team(event_id))
    )
  );
create policy event_roles_delete on event_roles for delete to authenticated
  using (
    preset_key is null
    and (
      (event_id is null and private.is_admin())
      or (event_id is not null and private.can_manage_team(event_id))
    )
  );
-- deleting a role someone still holds fails on the event_organizers.role_id
-- foreign key — that restriction is intentional.

-- memberships: assigned roles must be usable on that event (preset/global or
-- scoped to the same event).
drop policy event_org_insert on event_organizers;
create policy event_org_insert on event_organizers for insert to authenticated
  with check (
    private.can_manage_team(event_id)
    and (
      role_id is null
      or exists (
        select 1 from event_roles r
        where r.id = role_id
          and (r.event_id is null or r.event_id = event_organizers.event_id)
      )
    )
  );
drop policy event_org_update on event_organizers;
create policy event_org_update on event_organizers for update to authenticated
  using (private.can_manage_team(event_id))
  with check (
    private.can_manage_team(event_id)
    and (
      role_id is null
      or exists (
        select 1 from event_roles r
        where r.id = role_id
          and (r.event_id is null or r.event_id = event_organizers.event_id)
      )
    )
  );
create policy event_org_delete on event_organizers for delete to authenticated
  using (
    private.can_manage_team(event_id)
    or (user_id = auth.uid() and status = 'requested')
  );

-- deleting registrants is its own privilege now (was: can_manage_event)
drop policy participants_delete on participants;
create policy participants_delete on participants for delete to authenticated
  using (private.can_delete_registrants(event_id));

-- ---------------------------------------------------------------------------
-- 5. Trigger + RPCs.
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
    (select id from event_roles where preset_key = 'full'),
    'active', new.created_by
  )
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.add_event_organizer(
  p_event_id uuid, p_email text, p_role_id uuid
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
  if not exists (
    select 1 from event_roles r
    where r.id = p_role_id and (r.event_id is null or r.event_id = p_event_id)
  ) then
    raise exception 'invalid role for this event';
  end if;
  select id into v_user from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no user with that email';
  end if;
  insert into event_organizers (event_id, user_id, role_id, status, granted_by)
  values (p_event_id, v_user, p_role_id, 'active', auth.uid())
  on conflict (event_id, user_id) do update
    set role_id = excluded.role_id, status = 'active', granted_by = excluded.granted_by;
end;
$$;
revoke execute on function public.add_event_organizer(uuid, text, uuid) from public, anon;
grant execute on function public.add_event_organizer(uuid, text, uuid) to authenticated;

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
  insert into event_organizers (event_id, user_id, status)
  values (p_event_id, auth.uid(), 'requested')
  on conflict (event_id, user_id) do nothing;
end;
$$;
