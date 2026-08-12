-- Any signed-in user may create an event.
--
-- 0002 gated events_insert on `private.is_global_organizer() and created_by =
-- auth.uid()`. 0011 dropped that policy and recreated it without the gate —
-- "Open event creation" is its title — and 0039 rewrote the same check once
-- more, wrapping auth.uid() in a subselect for performance. Three migrations,
-- all saying anyone signed in may create an event.
--
-- Production behaves as though none of them happened. Every one of its ten
-- events was created by an admin or a super_admin and not one by an ordinary
-- account, which is exactly 0002's rule; an unprivileged user attempting it
-- gets 42501 and the console's "Your account does not have permission to
-- create events. Ask an administrator to grant you organizer access."
--
-- Ruled out as causes: table grants (they are per-ROLE, and an admin is
-- `authenticated` like everyone else, so a missing INSERT grant would stop
-- admins too); the creator trigger (preset_key is unique, the one 'full' row
-- exists, and all ten events do have their creator's membership row); and
-- organizations being unreadable (org_select is `using (true)`, and that path
-- reports a different error anyway).
--
-- What remains is that the live policy is not what this repository says it is —
-- migration history stamped without executing, or an edit made in the
-- dashboard. Rather than keep guessing which, state the rule again from
-- scratch: corrective if the live policy still carries 0002's gate, and a
-- no-op if it does not.
--
-- `drop policy if exists` rather than `drop policy`, so this applies to a
-- database where the policy is missing entirely as readily as to one where it
-- is merely wrong.

drop policy if exists events_insert on public.events;

create policy events_insert on public.events for insert to authenticated
  with check (created_by = (select auth.uid()));
