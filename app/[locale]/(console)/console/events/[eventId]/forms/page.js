import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
    .select('id, title, current_version_id, form_versions!form_versions_form_id_fkey ( id, version, published_at )')
    .eq('event_id', eventId)

  return (
    <div className="table-wrap" style={{ maxInlineSize: '40rem' }}>
      <table className="table">
        <tbody>
          {(forms ?? []).map((form) => {
            const published = form.form_versions
              .filter((v) => v.published_at)
              .sort((a, b) => b.version - a.version)[0]
            return (
              <tr key={form.id}>
                <td>
                  <strong>{form.title}</strong>
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
  )
}
