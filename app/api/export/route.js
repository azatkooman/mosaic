import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { lt } from '@/lib/i18n/locales'
import { formatStructuredAnswer } from '@/lib/form-engine/format'
import { formatEventDate, formatDateValue } from '@/lib/dates'
import { normalizeDateFormat, normalizeTimeFormat } from '@/lib/date-format'
import { getTranslations } from 'next-intl/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { eventQuestionBuckets } from '@/lib/event-questions'
import { applyParticipantFilters, applyParticipantSort, formatRegNo } from '@/lib/participants-query'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Participant export: /api/export?eventId=…&format=xlsx|csv&locale=…&status=…&typeId=…
 *
 * Uses the service-role key to page through all rows, so it FIRST verifies
 * the caller can view the event (RLS does not apply to service role).
 * One download per participants tab (`bucket`: individual or group). Columns =
 * fixed fields + the questions the current version of that bucket's forms asks,
 * with labels in the requester's locale; rows are restricted to that bucket too.
 */
export async function GET(request) {
  const rateLimitRes = enforceRateLimit(request, { limit: 10, windowMs: 60000, keyPrefix: 'export' })
  if (rateLimitRes) return rateLimitRes

  const url = new URL(request.url)
  const eventId = url.searchParams.get('eventId')
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const locale = url.searchParams.get('locale') ?? 'en'
  const status = url.searchParams.get('status')
  const typeId = url.searchParams.get('typeId')
  const search = url.searchParams.get('q') ?? ''
  // Which participants list this download is for. Anything but 'group' means
  // the individual list, so an older link without the param still works.
  const bucket = url.searchParams.get('bucket') === 'group' ? 'group' : 'individual'
  const sort = { column: url.searchParams.get('sort'), dir: url.searchParams.get('dir') }
  let answerFilters = {}
  try {
    const raw = url.searchParams.get('answers')
    if (raw) answerFilters = JSON.parse(raw)
  } catch {
    // ignore malformed answer filters — export the unfiltered set
  }
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  // Authorize with the caller's own session (RLS-checked read).
  const userClient = await getSupabaseServerClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 })
  const { data: canView } = await userClient.rpc('can_view_event_api', { eid: eventId })
  if (!canView) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = getSupabaseAdminClient()

  const [{ data: event }, { data: types }, { data: versions }, { data: requesterProfile }] =
    await Promise.all([
      admin.from('events').select('slug, name, default_locale, timezone').eq('id', eventId).single(),
      admin.from('participant_types').select('id, name').eq('event_id', eventId),
      admin
        .from('form_versions')
        // FK hint required: forms↔form_versions has two relationships.
        .select(
          'id, definition, forms!form_versions_form_id_fkey!inner ( event_id, current_version_id, registration_mode )'
        )
        .eq('forms.event_id', eventId),
      // Requester's display prefs come from their profile row (the DB is the
      // source of truth; the cookie may be absent for direct downloads).
      admin.from('profiles').select('date_format, time_format').eq('id', user.id).maybeSingle(),
    ])

  const dateFmt = {
    dateFormat: normalizeDateFormat(requesterProfile?.date_format),
    timeFormat: normalizeTimeFormat(requesterProfile?.time_format),
  }

  const typeName = new Map((types ?? []).map((t) => [t.id, lt(t.name, locale, event?.default_locale)]))
  // Same column set the console list builds for this tab, so the download
  // matches the view — including being restricted to that tab's own rows.
  const { questions, versionIds } = eventQuestionBuckets(versions ?? [])[bucket]

  // Column headers and cell literals follow the requester's locale. The
  // wizard namespace is no longer needed here: the first/last/email headers
  // it supplied went away with the fixed name columns.
  const tc = await getTranslations({ locale, namespace: 'console' })
  const tCommon = await getTranslations({ locale, namespace: 'common' })
  // Column order mirrors the console list: Reg. # · answers · Type · Status ·
  // profile. 'Registered at' has no column in the list but is kept here — a
  // spreadsheet has room for it and organizers rely on it.
  const header = [
    tc('regNo'),
    ...questions.map((q) => lt(q.label, locale, event?.default_locale) || q.id),
    tc('byType'), tc('byStatus'), tc('profileName'), tc('profileEmail'), tc('registeredAt'),
  ]

  // Page through all participants with the service client.
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from('participants')
      .select(
        'status, answers, created_at, participant_type_id, reg_seq, member_index, profile_name, profile_email'
      )
      .eq('event_id', eventId)
      .range(from, from + PAGE - 1)
    // Same filters + sort as the console table, so the file matches the view.
    q = applyParticipantFilters(
      q,
      { status, typeId, search, answerFilters, formVersionIds: versionIds },
      questions
    )
    q = applyParticipantSort(q, sort, questions)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const p of data ?? []) {
      rows.push([
        formatRegNo(p),
        // tCommon reaches plainAnswer for the localized yes/no on checkboxes.
        ...questions.map((question) => plainAnswer(p.answers?.[question.id], question, locale, dateFmt, tCommon)),
        typeName.get(p.participant_type_id) ?? '',
        p.status,
        p.profile_name ?? '',
        p.profile_email ?? '',
        formatEventDate(p.created_at, event?.timezone ?? 'UTC', locale, dateFmt),
      ])
    }
    if (!data || data.length < PAGE) break
  }

  // Filename date follows the pref too, with filesystem-safe separators.
  const fileDate =
    dateFmt.dateFormat === 'auto'
      ? new Date().toISOString().slice(0, 10)
      : formatSampleDateSafe(dateFmt.dateFormat)
  // The bucket is part of the name so the two downloads never collide in a
  // Downloads folder, and so it is obvious which list a file holds.
  const filename = `${event?.slug ?? 'participants'}-${bucket}-${fileDate}`

  if (format === 'csv') {
    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n')
    return new NextResponse('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(
    tc(bucket === 'group' ? 'bucketGroup' : 'bucketIndividual')
  )
  sheet.addRow(header)
  sheet.getRow(1).font = { bold: true }
  for (const r of rows) sheet.addRow(r)
  sheet.columns.forEach((col) => {
    let max = 10
    col.eachCell({ includeEmpty: false }, (cell) => {
      max = Math.min(60, Math.max(max, String(cell.value ?? '').length + 2))
    })
    col.width = max
  })
  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  })
}

function plainAnswer(value, question, locale, dateFmt, tCommon) {
  if (value == null) return ''
  const structured = formatStructuredAnswer(question, value)
  if (structured !== null) return structured
  if (question.type === 'date') return formatDateValue(value, locale, dateFmt)
  if (question.type === 'checkbox') return value ? tCommon('yes') : tCommon('no')
  if (Array.isArray(value)) {
    return value
      .map((v) => lt(question.options?.find((o) => o.value === v)?.label, locale) || v)
      .join('; ')
  }
  if (['select', 'radio'].includes(question.type)) {
    return lt(question.options?.find((o) => o.value === value)?.label, locale) || String(value)
  }
  return String(value)
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** Today's date in the forced order with '-' separators (filename-safe). */
function formatSampleDateSafe(dateFormat) {
  const now = new Date()
  const y = String(now.getUTCFullYear())
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  if (dateFormat === 'mdy') return `${m}-${d}-${y}`
  if (dateFormat === 'dmy') return `${d}-${m}-${y}`
  return `${y}-${m}-${d}`
}
