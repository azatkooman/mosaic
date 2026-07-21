-- Remove role requests flow (making global roles invite-only)

drop function if exists public.approve_role_request(uuid, global_role);
drop function if exists public.request_global_access(text);

-- Policies vanish with the table; dropping them explicitly would error when
-- the table is already gone ("drop policy if exists" still requires the
-- relation to exist).
drop table if exists role_requests cascade;
