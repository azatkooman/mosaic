// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => ({}) }))

const { ColorField } = await import('./FormAppearancePanel')

afterEach(cleanup)

const field = (props) => (
  <ColorField label="Accent" fallback="#2c6e5a" clearLabel="Clear" onChange={() => {}} {...props} />
)
const swatch = () => screen.getByLabelText('Accent')

describe('form appearance ColorField', () => {
  it('shows the inherited colour while unset, with no Clear button', () => {
    render(field())
    expect(swatch().value).toBe('#2c6e5a')
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('applies a picked colour straight away', () => {
    const onChange = vi.fn()
    render(field({ onChange }))
    fireEvent.input(swatch(), { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith('#ff0000')
    expect(swatch().value).toBe('#ff0000')
  })

  it('clears back to inheriting', () => {
    const onChange = vi.fn()
    render(field({ onChange, value: '#123456' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('follows the value when it changes from outside, and the fallback once cleared', () => {
    const { rerender } = render(field({ value: '#123456' }))
    rerender(field({ value: '#abcdef' }))
    expect(swatch().value).toBe('#abcdef')
    rerender(field({ value: undefined }))
    expect(swatch().value).toBe('#2c6e5a')
    rerender(field({ value: undefined, fallback: '#000000' }))
    expect(swatch().value).toBe('#000000')
  })

  it('keeps showing the picked colour if the parent has not caught up yet', () => {
    const { rerender } = render(field({ value: '#123456' }))
    fireEvent.input(swatch(), { target: { value: '#ff0000' } })
    rerender(field({ value: '#123456' }))
    expect(swatch().value).toBe('#ff0000')
  })
})
