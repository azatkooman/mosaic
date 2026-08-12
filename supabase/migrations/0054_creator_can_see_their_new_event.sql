-- An event's creator can always see it.
--
-- 0052 opened events_insert to any signed-in user, and that was necessary but
-- not sufficient: creating an event still failed for anyone without a global
-- role, with the same 42501. The insert was never the step that refused.
--
-- The console creates an event with
--
--   .insert({ … }).select('id').single()
--
-- which is INSERT … RETURNING, and RLS applies SELECT policies to a RETURNING
-- clause. A new event is status='draft', so events_select_public (0018) falls
-- through to private.can_view_event(id) → has_event_privilege(id,'view') →
--
--   private.is_global_organizer() or exists (… event_organizers …)
--
-- The creator's membership row is written by the on_event_created AFTER INSERT
-- trigger, so it does exist by then. But has_event_privilege is STABLE, which
-- means it sees the snapshot taken at the start of the statement — and the row
-- the statement's own trigger just inserted is not in it. So the EXISTS finds
-- nothing and the row is invisible to its own RETURNING.
--
-- That is the whole reason only privileged accounts have ever created an event
-- here: is_global_organizer() short-circuits before the membership lookup, so
-- an admin, a super admin or a global organizer never depended on the row that
-- cannot be seen yet. Everybody else did, and could not.
--
-- Fixed by stating the thing that was only ever true implicitly: whoever
-- created an event can see it. That holds from the instant the row exists,
-- needs no membership and no snapshot that has not happened yet, and it is
-- checked before the function call so the common case costs a column
-- comparison rather than a subquery.
--
-- Archived events are deliberately left alone: they stay admin-only, as 0018
-- made them, which is why the outer clause is unchanged.

drop policy if exists events_select_public on events;

create policy events_select_public on events for select to anon, authenticated
  using (
    (deleted_at is null or private.is_admin())
    and (
      status = 'published'
      or created_by = (select auth.uid())
      or private.can_view_event(id)
    )
  );
