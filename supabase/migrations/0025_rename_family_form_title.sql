-- "Family response form" was renamed to "Group response form" in the UI.
-- The registration_mode value stays 'family' (internal); only the stored
-- display title changes. Rename existing group-mode forms that still carry
-- the old auto-generated title (custom titles are left untouched).
update forms
set title = 'Group response form'
where title = 'Family response form'
  and registration_mode = 'family';
