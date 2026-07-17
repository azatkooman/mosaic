-- Allow admins to toggle the privilege flags of the standard (preset) roles.
-- Presets still cannot be created, renamed, rescoped, or deleted — only their
-- checkboxes change. Event-scoped custom roles remain managed by that event's
-- team managers.

drop policy event_roles_update on event_roles;
create policy event_roles_update on event_roles for update to authenticated
  using (
    (event_id is null and private.is_admin())
    or (event_id is not null and preset_key is null and private.can_manage_team(event_id))
  )
  with check (
    (event_id is null and private.is_admin())
    or (event_id is not null and preset_key is null and private.can_manage_team(event_id))
  );

-- Identity of a preset is immutable even for admins.
create or replace function private.protect_preset_roles()
returns trigger
language plpgsql
as $$
begin
  if old.preset_key is not null then
    if new.preset_key is distinct from old.preset_key
       or new.name is distinct from old.name
       or new.event_id is distinct from old.event_id then
      raise exception 'standard roles cannot be renamed or rescoped';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_preset_roles
  before update on event_roles
  for each row execute function private.protect_preset_roles();
