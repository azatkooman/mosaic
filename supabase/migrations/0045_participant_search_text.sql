-- Make the participants search find people by the name they registered under.
--
-- The console search covered first_name / last_name / email / profile_name /
-- profile_email only. But there are no fixed name columns in this product: a
-- name is an ordinary form question, and participants.first_name is populated
-- only when the form uses a `name`-type question (extractIdentity). A form that
-- asks "Full name" as a plain text question leaves all three identity columns
-- empty and keeps every identifying string in `answers`.
--
-- On such an event the search was both incomplete and wrong. Searching
-- "Stephen" on the staging test event missed the participants actually named
-- "Stephen 1" and "Stephen 2" (their names live in answers), while matching an
-- unrelated participant whose ACCOUNT HOLDER is Stephen Chang — profile_name is
-- who registered them, not who they are.
--
-- A stored generated column of the answer VALUES lets the existing PostgREST
-- .or() filter reach them. Values only, never keys: `answers::text` would carry
-- question ids like `q_name_ms2p…`, so searching "name" would match every row.
-- Nested values (name/address/phone objects) stringify to JSON, which still
-- contains the substrings being searched for.
--
-- No new visibility: RLS governs the row, and anyone who can read the row can
-- already read `answers` itself.

create or replace function public.answers_search_text(a jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(string_agg(value, ' '), '')
  from jsonb_each_text(coalesce(a, '{}'::jsonb))
$$;

alter table participants
  add column if not exists answers_text text
  generated always as (public.answers_search_text(answers)) stored;

comment on column participants.answers_text is
  'Answer values flattened to text, for the console search. Generated — never write to it.';

-- Deliberately no trigram index: `ilike '%x%'` cannot use a btree, and the
-- query is already narrowed by event_id + form_version_id, which are indexed.
-- Revisit with pg_trgm if an event ever grows large enough to feel it.
