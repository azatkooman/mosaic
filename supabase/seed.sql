-- Local development seed. Never run against production.

-- Migration 0003 may already have created the org (with a random id), so
-- resolve it by slug everywhere below instead of assuming a fixed uuid.
insert into organizations (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'cru', 'Cru')
on conflict (slug) do nothing;

-- Dev users (local only): admin@example.com / password123, user@example.com / password123
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Dev Admin"}',
   now(), now(), '', '', '', ''),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'user@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Dev Registrant"}',
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","email_verified":true}',
   'email', now(), now(), now()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   '{"sub":"10000000-0000-0000-0000-000000000002","email":"user@example.com","email_verified":true}',
   'email', now(), now(), now())
on conflict do nothing;

insert into user_roles (user_id, org_id, role)
select '10000000-0000-0000-0000-000000000001', id, 'super_admin'
from organizations where slug = 'cru'
on conflict do nothing;

-- Sample event
insert into events (
  id, org_id, slug, status, name, description, location, timezone,
  starts_at, ends_at, registration_opens_at, registration_closes_at,
  capacity, default_locale, supported_locales, created_by
) values (
  '20000000-0000-0000-0000-000000000001',
  (select id from organizations where slug = 'cru'),
  'summer-conference-2026',
  'published',
  '{"en":"Summer Conference 2026","es":"Conferencia de Verano 2026","fr":"Conférence d''été 2026","ru":"Летняя конференция 2026","uk":"Літня конференція 2026"}',
  '{"en":"Five days of teaching, worship and community at Lake Hart.","es":"Cinco días de enseñanza, adoración y comunidad en Lake Hart."}',
  '{"en":"Lake Hart, Orlando, FL"}',
  'America/New_York',
  now() + interval '60 days',
  now() + interval '65 days',
  now() - interval '1 day',
  now() + interval '50 days',
  null,
  'en',
  '{en,es,fr,ru,uk}',
  '10000000-0000-0000-0000-000000000001'
) on conflict (slug) do nothing;

insert into forms (id, event_id, title)
values ('30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'Main registration form')
on conflict (id) do nothing;

insert into form_versions (id, form_id, version, published_at, created_by, definition)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  1,
  now(),
  '10000000-0000-0000-0000-000000000001',
  '{
    "questions": [
      { "id": "q_about", "type": "section",
        "label": {"en": "About you", "es": "Sobre ti"},
        "participantTypes": ["staff", "student", "child"] },
      { "id": "q_phone", "type": "phone", "required": true,
        "label": {"en": "Phone number", "es": "Número de teléfono"},
        "participantTypes": ["staff", "student"] },
      { "id": "q_ministry", "type": "select", "required": true,
        "label": {"en": "Which ministry are you part of?", "es": "¿De qué ministerio formas parte?"},
        "options": [
          {"value": "campus", "label": {"en": "Campus Ministry", "es": "Ministerio Universitario"}},
          {"value": "city", "label": {"en": "City Ministry", "es": "Ministerio de Ciudad"}},
          {"value": "other", "label": {"en": "Other", "es": "Otro"}}
        ],
        "participantTypes": ["staff"] },
      { "id": "q_ministry_other", "type": "text",
        "label": {"en": "Please specify your ministry", "es": "Especifica tu ministerio"},
        "participantTypes": ["staff"],
        "visibleIf": {"op": "and", "rules": [
          {"questionId": "q_ministry", "operator": "eq", "value": "other"}
        ]} },
      { "id": "q_diet", "type": "multiselect",
        "label": {"en": "Dietary needs", "es": "Necesidades dietéticas"},
        "options": [
          {"value": "vegetarian", "label": {"en": "Vegetarian", "es": "Vegetariano"}},
          {"value": "gluten_free", "label": {"en": "Gluten free", "es": "Sin gluten"}},
          {"value": "nut_allergy", "label": {"en": "Nut allergy", "es": "Alergia a los frutos secos"}}
        ],
        "participantTypes": ["staff", "student", "child"] },
      { "id": "q_birthdate", "type": "date", "required": true,
        "label": {"en": "Date of birth", "es": "Fecha de nacimiento"},
        "participantTypes": ["child"] },
      { "id": "q_notes", "type": "textarea",
        "label": {"en": "Anything else we should know?", "es": "¿Algo más que debamos saber?"},
        "validation": {"maxLength": 500},
        "participantTypes": ["staff", "student", "child"] }
    ]
  }'
) on conflict (id) do nothing;

update forms set current_version_id = '40000000-0000-0000-0000-000000000001'
where id = '30000000-0000-0000-0000-000000000001';

insert into participant_types (event_id, key, name, capacity, min_per_registration, max_per_registration, form_id, sort_order)
values
  ('20000000-0000-0000-0000-000000000001', 'staff',
   '{"en":"Cru Staff","es":"Personal de Cru","fr":"Personnel de Cru","ru":"Сотрудник Cru","uk":"Співробітник Cru"}',
   100, 0, 2, '30000000-0000-0000-0000-000000000001', 0),
  ('20000000-0000-0000-0000-000000000001', 'student',
   '{"en":"Student","es":"Estudiante","fr":"Étudiant","ru":"Студент","uk":"Студент"}',
   300, 0, 2, '30000000-0000-0000-0000-000000000001', 1),
  ('20000000-0000-0000-0000-000000000001', 'child',
   '{"en":"Child","es":"Niño/a","fr":"Enfant","ru":"Ребёнок","uk":"Дитина"}',
   50, 0, 8, '30000000-0000-0000-0000-000000000001', 2)
on conflict (event_id, key) do nothing;
