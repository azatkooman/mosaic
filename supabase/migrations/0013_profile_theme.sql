-- Per-user colour theme preference. 'system' follows the device setting
-- (the existing prefers-color-scheme behaviour); 'light'/'dark' force one.
alter table profiles
  add column if not exists theme text not null default 'system'
  check (theme in ('system', 'light', 'dark'));
