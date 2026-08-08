-- Performance pass from the Supabase performance advisor. Three families of
-- fixes; none changes who can see or do anything.
--
-- 1. RLS initplan: a bare auth.uid() (or other no-arg stable function) in a
--    policy is re-evaluated for every candidate row. Wrapping it in a scalar
--    subselect makes the planner evaluate it once per query (an InitPlan).
--    Same for no-arg private.is_admin(); the per-row private.can_*(event_id)
--    calls can't be hoisted because they depend on the row.

alter policy profiles_update on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy user_roles_select on public.user_roles
  using (user_id = (select auth.uid()) or (select private.is_admin()));

alter policy event_org_select on public.event_organizers
  using (private.can_view_event(event_id) or user_id = (select auth.uid()));

alter policy event_org_delete on public.event_organizers
  using (
    private.can_manage_team(event_id)
    or (user_id = (select auth.uid()) and status = 'requested')
  );

alter policy events_insert on public.events
  with check (created_by = (select auth.uid()));

alter policy registrations_select on public.registrations
  using (registered_by = (select auth.uid()) or private.can_view_event(event_id));

alter policy participants_select on public.participants
  using (
    ((deleted_at is null or (select private.is_admin())) and private.can_view_event(event_id))
    or exists (
      select 1 from registrations r
      where r.id = participants.registration_id
        and r.registered_by = (select auth.uid())
    )
  );

-- 2. Multiple permissive policies for the same role+action are each evaluated
--    on every row. Merge profiles' two SELECT policies into one, and split
--    ui_translations' FOR ALL write policy into the three write commands so it
--    no longer overlaps the public SELECT policy.

drop policy profiles_select_team on public.profiles;
alter policy profiles_select on public.profiles
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    -- Organizers see the profiles of their events' team members (was
    -- profiles_select_team).
    or exists (
      select 1 from event_organizers eo
      where eo.user_id = profiles.id and private.can_view_event(eo.event_id)
    )
  );

drop policy ui_translations_write on public.ui_translations;
create policy ui_translations_insert on public.ui_translations
  for insert to authenticated with check ((select private.is_admin()));
create policy ui_translations_update on public.ui_translations
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy ui_translations_delete on public.ui_translations
  for delete to authenticated using ((select private.is_admin()));

-- 3. Foreign keys without a covering index make the referenced side's
--    UPDATE/DELETE scan the referencing table, and slow FK-side joins.

create index if not exists event_organizers_user_id on public.event_organizers (user_id);
create index if not exists event_organizers_role_id on public.event_organizers (role_id);
create index if not exists event_organizers_granted_by on public.event_organizers (granted_by);
create index if not exists event_roles_created_by on public.event_roles (created_by);
create index if not exists event_roles_org_id on public.event_roles (org_id);
create index if not exists event_roles_event_id on public.event_roles (event_id);
create index if not exists events_created_by on public.events (created_by);
create index if not exists events_org_id on public.events (org_id);
create index if not exists form_versions_created_by on public.form_versions (created_by);
create index if not exists forms_current_version_id on public.forms (current_version_id);
create index if not exists participant_status_history_participant_id on public.participant_status_history (participant_id);
create index if not exists participant_status_history_changed_by on public.participant_status_history (changed_by);
create index if not exists participant_types_form_id on public.participant_types (form_id);
create index if not exists participants_form_version_id on public.participants (form_version_id);
create index if not exists participants_deleted_by on public.participants (deleted_by);
create index if not exists pending_role_invites_org_id on public.pending_role_invites (org_id);
create index if not exists pending_role_invites_invited_by on public.pending_role_invites (invited_by);
create index if not exists profiles_org_id on public.profiles (org_id);
create index if not exists ui_translations_updated_by on public.ui_translations (updated_by);
create index if not exists user_roles_org_id on public.user_roles (org_id);
