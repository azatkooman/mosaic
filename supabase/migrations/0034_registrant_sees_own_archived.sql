-- Let a registrant see their OWN archived participants.
--
-- 0033 hid archived participants from everyone but admins. That included the
-- registrant who owns the row, so an organizer archiving a participant made it
-- simply vanish from the registrant's "My registrations" page — and when every
-- participant of a registration was archived, the card was left showing only
-- the event name with no rows and no explanation.
--
-- The fix is to lift the registrant's own-rows branch out of the archived
-- gate: they see their participants whether live or archived, so the page can
-- render a "Participant Deleted" placeholder instead of a hole. Organizers and
-- viewers still see live rows only (admins still see archived), and the console
-- list/export/counts already filter `deleted_at is null` explicitly, so an
-- organizer who is also a registrant for their own event does not start seeing
-- archived rows in the console.
--
-- Column data is not exposed to anyone new: the row already belonged to this
-- registrant, who submitted it. Only its continued visibility changes.
drop policy if exists participants_select on participants;
create policy participants_select on participants for select to authenticated
  using (
    (
      (deleted_at is null or private.is_admin())
      and private.can_view_event(event_id)
    )
    or exists (
      select 1 from registrations r
      where r.id = registration_id and r.registered_by = auth.uid()
    )
  );
