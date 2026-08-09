import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/lib/i18n/navigation'
import { Link } from '@/lib/i18n/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'
import { formatEventDateRange } from '@/lib/dates'
import { getDateFormatPrefs } from '@/lib/date-format-server'
import { eventPhase } from '@/lib/event-phase'
import { Badge } from '@/components/ui'
import { CancelParticipantButton } from './CancelParticipantButton'
import { EditParticipantButton } from './EditParticipantButton'
import { ParticipantTicket } from '@/components/tickets/ParticipantTicket'
import styles from './myregs.module.css'

export const dynamic = 'force-dynamic'

export default async function MyRegistrationsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()
  const dateFmt = await getDateFormatPrefs()

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
      events ( id, slug, name, default_locale, timezone, starts_at, ends_at,
        registration_opens_at, registration_closes_at ),
      participants ( id, first_name, last_name, email, status, answers,
        reg_seq, member_index, profile_name, deleted_at, ticket_code,
        participant_types ( key, name ),
        form_versions ( definition ) )
    `)
    .eq('registered_by', user.id)
    .order('created_at', { ascending: false })

  return (
    <>
      <section className={styles.pageHero}>
        <div className={styles.heroTiles} aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className={`container-narrow ${styles.pageHeroInner}`}>
          <h1 className="page-title">{t('myRegs.title')}</h1>
        </div>
      </section>

      <div className="container-narrow" style={{ paddingBlock: 'var(--s-6)' }}>
      {!registrations?.length ? (
        <div className={styles.empty}>
          <div className={styles.emptyTiles} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
              <path d="M14 6.5v11" strokeDasharray="1.5 2" />
            </svg>
          </div>
          <p className={styles.emptyTitle}>{t('myRegs.empty')}</p>
          <Link href="/" className={`btn btn-primary ${styles.emptyCta}`}>
            {t('myRegs.browseEvents')}
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {registrations.map((reg) => {
            // Self-service edits share the registration window: allowed while
            // the event is live and registration hasn't closed (the RPC
            // re-checks this server-side).
            const editable = reg.events && eventPhase(reg.events) === 'registrationOpen'
            return (
            <li key={reg.id} className={`card card-pad ${styles.regCard}`}>
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
                    ? formatEventDateRange(reg.events.starts_at, reg.events.ends_at, reg.events.timezone, locale, dateFmt)
                    : ''}
                </span>
              </div>
              <ul className={styles.participants}>
                {reg.participants.map((p) =>
                  // Archived by an organizer: keep a placeholder so the deletion
                  // is legible (and the card is never left empty), but show
                  // nothing about the participant and no actions. It reads
                  // 'cancelled' for the same light-red badge the registrant
                  // already knows from cancelling their own participant.
                  p.deleted_at ? (
                    <li key={p.id}>
                      <Badge tone="cancelled">{t('myRegs.participantDeleted')}</Badge>
                    </li>
                  ) : (
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
                      <ParticipantTicket
                        participant={p}
                        eventName={reg.events ? lt(reg.events.name, locale, reg.events.default_locale) : ''}
                      />
                      {editable && p.status !== 'cancelled' && (
                        <EditParticipantButton
                          participant={{
                            ...p,
                            participant_type_key: p.participant_types?.key,
                          }}
                          typeName={p.participant_types?.name}
                          definition={p.form_versions?.definition ?? { questions: [] }}
                        />
                      )}
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
          )})}
        </ul>
      )}
      </div>
    </>
  )
}
