-- Let each user store a preferred display timezone. Null (the default)
-- means "show each event in its own local timezone" — the prior behaviour.
alter table profiles add column if not exists preferred_timezone text;
