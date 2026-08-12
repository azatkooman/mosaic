import { describe, it, expect } from 'vitest'
import {
  appearanceVars,
  introTextFor,
  pruneQuestionStyles,
  questionVars,
  resolveFormAppearance,
  showsBackLink,
  showsLanguagePicker,
  showsProgress,
  titleStyle,
} from './form-appearance'

describe('resolveFormAppearance', () => {
  it('inherits the event page theme where the form sets nothing', () => {
    const r = resolveFormAppearance({}, { page_bg: '#102030', text_scale: 'large' })
    expect(r.theme.page_bg).toBe('#102030')
    expect(r.theme.text_scale).toBe('large')
  })

  it("lets the form's own value win", () => {
    const r = resolveFormAppearance(
      { theme: { page_bg: '#ffffff' } },
      { page_bg: '#102030', title_color: '#ff0000' }
    )
    expect(r.theme.page_bg).toBe('#ffffff')
    // …without dropping the keys it did not override.
    expect(r.theme.title_color).toBe('#ff0000')
  })

  it('treats an emptied value as unset, so clearing a colour inherits again', () => {
    const r = resolveFormAppearance({ theme: { page_bg: '' } }, { page_bg: '#102030' })
    expect(r.theme.page_bg).toBe('#102030')
  })

  it('inherits only the keys the two surfaces share', () => {
    // The event page carries a pile of settings a form has no use for. Letting
    // them through would put hero and language-switcher colours into a form's
    // resolved theme, where the next person to read it would reasonably assume
    // something renders them.
    const r = resolveFormAppearance({}, { lang_bg: '#000', accent_color: '#111', btn_bg: '#222' })
    expect(r.theme).toEqual({})
  })

  it('survives null on both sides', () => {
    expect(resolveFormAppearance(null, null).theme).toEqual({})
  })
})

describe('appearanceVars', () => {
  it('emits nothing for an untouched form', () => {
    // The point being that an unstyled form renders byte-identically to how it
    // rendered before any of this existed.
    expect(appearanceVars(resolveFormAppearance({}, {}))).toEqual({})
  })

  it('rewrites whole token families for a scale, not one font-size', () => {
    const vars = appearanceVars({ theme: { text_scale: 'large' } })
    // rem tokens ignore a font-size on an ancestor, so each one has to move.
    expect(vars['--text-sm']).toBe('1.006rem')
    expect(vars['--text-3xl']).toBe('2.731rem')
  })

  it('leaves the tokens alone at normal', () => {
    expect(appearanceVars({ theme: { text_scale: 'normal', radius: 'normal' } })).toEqual({})
  })

  it("understands the EVENT PAGE's vocabulary, since that is what it inherits", () => {
    // A form-only vocabulary would silently ignore an inherited value. These
    // three words come from the event page editor's own selects.
    expect(appearanceVars({ theme: { text_scale: 'compact' } })['--text-md']).toBe('0.9rem')
    expect(appearanceVars({ theme: { radius: 'square' } })['--r-md']).toBe('0px')
    expect(appearanceVars({ theme: { density: 'spacious' } })['--s-4']).toBe('1.3rem')
  })

  it('derives a distinguishable hover from the primary colour', () => {
    const vars = appearanceVars({ theme: { primary_color: '#3366cc' } })
    expect(vars['--pine']).toBe('#3366cc')
    expect(vars['--pine-deep']).not.toBe('#3366cc')
    // accent-color is inherited as a computed value from :root, so overriding
    // --pine alone would never reach a native checkbox.
    expect(vars.accentColor).toBe('#3366cc')
  })

  it('maps a font KEY to a family rather than storing the family', () => {
    const vars = appearanceVars({ theme: { body_font: 'serif' } })
    expect(vars['--font-body']).toContain('Georgia')
    expect(appearanceVars({ theme: { body_font: 'not-a-font' } })['--font-body']).toBeUndefined()
  })

  it('sets the container width token rather than a width', () => {
    expect(appearanceVars({ theme: { width: 'narrow' } })['--container-narrow']).toBe('34rem')
    expect(appearanceVars({ theme: { width: 'normal' } })['--container-narrow']).toBeUndefined()
  })
})

