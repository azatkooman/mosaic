-- Registration for I-Go Tech Babies closed at 07:36 on the event's first
-- day (the close date was left at its creation-time default), hiding the
-- Register button mid-event. Keep registration open until the event ends.

update events
set registration_closes_at = ends_at
where id = '5360db2b-516b-4af1-9f0c-72d00bc1bf06'
  and registration_closes_at < ends_at;
