-- Remove role requests flow (making global roles invite-only)

drop function if exists public.approve_role_request(uuid, global_role);
drop function if exists public.request_global_access(text);

drop policy if exists role_requests_select on role_requests;
drop policy if exists role_requests_delete on role_requests;
drop table if exists role_requests;
