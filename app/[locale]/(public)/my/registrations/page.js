import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/lib/i18n/navigation'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { Badge } from '@/components/ui'
import { CancelParticipantButton } from './CancelParticipantButton'
import styles from './myregs.module.css'

export const dynamic = 'force-dynamic'

export default async function MyRegistrationsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect({ href: `/login?next=${encodeURIComponent(`/${locale}/my/registrations`)}`, locale })
  }

  const { data: registrations } = await supabase
    .from('registrations')
    .select(`
      id, created_at,
      events ( id, slug, name, default_locale, timezone, starts_at, ends_at ),
      participants ( id, first_name, last_name, status,
        participant_types ( name ) )
    `)
    .eq('registered_by', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
      <h1 className="page-title" style={{ marginBottom: 'var(--s-5)' }}>
        {t('myRegs.title')}
      </h1>

      {!registrations?.length ? (
        <div className={styles.empty}>
          <p>{t('myRegs.empty')}</p>
          <Link href="/" className="btn btn-primary">
            {t('myRegs.browseEvents')}
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {registrations.map((reg) => (
            <li key={reg.id} className="card card-pad">
              <div className={styles.regHead}>
                {/* reg.events is null when the event was unpublished/archived:
                    RLS hides it from the registrant while the registration
                    itself stays visible. Keep the row (and cancellation)
                    working instead of crashing the whole page. */}
                {reg.events ? (
                  <Link href={`/events/${reg.events.slug}`}>
                    <strong>{lt(reg.events.name, locale, reg.events.default_locale)}</strong>
                  </Link>
                ) : (
                  <strong>{t('myRegs.eventUnavailable')}</strong>
                )}
                <span className={styles.muted}>
                  {reg.events
                    ? formatEventDateRange(reg.events.starts_at, reg.events.ends_at, reg.events.timezone, locale)
                    : ''}
                </span>
              </div>
              <ul className={styles.participants}>
                {reg.participants.map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.first_name} {p.last_name}
                      <span className={styles.muted}>
                        {' · '}
                        {lt(p.participant_types?.name, locale, reg.events?.default_locale)}
                      </span>
                    </span>
                    <span className={styles.rowActions}>
                      <Badge tone={p.status}>{t(`status.${p.status}`)}</Badge>
                      {p.status !== 'cancelled' && (
                        <CancelParticipantButton
                          participantId={p.id}
                          label={t('myRegs.cancelParticipant')}
                          confirmText={t('myRegs.cancelConfirm', {
                            name: `${p.first_name} ${p.last_name}`,
                          })}
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
