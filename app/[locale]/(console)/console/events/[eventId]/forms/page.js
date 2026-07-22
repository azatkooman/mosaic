import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui'
import { NewFormButton } from './NewFormButton'

export const dynamic = 'force-dynamic'

export default async function FormsPage({ params }) {
  const { locale, eventId } = await params
  setRequestLocale(locale)
  const t = await getTranslations('console')

  const supabase = await getSupabaseServerClient()
  const { data: forms } = await supabase
    .from('forms')
    // forms↔form_versions has two FKs (form_id and current_version_id);
    // the embed must name one or PostgREST rejects it as ambiguous (PGRST201).
    .select('id, title, registration_mode, current_version_id, form_versions!form_versions_form_id_fkey ( id, version, published_at )')
    .eq('event_id', eventId)
    .order('created_at')

  return (
    <div style={{ maxInlineSize: '40rem', display: 'grid', gap: 'var(--s-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <NewFormButton
          eventId={eventId}
          existingForms={(forms ?? []).map((f) => ({
            id: f.id,
            title: f.title,
            registration_mode: f.registration_mode,
          }))}
        />
      </div>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {(forms ?? []).map((form) => {
              const published = form.form_versions
                .filter((v) => v.published_at)
                .sort((a, b) => b.version - a.version)[0]
              return (
                <tr key={form.id}>
                  <td>
                    <strong>{form.title}</strong>{' '}
                    {form.registration_mode ? (
                      <Badge>
                        {form.registration_mode === 'single'
                          ? t('formModeSingle')
                          : t('formModeFamily')}
                      </Badge>
                    ) : (
                      <span
                        className="tip tip-right"
                        data-tip={t('defaultFormTip')}
                        tabIndex={0}
                        style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                      >
                        <Badge>{t('formModeDefault')}</Badge>
                        <span aria-hidden="true" style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>ⓘ</span>
                        <span className="sr-only">{t('defaultFormTip')}</span>
                      </span>
                    )}
                    <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
                      {published ? `v${published.version}` : t('draftSaved')}
                    </div>
                  </td>
                  <td style={{ textAlign: 'end' }}>
                    <Link
                      href={`/console/events/${eventId}/forms/${form.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      {t('editForm')}
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
