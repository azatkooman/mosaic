-- Organizer access requests: a signed-in user with no global role can ask
-- for one; admins approve (grant organizer/admin) or deny from the admin
-- console. One pending request per user.

create table role_requests (
  user_id uuid primary key references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id),
  message text not null default '' check (char_length(message) <= 500),
  created_at timestamptz not null default now()
);

alter table role_requests enable row level security;

-- Users see and cancel their own request; admins see and remove (deny) any.
-- Inserts happen only through request_global_access below.
create policy role_requests_select on role_requests for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
create policy role_requests_delete on role_requests for delete to authenticated
  using (user_id = auth.uid() or private.is_admin());

grant select, delete on role_requests to authenticated;

-- Ask for organizer access. No-op if a request is already pending.
create or replace function public.request_global_access(p_message text default '')
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from user_roles where user_id = auth.uid()) then
    raise exception 'you already have a global role';
  end if;
  select org_id into v_org from profiles where id = auth.uid();
  if v_org is null then
    select id into v_org from organizations order by created_at limit 1;
  end if;
  insert into role_requests (user_id, org_id, message)
  values (auth.uid(), v_org, coalesce(left(trim(p_message), 500), ''))
  on conflict (user_id) do nothing;
end;
$$;
revoke execute on function public.request_global_access(text) from public, anon;
grant execute on function public.request_global_access(text) to authenticated;

-- Approve a pending request at the given role, atomically removing it.
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
