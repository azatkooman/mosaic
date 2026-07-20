-- Open event creation + global organizers.
--
-- 1. Any signed-in user can create events; the creator trigger already
--    grants them the Full role on their own event.
-- 2. The global 'organizer' role now means: Full-equivalent access to EVERY
--    event (view, manage, team, check-in, …) without being on its team.
--    Requested via the existing role_requests flow, granted by admins.
--    Admin-only powers are unchanged: the admin console, global role
--    management, global custom roles, and deleting events.

drop policy events_insert on events;
create policy events_insert on events for insert to authenticated
  with check (created_by = auth.uid());

-- Event privileges short-circuit for super_admin, admin, AND organizer.
-- (events_delete, event_roles global management, user_roles etc. still gate
-- on private.is_admin(), which excludes organizers.)
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
