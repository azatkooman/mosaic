import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lt } from '@/lib/i18n/locales'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Participant export: /api/export?eventId=…&format=xlsx|csv&locale=…&status=…&typeId=…
 *
 * Uses the service-role key to page through all rows, so it FIRST verifies
 * the caller can view the event (RLS does not apply to service role).
 * Columns = fixed fields + the union of question ids across every form
 * version this event ever published, with labels in the requester's locale.
 */
export async function GET(request) {
  const url = new URL(request.url)
  const eventId = url.searchParams.get('eventId')
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const locale = url.searchParams.get('locale') ?? 'en'
  const status = url.searchParams.get('status')
  const typeId = url.searchParams.get('typeId')
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

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const [{ data: event }, { data: types }, { data: versions }] = await Promise.all([
    admin.from('events').select('slug, name, default_locale').eq('id', eventId).single(),
    admin.from('participant_types').select('id, name').eq('event_id', eventId),
    admin
      .from('form_versions')
      // FK hint required: forms↔form_versions has two relationships.
      .select('id, definition, forms!form_versions_form_id_fkey!inner ( event_id )')
      .eq('forms.event_id', eventId),
  ])

  const typeName = new Map((types ?? []).map((t) => [t.id, lt(t.name, locale, event?.default_locale)]))
  const questionById = new Map()
  for (const v of versions ?? []) {
    for (const q of v.definition?.questions ?? []) {
      if (q.type !== 'section' && !questionById.has(q.id)) questionById.set(q.id, q)
    }
  }
  const questions = [...questionById.values()]

  const header = [
    'First name', 'Last name', 'Email', 'Type', 'Status', 'Registered at',
    ...questions.map((q) => lt(q.label, locale, event?.default_locale) || q.id),
  ]

  // Page through all participants with the service client.
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from('participants')
      .select('first_name, last_name, email, status, answers, created_at, participant_type_id')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (status) q = q.eq('status', status)
    if (typeId) q = q.eq('participant_type_id', typeId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const p of data ?? []) {
      rows.push([
        p.first_name,
        p.last_name,
        p.email ?? '',
        typeName.get(p.participant_type_id) ?? '',
        p.status,
        p.created_at,
        ...questions.map((question) => plainAnswer(p.answers?.[question.id], question, locale)),
      ])
    }
    if (!data || data.length < PAGE) break
  }

  const filename = `${event?.slug ?? 'participants'}-${new Date().toISOString().slice(0, 10)}`

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
  const sheet = workbook.addWorksheet('Participants')
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

function plainAnswer(value, question, locale) {
  if (value == null) return ''
  if (question.type === 'checkbox') return value ? 'yes' : 'no'
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
