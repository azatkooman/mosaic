-- Migration: Update Pokémon Conference registration form
-- Organizes fields into sections: Personal Data, Registration Info, Activities, Special Needs, Terms, and Communication.

DO $$
DECLARE
  v_event_id uuid;
  v_form_id uuid;
  v_new_version_id uuid;
  v_new_version_num integer;
  v_questions jsonb := '[
    {
      "id": "sec_personal",
      "type": "section",
      "required": false,
      "label": {
        "en": "1. Personal Data",
        "es": "1. Dados Pessoais",
        "fr": "1. Données Personnelles",
        "ru": "1. Личные данные",
        "uk": "1. Особисті дані"
      }
    },
    {
      "id": "q_name",
      "type": "name",
      "required": true,
      "nameFormat": "first_last",
      "label": {
        "en": "Full Name",
        "es": "Nome Completo",
        "fr": "Nom complet",
        "ru": "Полное имя",
        "uk": "Повне ім’я"
      }
    },
    {
      "id": "q_birthdate",
      "type": "date",
      "required": true,
      "label": {
        "en": "Date of Birth",
        "es": "Data de Nascimento",
        "fr": "Date de naissance",
        "ru": "Дата рождения",
        "uk": "Дата народження"
      }
    },
    {
      "id": "q_email",
      "type": "email",
      "required": true,
      "label": {
        "en": "Email Address",
        "es": "E-mail",
        "fr": "Adresse e-mail",
        "ru": "Эл. почта",
        "uk": "Ел. пошта"
      }
    },
    {
      "id": "q_phone",
      "type": "phone",
      "required": true,
      "label": {
        "en": "Phone Number",
        "es": "Telefone",
        "fr": "Numéro de téléphone",
        "ru": "Номер телефона",
        "uk": "Номер телефону"
      }
    },
    {
      "id": "q_location",
      "type": "text",
      "required": true,
      "label": {
        "en": "City / State",
        "es": "Cidade / Estado",
        "fr": "Ville / État",
        "ru": "Город / Область",
        "uk": "Місто / Область"
      }
    },
    {
      "id": "sec_registration",
      "type": "section",
      "required": false,
      "label": {
        "en": "2. Registration Info",
        "es": "2. Informações da Inscrição",
        "fr": "2. Informations d’inscription",
        "ru": "2. Информация о регистрации",
        "uk": "2. Інформація про реєстрацію"
      }
    },
    {
      "id": "q_ticket_type",
      "type": "select",
      "required": true,
      "label": {
        "en": "Ticket Type",
        "es": "Tipo de Ingresso",
        "fr": "Type de billet",
        "ru": "Тип билета",
        "uk": "Тип квитка"
      },
      "options": [
        { "value": "general", "label": { "en": "General Admission", "es": "Ingresso Geral", "fr": "Entrée générale", "ru": "Общий билет", "uk": "Загальний квиток" } },
        { "value": "vgc", "label": { "en": "VGC Competitor (Video Game)", "es": "Competidor VGC", "fr": "Compétiteur VGC", "ru": "Участник VGC", "uk": "Учасник VGC" } },
        { "value": "tcg", "label": { "en": "TCG Competitor (Trading Card Game)", "es": "Competidor TCG", "fr": "Compétiteur TCG", "ru": "Участник TCG", "uk": "Учасник TCG" } },
        { "value": "press", "label": { "en": "Press / Media", "es": "Imprensa / Mídia", "fr": "Presse / Média", "ru": "Пресса", "uk": "Преса" } },
        { "value": "vip", "label": { "en": "VIP Guest", "es": "Convidado VIP", "fr": "Invité VIP", "ru": "VIP-гость", "uk": "VIP-гість" } }
      ]
    },
    {
      "id": "q_companions",
      "type": "number",
      "required": false,
      "label": {
        "en": "Number of Companions",
        "es": "Quantidade de Acompanhantes",
        "fr": "Nombre d’accompagnateurs",
        "ru": "Количество сопровождающих",
        "uk": "Кількість супроводжуючих"
      }
    },
    {
      "id": "q_referral",
      "type": "select",
      "required": false,
      "label": {
        "en": "How did you hear about the event?",
        "es": "Como ficou sabendo do evento?",
        "fr": "Comment avez-vous connu l’événement ?",
        "ru": "Как вы узнали о мероприятии?",
        "uk": "Як ви дізналися про захід?"
      },
      "options": [
        { "value": "social", "label": { "en": "Social Media", "es": "Redes Sociais", "fr": "Réseaux sociaux", "ru": "Социальные сети", "uk": "Соціальні мережі" } },
        { "value": "referral", "label": { "en": "Friend / Referral", "es": "Indicação de amigo", "fr": "Recommandation", "ru": "Рекомендация друга", "uk": "Рекомендація друга" } },
        { "value": "email", "label": { "en": "Email / Newsletter", "es": "E-mail / Newsletter", "fr": "E-mail / Newsletter", "ru": "Эл. почта / Рассылка", "uk": "Ел. пошта / Розсилка" } },
        { "value": "search", "label": { "en": "Search Engine", "es": "Pesquisa na Internet", "fr": "Recherche Google", "ru": "Поиск в интернете", "uk": "Пошук в інтернеті" } },
        { "value": "other", "label": { "en": "Other", "es": "Outros", "fr": "Autre", "ru": "Другое", "uk": "Інше" } }
      ]
    },
    {
      "id": "sec_activities",
      "type": "section",
      "required": false,
      "label": {
        "en": "3. Activities",
        "es": "3. Participação em Atividades",
        "fr": "3. Activités",
        "ru": "3. Участие в мероприятиях",
        "uk": "3. Участь у заходах"
      }
    },
    {
      "id": "q_tournaments",
      "type": "radio",
      "required": true,
      "label": {
        "en": "Would you like to participate in tournaments?",
        "es": "Deseja participar de torneios?",
        "fr": "Souhaitez-vous participer aux tournois ?",
        "ru": "Хотите ли вы участвовать в турнирах?",
        "uk": "Бажаєте взяти участь у турнірах?"
      },
      "options": [
        { "value": "yes_vgc", "label": { "en": "Yes, VGC Tournament", "es": "Sim, Torneio VGC", "fr": "Oui, tournoi VGC", "ru": "Да, турнир VGC", "uk": "Так, турнір VGC" } },
        { "value": "yes_tcg", "label": { "en": "Yes, TCG Tournament", "es": "Sim, Torneio TCG", "fr": "Oui, tournoi TCG", "ru": "Да, турнир TCG", "uk": "Так, турнір TCG" } },
        { "value": "yes_both", "label": { "en": "Yes, both", "es": "Sim, ambos", "fr": "Oui, les deux", "ru": "Да, оба", "uk": "Так, обидва" } },
        { "value": "no", "label": { "en": "No interest in tournaments", "es": "Não tenho interesse em torneios", "fr": "Non, pas d’intérêt", "ru": "Нет, турниры не интересуют", "uk": "Ні, турніри не цікавлять" } }
      ]
    },
    {
      "id": "q_interests",
      "type": "multiselect",
      "required": false,
      "label": {
        "en": "Which panels/sessions are you interested in?",
        "es": "Tem interesse em painéis/palestras específicas?",
        "fr": "Quelles sessions vous intéressent ?",
        "ru": "Какие доклады/сессии вас интересуют?",
        "uk": "Які доповіді/сесії вас цікавлять?"
      },
      "options": [
        { "value": "opening", "label": { "en": "Opening Keynote with Game Freak", "es": "Palestra de Abertura com a Game Freak", "fr": "Conférence d’ouverture Game Freak", "ru": "Открытие с Game Freak", "uk": "Відкриття з Game Freak" } },
        { "value": "vgc_strat", "label": { "en": "Competitive VGC Strategy Panel", "es": "Painel sobre Estratégias de VGC Competitivo", "fr": "Stratégie VGC compétitive", "ru": "Стратегии соревнований VGC", "uk": "Стратегії змагань VGC" } },
        { "value": "tcg_deck", "label": { "en": "TCG Deck Building Workshop", "es": "Workshop de Deck Building do TCG", "fr": "Atelier construction de deck TCG", "ru": "Создание колод TCG", "uk": "Створення колод TCG" } },
        { "value": "eco_science", "label": { "en": "Eco-Conservation & Pokémon Science", "es": "Eco-Conservation & Pokémon Science Workshop", "fr": "Eco-conservation & Science Pokémon", "ru": "Экология и наука покемонов", "uk": "Екологія та наука покемонів" } },
        { "value": "gala", "label": { "en": "Farewell Gala & Concert", "es": "Farewell Gala & Concert", "fr": "Gala d’adieu & concert", "ru": "Прощальный гала-концерт", "uk": "Прощальний гала-концерт" } }
      ]
    },
    {
      "id": "sec_special",
      "type": "section",
      "required": false,
      "label": {
        "en": "4. Special Needs",
        "es": "4. Necessidades Especiais",
        "fr": "4. Besoins spécifiques",
        "ru": "4. Особые потребности",
        "uk": "4. Особливі потреби"
      }
    },
    {
      "id": "q_dietary",
      "type": "textarea",
      "required": false,
      "label": {
        "en": "Any dietary restrictions or allergies?",
        "es": "Possui alguma restrição alimentar ou alergia?",
        "fr": "Allergies ou restrictions alimentaires ?",
        "ru": "Аллергия или пищевые ограничения?",
        "uk": "Алергія чи харчові обмеження?"
      }
    },
    {
      "id": "q_accessibility",
      "type": "text",
      "required": false,
      "label": {
        "en": "Do you require accessibility accommodations?",
        "es": "Necessita de acessibilidade (cadeirante, intérprete de Libras, etc.)?",
        "fr": "Besoins d’accessibilité ?",
        "ru": "Требуются ли особые условия доступности?",
        "uk": "Чи потрібні особливі умови доступності?"
      }
    },
    {
      "id": "sec_terms",
      "type": "section",
      "required": false,
      "label": {
        "en": "5. Terms & Authorizations",
        "es": "5. Termos e Autorizações",
        "fr": "5. Conditions & autorisations",
        "ru": "5. Согласия и условия",
        "uk": "5. Згоди та умови"
      }
    },
    {
      "id": "q_accept_terms",
      "type": "checkbox",
      "required": true,
      "label": {
        "en": "I accept the terms of use and event regulations.",
        "es": "Aceito os termos de uso e regulamento do evento.",
        "fr": "J’accepte les conditions d’utilisation.",
        "ru": "Я принимаю условия использования и правила.",
        "uk": "Я приймаю умови використання та правила."
      }
    },
    {
      "id": "q_image_release",
      "type": "checkbox",
      "required": true,
      "label": {
        "en": "I authorize the use of my image (photos/videos during the event).",
        "es": "Autorizo o uso de minha imagem (fotos/vídeos durante o evento).",
        "fr": "J’autorise l’utilisation de mon image.",
        "ru": "Я разрешаю использование моей фотографии/видео.",
        "uk": "Я дозволяю використання моєї фотографії/відео."
      }
    },
    {
      "id": "q_guardian_auth",
      "type": "checkbox",
      "required": false,
      "label": {
        "en": "Legal guardian authorization (if participant is a minor).",
        "es": "Autorização do responsável legal (caso o participante seja menor de idade).",
        "fr": "Autorisation parentale (si mineur).",
        "ru": "Согласие законного представителя (для несовершеннолетних).",
        "uk": "Згода законного представника (для неповнолітніх)."
      }
    },
    {
      "id": "sec_communication",
      "type": "section",
      "required": false,
      "label": {
        "en": "6. Communication",
        "es": "6. Comunicação",
        "fr": "6. Communication",
        "ru": "6. Коммуникация",
        "uk": "6. Комунікація"
      }
    },
    {
      "id": "q_marketing",
      "type": "radio",
      "required": true,
      "label": {
        "en": "Would you like to receive updates and news by email?",
        "es": "Deseja receber novidades e promoções por e-mail?",
        "fr": "Souhaitez-vous recevoir des e-mails promotionnels ?",
        "ru": "Хотите ли вы получать новости на эл. почту?",
        "uk": "Чи хочете ви отримувати новини на ел. пошту?"
      },
      "options": [
        { "value": "yes", "label": { "en": "Yes, keep me updated", "es": "Sim, desejo receber novidades", "fr": "Oui, tenez-moi informé", "ru": "Да, хочу получать новости", "uk": "Так, хочу отримувати новини" } },
        { "value": "no", "label": { "en": "No, thank you", "es": "Não, prefiro não receber", "fr": "Non, merci", "ru": "Нет, спасибо", "uk": "Ні, дякую" } }
      ]
    }
  ]'::jsonb;
