// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { Portal } from './Portal'

afterEach(cleanup)

describe('Portal', () => {
  it('renders nothing on the server, where there is no <body> to portal into', () => {
    expect(renderToString(<Portal><p>overlay</p></Portal>)).toBe('')
  })

  it('moves its children to the end of <body>, outside the tree that rendered it', () => {
    const { container } = render(
      <div id="host">
        <Portal><p data-testid="overlay">overlay</p></Portal>
      </div>
    )
    const overlay = document.querySelector('[data-testid="overlay"]')
    expect(overlay).not.toBeNull()
    expect(container.contains(overlay)).toBe(false)
    expect(overlay.parentElement).toBe(document.body)
  })

  it('hydrates server markup without a mismatch and then mounts the overlay', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(<Portal><p data-testid="overlay">overlay</p></Portal>)
    document.body.appendChild(host)
    const errors = []
    const origError = console.error
    console.error = (...args) => errors.push(args.join(' '))
    try {
      render(<Portal><p data-testid="overlay">overlay</p></Portal>, { container: host, hydrate: true })
    } finally {
      console.error = origError
    }
    expect(errors).toEqual([])
    expect(document.querySelector('[data-testid="overlay"]')).not.toBeNull()
    host.remove()
  })
})
