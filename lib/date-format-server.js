// Server-only accessor for the date/time format cookie. Kept out of
// lib/date-format.js so next/headers never enters a client bundle.
import { cookies } from 'next/headers'
import { DATEFMT_COOKIE, parseDateFmtCookie } from './date-format'

/** Current requester's {dateFormat, timeFormat}, normalized; absent → auto. */
export async function getDateFormatPrefs() {
  const raw = (await cookies()).get(DATEFMT_COOKIE)?.value
  return parseDateFmtCookie(raw)
}
