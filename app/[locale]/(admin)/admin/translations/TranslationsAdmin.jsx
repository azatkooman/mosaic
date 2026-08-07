'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { formatEventDate } from '@/lib/dates'
import { useDateFormatPrefs } from '@/components/providers/DateFormatProvider'
import { Badge, Button } from '@/components/ui'

/**
 * The refresh side of Admin ▸ Interface languages.
 *
 * Deliberately loops /api/ui-translations one language at a time rather than
 * adding a batch endpoint. Three reasons: each request stays one language and
 * one Google call, so it cannot approach a serverless timeout however many
 * languages exist; the route remains the single authority on what may be
 * translated and what it costs; and a language that fails is reported by name
 * while the rest still finish, instead of taking the whole sweep down.
 */
/**
 * Translate each language in turn, reporting what changed.
 *
 * Pure apart from the injected `post`, so the decisions that matter — which
 * failures abort the remaining languages and which merely get recorded, and what
 * counts as "changed" — are testable without a DOM.
 *
 * `post(code)` resolves to `{ ok, status, data }`; it must not throw for an HTTP
 * error, only for a transport failure.
 *
 * @returns {Promise<{langsChanged: number, keysChanged: number,
 *   failed: Array<{code: string, reason: string}>, aborted: string|null}>}
 *   `aborted` is 'no_api_key' or 'rate_limited' when the sweep stopped early.
 */
export async function sweepLanguages(codes, post, onProgress = () => {}) {
  let langsChanged = 0
  let keysChanged = 0
  const failed = []

  for (const code of codes) {
    onProgress(code)
    let res
    try {
      res = await post(code)
    } catch (e) {
      failed.push({ code, reason: e?.message ?? 'network' })
      continue
    }
    if (!res?.ok) {
      // Two failures are about the whole sweep rather than this language, so
      // continuing would just reproduce the same error once per language: a
      // missing API key means nothing can succeed, and a 429 means the calls
      // still queued will be refused too.
      if (res?.data?.error === 'no_api_key') {
        return { langsChanged, keysChanged, failed, aborted: 'no_api_key' }
      }
      if (res?.status === 429) {
        return { langsChanged, keysChanged, failed, aborted: 'rate_limited' }
      }
      failed.push({ code, reason: res?.data?.error ?? String(res?.status ?? 'error') })
      continue
    }
    // A language already up to date reports translated: 0 and is not counted —
    // "updated 7 languages" would be a lie when six of them needed nothing.
    if (res.data?.translated > 0) {
      langsChanged++
      keysChanged += res.data.translated
    }
  }

  return { langsChanged, keysChanged, failed, aborted: null }
}

async function postLanguage(code) {
  const res = await fetch('/api/ui-translations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export function TranslationsAdmin({ languages, totalKeys, locale }) {
  const t = useTranslations('console')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const dateFmt = useDateFormatPrefs()

  const [busy, setBusy] = useState(null) // code currently being translated
  const [summary, setSummary] = useState(null) // { tone, text }
  const [failures, setFailures] = useState([])

  const needsWork = languages.filter((l) => !l.cached || l.staleCount > 0)

  async function refresh(codes) {
    if (codes.length === 0) {
      setFailures([])
      setSummary({ tone: 'info', text: t('trNothingToDo') })
      return
    }
    setSummary(null)
    setFailures([])

    const result = await sweepLanguages(codes, postLanguage, setBusy)
    setBusy(null)
    setFailures(result.failed)

    if (result.aborted === 'no_api_key') {
      setSummary({ tone: 'error', text: t('trNoKey') })
      return
    }
    if (result.aborted === 'rate_limited') {
      setSummary({ tone: 'error', text: t('trRateLimited') })
    } else {
      setSummary(
        result.keysChanged > 0
          ? {
              tone: 'success',
              text: t('trDone', {
                languages: result.langsChanged,
                keys: result.keysChanged,
              }),
            }
          : { tone: 'info', text: t('trNothingToDo') }
      )
    }
    // Pull the recomputed counts down from the server rather than guessing them
    // here — the source hashes are the authority on what is still outdated.
    router.refresh()
  }

  if (languages.length === 0) {
    return (
      <>
        <p className="alert alert-info">{t('trNoLanguages')}</p>
        <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>
          {t('trPlatformNote')}
        </p>
      </>
    )
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 'var(--s-3)',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBlock: 'var(--s-4)',
        }}
      >
        <Button onClick={() => refresh(needsWork.map((l) => l.code))} disabled={busy != null}>
          {busy ? t('trRefreshing', { code: busy }) : t('trRefresh')}
        </Button>
        {needsWork.length === 0 && !busy && (
          <span style={{ color: 'var(--ink-soft)' }}>{t('trUpToDate')}</span>
        )}
      </div>

      {summary && (
        <p
          className={`alert alert-${summary.tone === 'error' ? 'error' : summary.tone === 'success' ? 'success' : 'info'}`}
        >
          {summary.text}
        </p>
      )}
      {failures.map((f) => (
        <p key={f.code} className="alert alert-error">
          {t('trFailed', { code: f.code, reason: f.reason })}
        </p>
      ))}

      <div className="table-wrap table-cards">
        <table className="table">
          <thead>
            <tr>
              <th>{t('trLanguage')}</th>
              <th>{t('trKeysCached')}</th>
              <th>{t('trOutdated')}</th>
              <th>{t('trUpdatedAt')}</th>
              <th>{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {languages.map((lang) => (
              <tr key={lang.code}>
                <td data-cell="title">
                  <strong>{lang.name}</strong>{' '}
                  <span style={{ color: 'var(--ink-soft)' }}>({lang.code})</span>
                  {lang.eventCount > 0 && (
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--ink-soft)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      {t('trUsedByEvents', { count: lang.eventCount })}
                    </span>
                  )}
                </td>
                <td data-label={t('trKeysCached')}>
                  {lang.cached ? (
                    `${lang.cachedCount} / ${totalKeys}`
                  ) : (
                    <Badge tone="pending">{t('trNotCached')}</Badge>
                  )}
                </td>
                <td data-label={t('trOutdated')}>
                  {lang.staleCount > 0 ? (
                    <Badge tone="waitlisted">{lang.staleCount}</Badge>
                  ) : (
                    <Badge tone="confirmed">0</Badge>
                  )}
                </td>
                <td data-label={t('trUpdatedAt')}>
                  {lang.updatedAt ? formatEventDate(lang.updatedAt, 'UTC', locale, dateFmt) : '—'}
                </td>
                <td data-label={tCommon('actions')}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy != null}
                    onClick={() => refresh([lang.code])}
                  >
                    {t('trRefreshOne')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        style={{
          color: 'var(--ink-soft)',
          fontSize: 'var(--text-sm)',
          marginBlockStart: 'var(--s-4)',
        }}
      >
        {t('trPlatformNote')}
      </p>
    </>
  )
}