describe('questionVars', () => {
  const resolved = {
    questions: {
      defaults: { label_color: '#111111' },
      byType: { select: { label_color: '#222222', label_size: 'lg' } },
      byId: { q9: { label_color: '#333333' } },
    },
  }

  it('resolves this question → its type → the defaults', () => {
    expect(questionVars(resolved, { id: 'q1', type: 'text' })['--q-label-color']).toBe('#111111')
    expect(questionVars(resolved, { id: 'q2', type: 'select' })['--q-label-color']).toBe('#222222')
    expect(questionVars(resolved, { id: 'q9', type: 'select' })['--q-label-color']).toBe('#333333')
  })

  it('keeps the parts of a type rule the question does not override', () => {
    // q9 sets only a colour, so it must still get the type's size — otherwise
    // touching one control would silently discard the other.
    expect(questionVars(resolved, { id: 'q9', type: 'select' })['--q-label-size']).toBe('1.25rem')
  })

  it('emits nothing when nothing is styled', () => {
    expect(questionVars({}, { id: 'q1', type: 'text' })).toEqual({})
  })
})

describe('pruneQuestionStyles', () => {
  it('drops overrides whose question is gone', () => {
    const a = { questions: { byId: { q1: { label_color: '#fff' }, gone: { label_color: '#000' } } } }
    expect(pruneQuestionStyles(a, ['q1']).questions.byId).toEqual({ q1: { label_color: '#fff' } })
  })

  it('returns the SAME object when there is nothing to drop', () => {
    // Identity matters: the caller compares by reference to decide whether a
    // save is a real change, so manufacturing a new object every time would
    // make every visit look like an edit.
    const a = { questions: { byId: { q1: {} } } }
    expect(pruneQuestionStyles(a, ['q1'])).toBe(a)
    const b = { theme: {} }
    expect(pruneQuestionStyles(b, [])).toBe(b)
  })
})

describe('zone flags', () => {
  it('all default to on, so an unstyled form is the screen that existed before', () => {
    for (const value of [undefined, {}, { header: {} }]) {
      expect(showsBackLink(value)).toBe(true)
      expect(showsLanguagePicker(value)).toBe(true)
      expect(showsProgress(value)).toBe(true)
    }
  })

  it('only an explicit false hides one', () => {
    expect(showsBackLink({ header: { show_back: false } })).toBe(false)
    expect(showsLanguagePicker({ header: { show_language: false } })).toBe(false)
    expect(showsProgress({ nav: { progress: 'none' } })).toBe(false)
  })
})

describe('introTextFor', () => {
  const intro = { enabled: true, text: { en: 'Welcome', fr: 'Bienvenue' } }

  it('reads the language asked for, falling back to the event default', () => {
    expect(introTextFor({ intro }, 'fr', 'en')).toBe('Bienvenue')
    expect(introTextFor({ intro }, 'ru', 'en')).toBe('Welcome')
  })

  it('shows nothing when switched off, empty, or whitespace', () => {
    expect(introTextFor({ intro: { ...intro, enabled: false } }, 'en', 'en')).toBeNull()
    expect(introTextFor({ intro: { enabled: true } }, 'en', 'en')).toBeNull()
    expect(introTextFor({ intro: { enabled: true, text: { en: '   ' } } }, 'en', 'en')).toBeNull()
    expect(introTextFor({}, 'en', 'en')).toBeNull()
  })
})

describe('titleStyle', () => {
  it('is undefined rather than an empty object when unset', () => {
    // So spreading it into a style prop adds nothing at all.
    expect(titleStyle({})).toBeUndefined()
    expect(titleStyle({ theme: { title_color: '#abcdef' } })).toEqual({ color: '#abcdef' })
  })
})

describe('readable ink', () => {
  it('darkens the text on a pale page and lightens it on a dark one', () => {
    expect(appearanceVars({ theme: { page_bg: '#fff4e0' } })['--ink']).toBe('#20242b')
    expect(appearanceVars({ theme: { page_bg: '#14161b' } })['--ink']).toBe('#f4f2ec')
  })

  it('never overrides a colour the organizer chose', () => {
    const vars = appearanceVars({ theme: { page_bg: '#fff4e0', text_color: '#8a2f5f' } })
    expect(vars['--ink']).toBe('#8a2f5f')
  })

  it('leaves ink alone when there is no background to judge against', () => {
    // Nothing here can know what the text will sit on, so guessing would be
    // worse than the viewer's own theme.
    expect(appearanceVars({ theme: { radius: 'round' } })['--ink']).toBeUndefined()
  })

  it('ignores a malformed colour rather than emitting nonsense', () => {
    expect(appearanceVars({ theme: { page_bg: 'rebeccapurple' } })['--ink']).toBeUndefined()
  })
})