BEGIN
  -- 1. Find the Pokémon Conference event ID
  SELECT id INTO v_event_id
  FROM events
  WHERE name::text ILIKE '%pokémon%' OR name::text ILIKE '%pokemon%'
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE NOTICE 'No Pokémon event found';
    RETURN;
  END IF;

  -- 2. Find or create the form for this event
  SELECT id INTO v_form_id
  FROM forms
  WHERE event_id = v_event_id
  LIMIT 1;

  IF v_form_id IS NULL THEN
    INSERT INTO forms (event_id, title)
    VALUES (v_event_id, 'Default form')
    RETURNING id INTO v_form_id;
  END IF;

  -- 3. Calculate next version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version_num
  FROM form_versions
  WHERE form_id = v_form_id;

  -- 4. Create and publish the new form version
  INSERT INTO form_versions (form_id, version, definition, published_at)
  VALUES (v_form_id, v_new_version_num, jsonb_build_object('questions', v_questions), now())
  RETURNING id INTO v_new_version_id;

  -- 5. Set the new version as current
  UPDATE forms
  SET current_version_id = v_new_version_id
  WHERE id = v_form_id;

  -- 6. Set creator_published to true if possible
  BEGIN
    UPDATE form_versions
    SET creator_published = true
    WHERE id = v_new_version_id;
  EXCEPTION WHEN OTHERS THEN
    -- Column might not exist yet, ignore
  END;

  RAISE NOTICE 'Form updated and published successfully to version %', v_new_version_num;
END $$;
