'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { ticketCodeFromScan } from '@/lib/checkin'
import { Badge, Input } from '@/components/ui'
import styles from './checkin.module.css'

// One camera frame is inspected this often. Fast enough to feel instant,
// slow enough not to cook a phone that scans for an hour.
const SCAN_INTERVAL_MS = 280
// The same code is ignored for this long after a hit, so a ticket held in
// front of the camera doesn't hammer the RPC.
const REPEAT_MS = 3000

/** Decode one video frame; BarcodeDetector natively, jsQR everywhere else. */
async function decodeFrame(video, canvas, detectorRef, jsqrRef) {
  if (detectorRef.current) {
    const found = await detectorRef.current.detect(video)
    return found[0]?.rawValue ?? null
  }
  if (!jsqrRef.current) return null
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  // Downscale before decoding: jsQR is O(pixels) and phone frames are huge.
  const scale = Math.min(1, 640 / w)
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsqrRef.current(img.data, img.width, img.height)?.data ?? null
}

export function CheckinScanner({ eventId }) {
  const t = useTranslations('checkin')
  const tStatus = useTranslations('status')
  const locale = useLocale()
  const supabase = getSupabaseBrowserClient()
  const queryClient = useQueryClient()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const detectorRef = useRef(null)
  const jsqrRef = useRef(null)
  const lastHitRef = useRef({ code: null, at: 0 })
  const busyRef = useRef(false)

  const [camera, setCamera] = useState('off') // off | starting | on | denied
  const [results, setResults] = useState([]) // newest first
  const [search, setSearch] = useState('')

  const tally = useQuery({
    queryKey: ['checkin-tally', eventId],
    refetchInterval: 15000,
    queryFn: async () => {
      const base = () =>
        supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .is('deleted_at', null)
          .eq('status', 'confirmed')
      const [{ count: confirmed }, { count: checkedIn }] = await Promise.all([
        base(),
        base().not('checked_in_at', 'is', null),
      ])
      return { confirmed: confirmed ?? 0, checkedIn: checkedIn ?? 0 }
    },
  })

  const found = useQuery({
    queryKey: ['checkin-search', eventId, search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const q = search.trim().replaceAll('%', '')
      const { data } = await supabase
        .from('participants')
        .select('id, first_name, last_name, status, checked_in_at, reg_seq, member_index')
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,profile_name.ilike.%${q}%`)
        .order('last_name')
        .limit(12)
      return data ?? []
    },
  })

  function afterChange() {
    queryClient.invalidateQueries({ queryKey: ['checkin-tally', eventId] })
    queryClient.invalidateQueries({ queryKey: ['checkin-search', eventId] })
  }

  async function handleCode(code) {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const { data, error } = await supabase.rpc('check_in_participant', {
        p_ticket_code: code,
      })
      const outcome = error ? 'error' : data?.outcome ?? 'error'
      navigator.vibrate?.(
        outcome === 'ok' ? 90 : outcome === 'already' ? [50, 60, 50] : [220]
      )
      setResults((prev) =>
        [{ ...(data ?? {}), outcome, at: Date.now(), key: crypto.randomUUID() }, ...prev].slice(0, 12)
      )
      if (outcome === 'ok') afterChange()
    } finally {
      busyRef.current = false
    }
  }

  async function startCamera() {
    setCamera('starting')
    try {
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats()
          if (formats.includes('qr_code')) {
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
          }
        } catch {
          detectorRef.current = null
        }
      }
      if (!detectorRef.current) {
        jsqrRef.current = (await import('jsqr')).default
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCamera('on')
    } catch {
      setCamera('denied')
    }
  }

  // Scan loop + camera teardown.
  useEffect(() => {
    if (camera !== 'on') return
    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
    const id = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      let raw
      try {
        raw = await decodeFrame(video, canvas, detectorRef, jsqrRef)
      } catch {
        return
      }
      const code = ticketCodeFromScan(raw ?? '')
      if (!code) return
      const now = Date.now()
      if (lastHitRef.current.code === code && now - lastHitRef.current.at < REPEAT_MS) return
      lastHitRef.current = { code, at: now }
      handleCode(code)
    }, SCAN_INTERVAL_MS)
    return () => clearInterval(id)
  }, [camera]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current
    return () => {
      video?.srcObject?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const latest = results[0]

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.tally} aria-live="polite">
          {t('tally', {
            checkedIn: tally.data?.checkedIn ?? '–',
            confirmed: tally.data?.confirmed ?? '–',
          })}
        </p>
      </header>

      <div className={styles.scanner}>
        {/* The video element must stay mounted: iOS refuses play() on an
            element created after the getUserMedia gesture. */}
        <video ref={videoRef} className={styles.video} playsInline muted hidden={camera !== 'on'} />
        {camera !== 'on' && (
          <div className={styles.cameraGate}>
            {camera === 'denied' ? (
              <p className={styles.muted}>{t('cameraDenied')}</p>
            ) : (
              <button
                className="btn btn-primary"
                onClick={startCamera}
                disabled={camera === 'starting'}
              >
                {camera === 'starting' ? t('cameraStarting') : t('startCamera')}
              </button>
            )}
          </div>
        )}
        {camera === 'on' && latest && (
          <div className={`${styles.flash} ${styles[latest.outcome]}`} key={latest.key}>
            <strong>
              {latest.outcome === 'not_found' || latest.outcome === 'error'
                ? t(`outcome.${latest.outcome}`)
                : `${latest.first_name ?? ''} ${latest.last_name ?? ''}`.trim()}
            </strong>
            <span>
              {latest.outcome === 'ok' && t('outcome.ok')}
              {latest.outcome === 'already' &&
                t('outcome.already', { time: new Date(latest.checked_in_at).toLocaleTimeString(locale) })}
              {latest.outcome === 'rejected' && t('outcome.rejected', { status: tStatus(latest.status) })}
            </span>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <section>
          <h3 className={styles.subtitle}>{t('recent')}</h3>
          <ul className={styles.recent}>
            {results.map((r) => (
              <li key={r.key} className={styles.recentRow}>
                <span className={`${styles.dot} ${styles[r.outcome]}`} aria-hidden="true" />
                <span className={styles.recentName}>
                  {r.outcome === 'not_found' || r.outcome === 'error'
                    ? t(`outcome.${r.outcome}`)
                    : `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || r.reg_no}
                </span>
                {r.reg_no && <span className={styles.muted}>{r.reg_no}</span>}
                <span className={styles.muted}>
                  {new Date(r.at).toLocaleTimeString(locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className={styles.subtitle}>{t('manualTitle')}</h3>
        <p className={styles.muted}>{t('manualHint')}</p>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('manualTitle')}
        />
        {found.data && (
          <ul className={styles.manualList}>
            {found.data.length === 0 && <li className={styles.muted}>{t('noMatches')}</li>}
            {found.data.map((p) => (
              <li key={p.id} className={styles.manualRow}>
                <span className={styles.recentName}>
                  {`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() ||
                    `${p.reg_seq}.${p.member_index}`}
                </span>
                <Badge tone={p.status}>{tStatus(p.status)}</Badge>
                {p.checked_in_at ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await supabase.rpc('set_participant_checkin', {
                        p_participant_id: p.id,
                        p_checked_in: false,
                      })
                      afterChange()
                    }}
                  >
                    ✓ {t('undo')}
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={p.status !== 'confirmed'}
                    onClick={async () => {
                      await supabase.rpc('set_participant_checkin', {
                        p_participant_id: p.id,
                        p_checked_in: true,
                      })
                      afterChange()
                    }}
                  >
                    {t('checkInAction')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
