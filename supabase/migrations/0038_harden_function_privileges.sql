-- Hardening pass from the Supabase security advisor.
--
-- invite_global_role checks private.is_admin() internally, so anonymous calls
-- already fail — but 0026 never revoked the default PUBLIC execute grant the
-- way 0003 did for grant_global_role, so `anon` could still reach the function
-- body. Close that gap for defense in depth.
revoke execute on function public.invite_global_role(text, public.global_role) from public, anon;

-- Three private trigger functions were created without a pinned search_path
-- (every other private.* function sets one). A SECURITY DEFINER function with
-- a mutable search_path can be redirected to attacker-created objects in
-- schemas earlier on the caller's path; pin them like the rest.
alter function private.protect_preset_roles() set search_path = public;
alter function private.stamp_first_published() set search_path = public;
alter function private.touch_updated_at() set search_path = public;
