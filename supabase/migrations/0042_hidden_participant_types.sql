-- Hidden participant types.
--
-- Organizers run types the public list should not advertise — staff, VIPs,
-- volunteers — and hand out a direct link instead (see the ?type= deep link
-- added alongside this migration).
--
-- Deliberately NOT enforced in submit_registration, and that is the whole
-- design decision: hidden-ness is a DISCOVERY rule, not an authorization one.
-- The deep link is an unauthenticated, guessable URL, so rejecting hidden
-- types in the RPC would break the only way to use the feature while stopping
-- nobody who could already register. A check that neither blocks an attacker
-- nor permits a legitimate user is worse than no check: it looks like a
-- security boundary and isn't one.
--
-- If invite-only is ever actually wanted, that is a different feature — a
-- per-type invite token or an allowlist — and it should be built as one.

alter table participant_types
  add column if not exists hidden boolean not null default false;

comment on column participant_types.hidden is
  'Omit from the public registration form; still registerable via its ?type= link. Discovery only — not an authorization boundary.';
