-- Distinguish forms the creator deliberately published (via the form builder)
-- from the default form auto-published at event creation. The event-publish
-- guard requires at least one CREATOR-published form, so the creation failsafe
-- (which keeps a fallback form available for edge cases) does not satisfy it.
alter table forms add column if not exists creator_published boolean not null default false;

-- Grandfather existing events: treat any already-published form as
-- creator-published so re-publishing an existing event is never blocked.
update forms set creator_published = true where current_version_id is not null;

-- publish_form_version gains p_creator_published (default true). The builder's
-- Publish button marks the form creator-published; the event-creation failsafe
-- calls it with false so the auto-published default doesn't count.
drop function if exists public.publish_form_version(uuid);
create or replace function public.publish_form_version(
  p_version_id uuid,
  p_creator_published boolean default true
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_form_id uuid;
begin
  select form_id into v_form_id from form_versions where id = p_version_id;
  if v_form_id is null or not private.can_manage_form(v_form_id) then
    raise exception 'not allowed';
  end if;
  update form_versions set published_at = now()
    where id = p_version_id and published_at is null;
  if not found then
    raise exception 'version not found or already published';
  end if;
  update forms
    set current_version_id = p_version_id,
        -- sticky: a creator publish is never undone by a later auto-publish
        creator_published = creator_published or p_creator_published
    where id = v_form_id;
end;
$$;
revoke execute on function public.publish_form_version(uuid, boolean) from public, anon;
grant execute on function public.publish_form_version(uuid, boolean) to authenticated;
