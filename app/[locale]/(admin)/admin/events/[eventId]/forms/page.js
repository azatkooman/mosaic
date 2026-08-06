import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDate } from '@/lib/dates'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { Badge } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Read-only forms: every form this event owns, every version of it, and the
 * questions each version asks.
 *
 * All versions, not just the current one, because a participant records the
 * version they answered — reviewing an archived registration means being able
 * to read the form as it stood then. Questions sit inside <details> so a
 * 30-question form does not bury the next one, and that needs no client code.
 */
export default async function AdminEventForms({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

  const supabase = await getSupabaseServerClient()
  const [{ data: forms }, { data: event }] = await Promise.all([
    supabase
      .from('forms')
      .select(
        'id, title, registration_mode, current_version_id, ' +
          'form_versions!form_versions_form_id_fkey ( id, version, published_at, definition )'
      )
      .eq('event_id', eventId),
    supabase.from('events').select('default_locale, timezone').eq('id', eventId).maybeSingle(),
  ])

  const dl = event?.default_locale
  const tz = event?.timezone ?? 'UTC'

  if (!forms?.length) {
    return <p className="alert alert-info">{t('console.adminNothingHere')}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      {forms.map((form) => {
        // Newest version first — the current one is nearly always the answer.
        const versions = [...(form.form_versions ?? [])].sort((a, b) => b.version - a.version)
        return (
          <section key={form.id} className="card card-pad">
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--s-3)',
                flexWrap: 'wrap',
              }}
            >
              <strong>{form.title}</strong>
              {form.registration_mode && (
                <Badge tone="draft">
                  {t(
                    form.registration_mode === 'family'
                      ? 'console.bucketGroup'
                      : 'console.bucketIndividual'
                  )}
                </Badge>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginBlockStart: 'var(--s-3)' }}>
              {versions.map((v) => {
                const questions = v.definition?.questions ?? []
                return (
                  <details key={v.id}>
                    <summary style={{ cursor: 'pointer' }}>
                      <span style={{ display: 'inline-flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span>
                          {t('console.adminVersion')} {v.version}
                        </span>
                        {v.id === form.current_version_id && (
                          <Badge tone="published">{t('console.adminCurrentVersion')}</Badge>
                        )}
                        <span style={{ color: 'var(--ink-soft)' }}>
                          {v.published_at
                            ? formatEventDate(v.published_at, tz, locale, dateFmt)
                            : t('status.draft')}
                          {' · '}
                          {t('console.adminQuestionCount', { count: questions.length })}
                        </span>
                      </span>
                    </summary>
                    {questions.length > 0 && (
                      <ol style={{ marginBlock: 'var(--s-2)', paddingInlineStart: 'var(--s-5)' }}>
                        {questions.map((q) => (
                          <li key={q.id} style={{ marginBlockEnd: 'var(--s-1)' }}>
                            {lt(q.label, locale, dl) || <code>{q.id}</code>}{' '}
                            <span style={{ color: 'var(--ink-soft)' }}>({q.type})</span>
                            {q.required && (
                              <span style={{ color: 'var(--danger)' }}> *</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </details>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
