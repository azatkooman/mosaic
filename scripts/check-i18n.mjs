#!/usr/bin/env node
/**
 * Verify every translation key referenced in code exists in messages/en.json,
 * and that all locale files carry the same key set.
 *
 * Resolves the namespace per translator variable, e.g.
 *   const t = useTranslations('console')      → t('x')      → console.x
 *   const tc = useTranslations()              → tc('a.b')   → a.b
 *   const t = await getTranslations('event')  → t('when')   → event.when
 * Dynamic keys (template literals / variables) are reported separately so a
 * human can eyeball them rather than failing the build on a false positive.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC_DIRS = ['app', 'components', 'lib']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.add(key)
  }
  return out
}

/**
 * JSON.parse keeps the LAST of two same-named keys and drops the first without
 * a word, so a duplicate looks like a working translation while silently
 * overriding another one. Re-scan the raw text to catch it. (This is how five
 * locales ended up with two different `console.addContact` strings, only one
 * of which ever rendered.)
 */
function duplicateKeys(text) {
  const dups = []
  const stack = []
  const re = /("(?:[^"\\]|\\.)*")\s*:|([{}])/g
  let m
  while ((m = re.exec(text))) {
    if (m[2] === '{') stack.push(new Set())
    else if (m[2] === '}') stack.pop()
    else if (m[1] && stack.length) {
      const top = stack[stack.length - 1]
      if (top.has(m[1])) dups.push(JSON.parse(m[1]))
      else top.add(m[1])
    }
  }
  return dups
}

const messagesDir = join(ROOT, 'messages')
const locales = readdirSync(messagesDir).filter((f) => f.endsWith('.json'))
const rawByLocale = new Map(
  locales.map((f) => [f, readFileSync(join(messagesDir, f), 'utf8')])
)
const duplicates = locales.flatMap((f) =>
  duplicateKeys(rawByLocale.get(f)).map((k) => `${f}: duplicate key "${k}"`)
)
const keysByLocale = new Map(
  locales.map((f) => [f, flatten(JSON.parse(rawByLocale.get(f)))])
)
const enKeys = keysByLocale.get('en.json')

const missing = []
const dynamic = []

for (const file of SRC_DIRS.flatMap((d) => walk(join(ROOT, d)))) {
  const src = readFileSync(file, 'utf8')
  // Map translator variable → namespace.
  const nsByVar = new Map()
  const declRe =
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g
  for (const m of src.matchAll(declRe)) {
    nsByVar.set(m[1], m[2] ?? m[3] ?? '')
  }
  if (nsByVar.size === 0) continue

  for (const [varName, ns] of nsByVar) {
    // t('key') / t.rich('key') / t.has('key')
    const callRe = new RegExp(`\\b${varName}(?:\\.(?:rich|has|markup))?\\(\\s*(['"\`])([^'"\`]*)\\1`, 'g')
    for (const m of src.matchAll(callRe)) {
      const raw = m[2]
      const full = ns ? `${ns}.${raw}` : raw
      const loc = `${relative(ROOT, file)}`
      if (m[1] === '`' || raw.includes('${')) { dynamic.push(`${loc}: ${full}`); continue }
      if (!enKeys.has(full)) missing.push(`${loc}: ${full}`)
    }
    // Template-literal keys: t(`status.${x}`) — record for manual review.
    const tmplRe = new RegExp(`\\b${varName}\\(\\s*\`([^\`]*)\``, 'g')
    for (const m of src.matchAll(tmplRe)) {
      dynamic.push(`${relative(ROOT, file)}: ${ns ? ns + '.' : ''}${m[1]}`)
    }
  }
}

let failed = false
if (duplicates.length) {
  failed = true
  console.error(`\n✗ ${duplicates.length} duplicate key(s) in messages/ — JSON.parse keeps only the last:`)
  for (const d of duplicates) console.error(`   ${d}`)
}

if (missing.length) {
  failed = true
  console.error(`\n✗ ${missing.length} translation key(s) used in code but missing from messages/en.json:`)
  for (const m of [...new Set(missing)].sort()) console.error(`   ${m}`)
}

for (const [locale, keys] of keysByLocale) {
  if (locale === 'en.json') continue
  const absent = [...enKeys].filter((k) => !keys.has(k))
  const extra = [...keys].filter((k) => !enKeys.has(k))
  if (absent.length || extra.length) {
    failed = true
    console.error(`\n✗ messages/${locale} out of sync with en.json`)
    if (absent.length) console.error(`   missing: ${absent.slice(0, 20).join(', ')}${absent.length > 20 ? ` …(+${absent.length - 20})` : ''}`)
    if (extra.length) console.error(`   extra:   ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ` …(+${extra.length - 20})` : ''}`)
  }
}

if (!failed) {
  console.log(`✓ i18n OK: every referenced key exists; ${locales.length} locales in sync (${enKeys.size} keys).`)
  if (dynamic.length) {
    console.log(`  (${new Set(dynamic).size} dynamic key pattern(s) skipped — verify manually if you add cases.)`)
  }
}
process.exit(failed ? 1 : 0)
