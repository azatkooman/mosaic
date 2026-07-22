import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const directory = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(directory)
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()

if (files.length === 0) {
  console.error('No migration files found.')
  process.exit(1)
}

const seen = new Map()
let previous = null
let valid = true

for (const file of files) {
  const match = /^(\d{4})_(.+)\.sql$/.exec(file)
  const version = Number(match[1])
  const name = match[2]

  if (seen.has(version)) {
    console.error(
      `Duplicate migration version ${match[1]}: ${seen.get(version)} and ${file}`
    )
    valid = false
  }
  seen.set(version, file)

  if (previous !== null && version !== previous + 1) {
    console.error(
      `Migration sequence skips from ${String(previous).padStart(4, '0')} to ${match[1]} (${file}).`
    )
    valid = false
  }
  previous = version

  if (!name.trim()) {
    console.error(`Migration ${match[1]} needs a descriptive name.`)
    valid = false
  }
}

if (!valid) process.exit(1)

console.log(`Migration numbering is valid: ${files.length} files (${files[0]} → ${files.at(-1)}).`)
