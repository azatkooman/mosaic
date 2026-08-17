'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Dialog } from '@/components/ui'
import { useUnsavedWarningEnabled } from '@/components/providers/UnsavedWarningProvider'

/**
 * Warn before navigating away from an editor with unsaved work.
 *
 * The three console editors all hold edits in React state and write only on
 * Save, so a stray click on the tab strip discards however long the organizer
 * spent in them with no warning at all. Each already computes exactly the fact
 * this needs — `dirty` — so the guard is a prop away in all three.
 *
 * Two escape routes exist and they need different mechanisms:
 *
 *  - **In-app navigation** (the tab strip, the console topbar, any next/link)
 *    never leaves the document, so the browser knows nothing about it. Caught
 *    with a capture-phase click listener on the document: every one of those
 *    renders a real <a>, so one listener covers links this component has never
 *    heard of, including ones added later.
 *  - **Leaving the document** (reload, tab close, an external link, the URL
 *    bar) is `beforeunload`. That one shows the browser's own dialog with the
 *    browser's own wording — not ours, and deliberately not customisable by
 *    any site. The wording differs, but the choice is the same one.
 *
 * NOT covered: the browser Back button on an in-app history entry. The App
 * Router exposes no navigation-blocking API, and the usual workaround — push a
 * sentinel history entry and re-push it on popstate — corrupts the history
 * stack in ways that are worse than the problem (a Back that silently does
 * nothing, or two presses needed thereafter). Left undone on purpose rather
 * than done badly.
 *
 * `enabled` is separate from `when` so the two questions stay distinct: `when`
 * is "is there work to lose", `enabled` is "does this organizer want to be
 * asked". The latter comes from `profiles.warn_unsaved_changes` via context, so
 * no editor has to thread it down; the prop is an explicit override for tests
 * and for any caller that must force the answer.
 *
 * `title`/`body`/`leaveLabel` and the optional `action` exist because the form
 * builder is asking a different question. It autosaves its draft, so nothing is
 * ever *lost* there — what is at stake is that the edits are not live until
 * they are published, which wants a third button rather than reworded copy.
 * `action.run` may be async and returns false to keep the dialog open (a failed
 * publish must not then navigate away from the thing that failed).
 */
export function UnsavedChangesGuard({
  when,
  enabled,
  title,
  body,
  leaveLabel,
  action = null,
}) {
  const t = useTranslations('console')
  const router = useRouter()
  const preferred = useUnsavedWarningEnabled()
  const [target, setTarget] = useState(null)
  const [running, setRunning] = useState(false)
  const armed = Boolean(when) && (enabled ?? preferred)

  // The click listener is registered once per armed/disarmed transition, but
  // reads `armed` through a ref so a keystroke that flips `dirty` mid-session
  // never has to tear the listener down and rebuild it.
  const armedRef = useRef(armed)
  armedRef.current = armed

  useEffect(() => {
    if (!armed) return
    const onBeforeUnload = (event) => {
      event.preventDefault()
      // Chrome still wants returnValue set; every browser ignores its content.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [armed])

  useEffect(() => {
    const onClick = (event) => {
      if (!armedRef.current) return
      // Anything that isn't a plain left-click opens elsewhere (new tab, new
      // window, download) and leaves this page — and its state — untouched.
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target?.closest?.('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(anchor.href, window.location.href)
      // Off-site links unload the document, so beforeunload above already
      // asks — intercepting here too would ask twice for one click.
      if (url.origin !== window.location.origin) return
      // A link to the page we are already on changes nothing to lose.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return
      }

      event.preventDefault()
      // Deliberately no stopPropagation: the mobile menu closes on link
      // clicks, and swallowing the event would leave it open behind the
      // dialog. Cancelling the default is enough to hold the navigation.
      setTarget(url.pathname + url.search + url.hash)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  function go(href) {
    // next/navigation, not lib/i18n/navigation: the href came off a rendered
    // anchor and already carries its locale prefix, which the intl router
    // would add a second time.
    if (href) router.push(href)
  }

  function leave() {
    const href = target
    setTarget(null)
    go(href)
  }

  async function runAction() {
    const href = target
    setRunning(true)
    let ok = false
    try {
      ok = (await action.run()) !== false
    } finally {
      setRunning(false)
    }
    // A failure leaves the dialog open on the page that failed, where the
    // editor's own status line explains why. Navigating away regardless would
    // hide the failure behind the very click that caused it.
    if (!ok) return
    setTarget(null)
    go(href)
  }

  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open && !running) setTarget(null)
      }}
      title={title ?? t('unsavedTitle')}
    >
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{body ?? t('unsavedBody')}</p>
      {/* .dialog-actions rather than inline style: the row has to hold three
          buttons on one line at the dialog's shared width, which takes a
          descendant rule on .btn that an inline style cannot express. */}
      <div className="dialog-actions">
        <Dialog.Close asChild>
          <Button variant="ghost" type="button" disabled={running}>
            {t('unsavedStay')}
          </Button>
        </Dialog.Close>
        <Button variant="danger" type="button" onClick={leave} disabled={running}>
          {leaveLabel ?? t('unsavedLeave')}
        </Button>
        {action && (
          <Button type="button" onClick={runAction} disabled={running}>
            {running ? (action.busyLabel ?? action.label) : action.label}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
