-- Pending global-role invites.
--
-- Admins can invite someone by email who has never signed in yet. Instead of
-- failing (as grant_global_role does), the invite is parked in
-- pending_role_invites and applied automatically the first time that email
-- signs in (see the amended handle_new_user trigger at the bottom).
--
-- Existing users are still granted immediately; only unknown emails queue.

create table pending_role_invites (
  email       text primary key,
  role        global_role not null,
  org_id      uuid references organizations(id) on delete set null,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint pending_role_invites_not_super_admin check (role <> 'super_admin')
);

alter table pending_role_invites enable row level security;

-- Admins may view / cancel pending invites; writes otherwise happen through
-- the security-definer functions below.
create policy pending_role_invites_admin_all on pending_role_invites
  for all using (private.is_admin()) with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- Invite-or-grant by email. Returns 'granted' when the person already has an
-- account (role applied now) or 'invited' when the invite was queued.
-- ---------------------------------------------------------------------------
create or replace function public.invite_global_role(p_email text, p_role global_role)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_user  uuid;
  v_org   uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_role = 'super_admin' then
    raise exception 'super admin can only be assigned via transfer_super_admin';
  end if;
  if v_email = '' then
    raise exception 'email required';
  end if;

  select id, org_id into v_user, v_org from profiles where lower(email) = v_email;

  if v_user is not null then
    -- Existing user — grant now (mirrors grant_global_role's guards).
    if exists (select 1 from user_roles where user_id = v_user and role = 'super_admin') then
      raise exception 'the super admin''s role cannot be changed';
    end if;
    if v_org is null then
      select id into v_org from organizations order by created_at limit 1;
    end if;
    insert into user_roles (user_id, org_id, role)
    values (v_user, v_org, p_role)
    on conflict (user_id, org_id) do update set role = excluded.role;
    return 'granted';
  end if;

  -- Unknown email — queue the invite for first sign-in.
  insert into pending_role_invites (email, role, org_id, invited_by)
  values (
    v_email,
    p_role,
    (select id from organizations order by created_at limit 1),
    auth.uid()
  )
  on conflict (email) do update
    set role = excluded.role,
        invited_by = excluded.invited_by,
        created_at = now();
  return 'invited';
end;
$$;

grant execute on function public.invite_global_role(text, global_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Amend the new-user trigger to consume any pending invite for the email.
-- Identical to 0001 plus the pending-invite application at the end.
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

  return new;
end;
$$;
