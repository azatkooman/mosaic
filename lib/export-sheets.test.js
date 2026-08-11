import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { BUCKET_LABEL_KEY, sheetBucketsFor, sheetName } from './export-sheets.js'

const BOTH = { individual: { versionIds: ['s1'] }, group: { versionIds: ['g1', 'g2'] } }
const SOLO = { individual: { versionIds: ['s1'] }, group: { versionIds: [] } }

describe('sheetBucketsFor', () => {
  it('gives an All xlsx three sheets, All first', () => {
    expect(sheetBucketsFor('all', 'xlsx', BOTH)).toEqual(['all', 'individual', 'group'])
  })

  it('omits Group when the event never ran a group form', () => {
    // Otherwise the workbook carries an empty tab nobody can explain.
    expect(sheetBucketsFor('all', 'xlsx', SOLO)).toEqual(['all', 'individual'])
  })

  it('keeps a per-tab download to its own single sheet', () => {
    expect(sheetBucketsFor('individual', 'xlsx', BOTH)).toEqual(['individual'])
    expect(sheetBucketsFor('group', 'xlsx', BOTH)).toEqual(['group'])
  })

  it('leaves CSV a single union table, having nowhere to put a second sheet', () => {
    expect(sheetBucketsFor('all', 'csv', BOTH)).toEqual(['all'])
  })

  it('survives an event with no forms at all', () => {
    expect(sheetBucketsFor('all', 'xlsx', undefined)).toEqual(['all'])
    expect(sheetBucketsFor('all', 'xlsx', {})).toEqual(['all'])
  })
})

describe('sheetName', () => {
  it('passes an ordinary localized name through', () => {
    expect(sheetName('All participants')).toBe('All participants')
  })

  it('strips the characters Excel rejects in a sheet name', () => {
    expect(sheetName('Group: [2026] / draft?')).toBe('Group 2026 draft')
  })

  it('truncates at 31 characters, the Excel limit', () => {
    const long = sheetName('Індивідуальні реєстрації учасників заходу')
    expect(long.length).toBeLessThanOrEqual(31)
  })

  it('never returns an empty name', () => {
    expect(sheetName('')).toBe('Sheet')
    expect(sheetName('///')).toBe('Sheet')
    expect(sheetName(undefined)).toBe('Sheet')
  })
})

describe('the workbook ExcelJS actually writes', () => {
  // The point of the three-sheet export is a file with three usable tabs, and
  // nothing above proves ExcelJS accepts the names or keeps the order. Building
  // and reading one back does.
  it('round-trips three named sheets, All first, each with its own columns', async () => {
    const sheets = [
      { name: sheetName('All participants'), header: ['Reg. #', 'Registration', 'Name'], rows: [['1.1', 'Group', 'Ada']] },
      { name: sheetName('Individual registrations'), header: ['Reg. #', 'Dietary needs'], rows: [['2.1', 'None']] },
      { name: sheetName('Group registrations'), header: ['Reg. #', 'Rooms needed'], rows: [['1.1', '2']] },
    ]
    const wb = new ExcelJS.Workbook()
    for (const { name, header, rows } of sheets) {
      const ws = wb.addWorksheet(name)
      ws.addRow(header)
      for (const r of rows) ws.addRow(r)
    }
    const buffer = await wb.xlsx.writeBuffer()

    const read = new ExcelJS.Workbook()
    await read.xlsx.load(buffer)
    expect(read.worksheets.map((w) => w.name)).toEqual([
      'All participants',
      'Individual registrations',
      'Group registrations',
    ])
    // The union sheet keeps the kind column the narrower sheets do without.
    expect(read.getWorksheet('All participants').getRow(1).values.slice(1)).toEqual([
      'Reg. #',
      'Registration',
      'Name',
    ])
    expect(read.getWorksheet('Group registrations').getRow(2).values.slice(1)).toEqual(['1.1', '2'])
  })

  it('accepts a name sheetName had to sanitize', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet(sheetName('Group: [2026] / draft?'))
    const read = new ExcelJS.Workbook()
    await read.xlsx.load(await wb.xlsx.writeBuffer())
    expect(read.worksheets[0].name).toBe('Group 2026 draft')
  })
})

describe('BUCKET_LABEL_KEY', () => {
  it('names a console tab key for every bucket a sheet can be built from', () => {
    for (const b of sheetBucketsFor('all', 'xlsx', BOTH)) {
      expect(BUCKET_LABEL_KEY[b]).toBeTruthy()
    }
  })
})
