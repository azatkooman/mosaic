-- Populate and publish the I-Go Tech Babies registration form.
-- The form was created empty and never published, so the register page
-- rendered no questions. Guarded so it never overwrites a form that has
-- since been edited or published.

update form_versions
set definition = '{
  "questions": [
    { "id": "q_phone", "type": "phone", "required": true,
      "label": {
        "en": "Phone number",
        "es": "Número de teléfono",
        "fr": "Numéro de téléphone",
        "ru": "Номер телефона",
        "uk": "Номер телефону"
      } },
    { "id": "q_diet", "type": "multiselect",
      "label": {
        "en": "Dietary needs",
        "es": "Necesidades dietéticas",
        "fr": "Besoins alimentaires",
        "ru": "Особенности питания",
        "uk": "Особливості харчування"
      },
      "options": [
        {"value": "vegetarian", "label": {"en": "Vegetarian", "es": "Vegetariano", "fr": "Végétarien", "ru": "Вегетарианское", "uk": "Вегетаріанське"}},
        {"value": "gluten_free", "label": {"en": "Gluten free", "es": "Sin gluten", "fr": "Sans gluten", "ru": "Без глютена", "uk": "Без глютену"}},
        {"value": "nut_allergy", "label": {"en": "Nut allergy", "es": "Alergia a los frutos secos", "fr": "Allergie aux noix", "ru": "Аллергия на орехи", "uk": "Алергія на горіхи"}}
      ] },
    { "id": "q_notes", "type": "textarea",
      "label": {
        "en": "Anything else we should know?",
        "es": "¿Algo más que debamos saber?",
        "fr": "Autre chose à nous signaler ?",
        "ru": "Что-то ещё, что нам нужно знать?",
        "uk": "Щось іще, що нам слід знати?"
      },
      "validation": {"maxLength": 500} }
  ]
}'::jsonb,
    published_at = now()
where id = '28370f9c-9066-4845-80b5-416586211f10'
  and published_at is null
  and definition = '{"questions": []}'::jsonb;

update forms
set current_version_id = '28370f9c-9066-4845-80b5-416586211f10'
where id = '0ca5c625-8954-4049-a712-de10cb31d61c'
  and current_version_id is null
  and exists (
    select 1 from form_versions
    where id = '28370f9c-9066-4845-80b5-416586211f10'
      and published_at is not null
  );

-- The participant type's English name was saved as an empty string, which
-- renders blank on the register page for English visitors.
update participant_types
set name = jsonb_set(name, '{en}', '"Participant"')
where id in (
  select id from participant_types
  where event_id = '5360db2b-516b-4af1-9f0c-72d00bc1bf06'
    and coalesce(name->>'en', '') = ''
);
