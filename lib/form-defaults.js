/**
 * Starter questions for a brand-new form: a required name and an optional
 * email. They are ordinary questions — organizers can edit or delete them
 * (identity extraction handles their absence).
 */
export function defaultFormQuestions() {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
  return [
    {
      id: `q_name_${suffix}`,
      type: 'name',
      nameFormat: 'first_last',
      required: true,
      label: { en: 'Name', es: 'Nombre', fr: 'Nom', ru: 'Имя', uk: "Ім'я" },
    },
    {
      id: `q_email_${suffix}`,
      type: 'email',
      required: false,
      label: {
        en: 'Email',
        es: 'Correo electrónico',
        fr: 'E-mail',
        ru: 'Эл. почта',
        uk: 'Ел. пошта',
      },
    },
  ]
}
