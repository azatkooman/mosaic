-- The auto-created registration form is now called "Default form" — it's the
-- fallback used when no single/family response form applies. Rename existing
-- rows that still carry the old auto-generated title (mode-scoped forms and
-- custom titles are untouched).
update forms
set title = 'Default form'
where title = 'Registration form'
  and registration_mode is null;
