-- Exclude choice option IDs (`opt_...`) from `answers_text`.
--
-- Migration 0045 flattened every raw answer value into `answers_text`. For
-- choice questions (select/radio/multiselect) the stored value is an option ID
-- minted by the form builder as `opt_<n>_<base36 timestamp>`
-- (components/form-builder/QuestionInspector.jsx), never the label. Two
-- consequences, both measured against production: 14 of 31 live participants
-- carry such an ID, so searching "opt" returned 45% of the event; and searching
-- a label ("All days", "Red", "Assisting with room setup") returned nobody,
-- because the label exists only in the form definition.
--
-- This migration fixes the first half by dropping option IDs from the
-- searchable text. The second half — resolving a typed label back to its
-- option IDs — cannot live here: this function receives only `answers` and has
-- no way to reach the form definition that holds the labels, and a lookup
-- would make it non-immutable and so illegal in a generated column. It is
-- therefore handled in application logic (lib/participants-query.js), which
-- already has the `questions` list in hand.
--
-- Object-valued answers are deliberately KEPT. A `name`/`address`/`phone`
-- question stores an object, which stringifies to `{"first": "Samuel", ...}`;
-- 24 of 31 production participants have one, and for 3 of them it is the only
-- place their name exists (first_name is empty, because the form asks for a
-- name as a plain question). Filtering those out would re-break exactly the
-- search 0045 was written to fix. The JSON punctuation rides along in the
-- text, which is harmless — it is matched with `ilike '%term%'`.

create or replace function public.answers_search_text(a jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(string_agg(txt, ' '), '')
  from (
    select jsonb_array_elements_text(
      case
        when jsonb_typeof(v) = 'array' then v
        else jsonb_build_array(v)
      end
    ) as txt
    from jsonb_each(coalesce(a, '{}'::jsonb)) as t(k, v)
  ) sub
  where txt not like 'opt\_%' escape '\';
$$;

-- Existing rows keep the value computed by 0045's function body: Postgres
-- records a dependency on the function but does not recompute stored generated
-- columns when the body is replaced. They must be rebuilt explicitly.
--
-- Dropping and re-adding the column does that with one table rewrite. The
-- obvious alternative, `update participants set answers = answers`, also
-- recomputes, but `touch_participants` (0001) is an unqualified
-- `before update` trigger, so it would stamp updated_at on every participant
-- and make the whole event look freshly edited. ALTER TABLE fires no row
-- triggers. (`on_participant_status_change` is scoped to `update of status`
-- and would not have fired either way.)
alter table public.participants drop column if exists answers_text;

alter table public.participants
  add column answers_text text
  generated always as (public.answers_search_text(answers)) stored;

comment on column public.participants.answers_text is
  'Answer values flattened to text, for the console search. Option IDs excluded (0047). Generated — never write to it.';
