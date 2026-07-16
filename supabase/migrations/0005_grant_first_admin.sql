-- Bootstrap admin access for the site owner after their first sign-in.
insert into user_roles (user_id, org_id, role)
select u.id, o.id, 'admin'
from auth.users u,
     (select id from organizations order by created_at limit 1) o
where lower(u.email) = lower('obadiahmendy370@gmail.com')
on conflict (user_id, org_id) do update set role = excluded.role;
