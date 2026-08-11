-- Remove private.promote_from_waitlist().
--
-- It was the waitlist-promotion trigger function from 0002, but 0020 dropped
-- the trigger that fired it (`on_participant_cancelled`) when promotion moved
-- inline into transition_participant_status, so every promotion since has come
-- from that RPC and from soft_delete_participants (0033). The function has
-- been unreachable ever since — verified: no trigger references it.
--
-- Worth deleting rather than leaving: reading the schema today, this looks
-- like the live promotion path, and planning work against it produces designs
-- for a trigger→app notification bridge that is not needed, because both real
-- promotion paths already return the promoted ids to their caller.

drop function if exists private.promote_from_waitlist();
