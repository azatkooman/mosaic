import { describe, it, expect } from 'vitest'
import {
  appearanceVars,
  formSurfaceStyle,
  headerBand,
  introStyle,
  introTextFor,
  progressStyle,
  pruneQuestionStyles,
  questionVars,
  readableInk,
  resolveFormAppearance,
  screenBackgroundStyle,
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

  it('keeps the background opacity as the form’s own, never inherited', () => {
    // The event page's background is opaque and has no opacity to hand down,
    // so this is only ever the form's own treatment of whatever colour it gets.
    const r = resolveFormAppearance({ theme: { page_bg_opacity: 40 } }, { page_bg: '#102030' })
    expect(r.theme.page_bg).toBe('#102030')
    expect(r.theme.page_bg_opacity).toBe(40)
    // Nothing on the event page can set it.
    expect(resolveFormAppearance({}, { page_bg: '#102030', page_bg_opacity: 20 }).theme.page_bg_opacity)
      .toBeUndefined()
  })

  it('keeps a zero opacity, which is a choice and not an empty field', () => {
    expect(resolveFormAppearance({ theme: { page_bg_opacity: 0 } }, {}).theme.page_bg_opacity).toBe(0)
  })

  it("carries the header image through as the form's own, unresolved", () => {
    const r = resolveFormAppearance({ header: { bg_image_path: 'evt/form-header-a.jpg' } }, {})
    expect(r.header.bg_image_path).toBe('evt/form-header-a.jpg')
  })

  it("inherits the event page's hero colour and opacity into the header", () => {
    const r = resolveFormAppearance({}, { hero_bg: '#0e5044', hero_opacity: 60 })
    expect(r.header.bg_color).toBe('#0e5044')
    expect(r.header.bg_opacity).toBe(60)
  })

  it("lets the form's own header colour win, with its own opacity", () => {
    // The pair travels together: a form that picks its own colour must not
    // keep an opacity left over from the event colour it just replaced.
    const r = resolveFormAppearance(
      { header: { bg_color: '#ffffff' } },
      { hero_bg: '#0e5044', hero_opacity: 20 }
    )
    expect(r.header.bg_color).toBe('#ffffff')
    expect(r.header.bg_opacity).toBe(100)
  })

  it('treats a cleared header colour as unset, so it inherits again', () => {
    const r = resolveFormAppearance({ header: { bg_color: '' } }, { hero_bg: '#0e5044' })
    expect(r.header.bg_color).toBe('#0e5044')
  })

  it('leaves the header colour absent when neither side has one', () => {
    const r = resolveFormAppearance({ header: { show_back: false } }, {})
    expect(r.header.bg_color).toBeUndefined()
    expect(r.header.bg_opacity).toBeUndefined()
    expect(r.header.show_back).toBe(false)
  })

  it('does NOT inherit an event cover into the header', () => {
    // The panel's "use the event cover" button copies the path in explicitly.
    // Inheriting it here instead would put a hero photo behind the header of
    // every form on every event that has a cover, without anyone asking — and
    // there would be no way to switch it back off, because absent is exactly
    // what the resolver would be treating as "yes please".
    const r = resolveFormAppearance({}, { page_bg: '#102030', cover_image_path: 'evt/cover.jpg' })
    expect(r.header.bg_image_path).toBeUndefined()
    expect(r.theme.page_bg).toBe('#102030')
  })

  it('reads a removed image as no image', () => {
    // The panel deletes the key rather than nulling it; a stored null from any
    // other writer must land in the same place, since eventMediaUrl(null) and
    // eventMediaUrl(undefined) both yield no URL and the band is skipped.
    expect(resolveFormAppearance({ header: {} }, {}).header.bg_image_path).toBeUndefined()
    expect(resolveFormAppearance({ header: { bg_image_path: null } }, {}).header.bg_image_path)
      .toBeNull()
  })

  it('keeps the other header flags alongside an image', () => {
    const r = resolveFormAppearance(
      { header: { bg_image_path: 'evt/x.jpg', show_back: false } },
      {}
    )
    expect(showsBackLink(r)).toBe(false)
    expect(r.header.bg_image_path).toBe('evt/x.jpg')
  })
})

describe('screenBackgroundStyle', () => {
  const screen = (background) => screenBackgroundStyle(resolveFormAppearance({ background }, {}))

  it('paints nothing until an organizer picks something', () => {
    // Undefined, not {}: the caller renders the layer either way, and an
    // element with no style is invisible — so an untouched form shows the
    // platform's own paper exactly as it always has.
    expect(screen(undefined)).toBeUndefined()
    expect(screen({})).toBeUndefined()
    expect(screenBackgroundStyle(null)).toBeUndefined()
  })

  it('paints a solid colour', () => {
    expect(screen({ kind: 'solid', color: '#1e1a5e' })).toEqual({ background: '#1e1a5e' })
  })

  it('paints nothing for a kind that has no settings yet', () => {
    // Selectable so the choice is visible while they are designed; the panel
    // says as much, which is the difference between unfinished and broken.
    expect(screen({ kind: 'image' })).toBeUndefined()
    expect(screen({ kind: 'gradient' })).toBeUndefined()
  })

  it('needs the kind AND the colour, so a stale colour cannot leak back', () => {
    // Switching to None clears the colour in the panel, but a form stored
    // before that, or edited by anything else, must not start painting again
    // just because a colour is still sitting in the JSON.
    expect(screen({ color: '#1e1a5e' })).toBeUndefined()
    expect(screen({ kind: 'none', color: '#1e1a5e' })).toBeUndefined()
    expect(screen({ kind: 'solid', color: '' })).toBeUndefined()
  })

  it('is the form’s own and never inherited from the event page', () => {
    // The event page's background belongs to a different screen. Inheriting it
    // would put it behind every form on every event, with absent meaning "yes"
    // and so no way to switch it off.
    const r = resolveFormAppearance({}, { page_bg: '#102030', hero_bg: '#0e5044' })
    expect(screenBackgroundStyle(r)).toBeUndefined()
    expect(r.background).toEqual({})
  })
})

describe('formSurfaceStyle', () => {
  const surface = (theme) => formSurfaceStyle(resolveFormAppearance({ theme }, {}))

  it('shapes nothing when the form has no background of its own', () => {
    // No colour means no visible block, so a margin would push the content
    // down to make room for something nobody can see.
    expect(surface({})).toBeUndefined()
    expect(surface({ radius: 'round' })).toBeUndefined()
    expect(formSurfaceStyle(null)).toBeUndefined()
  })

  it('makes a card of the coloured block at every radius but square', () => {
    for (const radius of [undefined, 'normal', 'round']) {
      expect(surface({ page_bg: '#1e1a5e', radius })).toEqual({
        borderRadius: 'var(--r-lg)',
        marginBlock: 'var(--s-5)',
      })
    }
  })

  it('leaves square corners as the flush band they were', () => {
    // Someone who chose square corners did not ask for a floating card, and
    // this is also the shape the screen had before any of it existed.
    expect(surface({ page_bg: '#1e1a5e', radius: 'square' })).toBeUndefined()
  })

  it('defers the corner size to --r-lg rather than resolving it here', () => {
    // appearanceVars already scales that token by the radius factor, so the
    // card follows the Corner Radius control without a second copy of the
    // scale — two copies being how the two would eventually disagree.
    expect(surface({ page_bg: '#fff', radius: 'round' }).borderRadius).toBe('var(--r-lg)')
    expect(appearanceVars({ theme: { radius: 'round' } })['--r-lg']).toBe('35px')
  })

  it('inherits the radius from the event page like any other theme key', () => {
    const r = resolveFormAppearance({ theme: { page_bg: '#fff' } }, { radius: 'square' })
    expect(formSurfaceStyle(r)).toBeUndefined()
  })
})

describe('headerBand', () => {
  const band = (appearance, eventTheme, url) =>
    headerBand(resolveFormAppearance(appearance, eventTheme), url)

  it('paints nothing and sets no colour when the organizer set neither', () => {
    const b = band({}, {})
    expect(b.hasBackdrop).toBe(false)
    expect(b.hasImage).toBe(false)
    expect(b.style).toBeUndefined()
  })

  it('follows the URL the caller resolved, not the stored path', () => {
    // Only the caller can turn a path into a URL, so a band that read the path
    // could claim an image the page had no way to render.
    const resolved = resolveFormAppearance({ header: { bg_image_path: 'evt/x.jpg' } }, {})
    expect(headerBand(resolved, undefined).hasImage).toBe(false)
    expect(headerBand(resolved, 'https://x/y.jpg').hasImage).toBe(true)
  })

  it('backs the band with the colour when there is no image', () => {
    const b = band({ header: { bg_color: '#0e5044', bg_opacity: 60 } }, {})
    expect(b.hasBackdrop).toBe(true)
    expect(b.style.background).toBe('rgba(14, 80, 68, 0.6)')
    expect(b.overlayStyle).toBeUndefined()
  })

  it('turns the colour into a TINT over an image, as the event hero does', () => {
    const b = band({ header: { bg_color: '#0e5044', bg_opacity: 40 } }, {}, 'https://x/y.jpg')
    // Not on the band, or it would paint over the picture entirely.
    expect(b.style.background).toBeUndefined()
    expect(b.overlayStyle.background).toBe('rgba(14, 80, 68, 0.4)')
  })

  it('takes light ink over an image, where the scrim guarantees a dark surface', () => {
    expect(band({}, {}, 'https://x/y.jpg').style.color).toBe('#f4f2ec')
    // A pale colour laid over the photo at high opacity IS the surface, though.
    const tinted = band({ header: { bg_color: '#fdf9f0', bg_opacity: 90 } }, {}, 'https://x/y.jpg')
    expect(tinted.style.color).toBe('#20242b')
  })

  it('reads ink from the colour composited over the page, not the colour alone', () => {
    // Black at 20% over a cream page is a light surface and needs dark text.
    // Judging '#000000' on its own would call for white — invisible, and only
    // on the registrant's screen.
    const b = band(
      { theme: { page_bg: '#fdf9f0' }, header: { bg_color: '#000000', bg_opacity: 20 } },
      {}
    )
    expect(b.style.color).toBe('#20242b')
    // The same colour at full strength flips it.
    const opaque = band(
      { theme: { page_bg: '#fdf9f0' }, header: { bg_color: '#000000', bg_opacity: 100 } },
      {}
    )
    expect(opaque.style.color).toBe('#f4f2ec')
  })

  it('inherits rather than guesses when a faint colour sits on an unset page', () => {
    // No page colour means light-or-dark mode decides, which a server cannot
    // know. Leaving the colour unset lets the band inherit the page's own ink,
    // which the browser has already resolved correctly.
    const b = band({ header: { bg_color: '#000000', bg_opacity: 20 } }, {})
    expect(b.hasBackdrop).toBe(true)
    expect(b.style.color).toBeUndefined()
  })
})

describe('appearanceVars', () => {
  it('emits nothing for an untouched form', () => {
    // The point being that an unstyled form renders byte-identically to how it
    // rendered before any of this existed.
    expect(appearanceVars(resolveFormAppearance({}, {}))).toEqual({})
  })

  it('leaves the background declaration untouched at full opacity', () => {
    // The raw hex, not an equivalent rgba(): every form stored before the
    // opacity control existed has to keep emitting exactly what it emitted.
    for (const theme of [{ page_bg: '#102030' }, { page_bg: '#102030', page_bg_opacity: 100 }]) {
      const vars = appearanceVars({ theme })
      expect(vars.background).toBe('#102030')
      expect(vars['--surface']).toBe('color-mix(in srgb, #102030 88%, white)')
      expect(vars['--surface-sunken']).toBe('color-mix(in srgb, #102030 94%, black)')
    }
  })

  it('fades the background, and the fields with it', () => {
    const vars = appearanceVars({ theme: { page_bg: '#102030', page_bg_opacity: 40 } })
    expect(vars.background).toBe('rgba(16, 32, 48, 0.4)')
    expect(vars['--paper']).toBe('rgba(16, 32, 48, 0.4)')
    // Mixed from the FADED colour, not the raw one — fields that stayed fully
    // painted over a washed-out page would read as floating on nothing.
    expect(vars['--surface']).toBe('color-mix(in srgb, rgba(16, 32, 48, 0.4) 88%, white)')
    expect(vars['--surface-sunken']).toBe('color-mix(in srgb, rgba(16, 32, 48, 0.4) 94%, black)')
  })

  it('derives ink only while the colour decides it in BOTH light and dark mode', () => {
    const ink = (page_bg_opacity) =>
      appearanceVars({ theme: { page_bg: '#1e1a5e', page_bg_opacity } })['--ink']

    // Still dominant enough that the composite is dark whichever paper is
    // behind it, so light text is right for every viewer.
    expect(ink(80)).toBe('#f4f2ec')
    // 70 is the case a single opacity threshold got wrong: faded, but nowhere
    // near enough for the light paper to lift it — dark text here would sit on
    // a dark form.
    expect(ink(70)).toBe('#f4f2ec')
    // Below that the two papers genuinely need different ink, which means the
    // paper is what is being read against — so hand it back, and each mode's
    // own --ink is already correct for it.
    expect(ink(50)).toBeUndefined()
    expect(ink(15)).toBeUndefined()
    // …and a colour the organizer chose always wins over any of this.
    expect(
      appearanceVars({ theme: { page_bg: '#1e1a5e', page_bg_opacity: 40, text_color: '#8a2f5f' } })['--ink']
    ).toBe('#8a2f5f')
  })

  it('treats 0 as a real opacity rather than as unset', () => {
    const vars = appearanceVars({ theme: { page_bg: '#102030', page_bg_opacity: 0 } })
    expect(vars.background).toBe('rgba(16, 32, 48, 0)')
    expect(vars['--ink']).toBeUndefined()
    // 0 must not be read as "unset" anywhere along the path: resolve, then vars.
    expect(resolveFormAppearance({ theme: { page_bg: '#102030', page_bg_opacity: 0 } }, {})
      .theme.page_bg_opacity).toBe(0)
  })

  it('takes ink from the SCREEN when the form has no colour of its own', () => {
    // The 1.01:1 case: nothing derived ink unless theme.page_bg was set, so a
    // dark screen behind an unstyled form kept light mode's dark text.
    const dark = appearanceVars(
      resolveFormAppearance({ background: { kind: 'solid', color: '#1e1a5e' } }, {})
    )
    expect(dark['--ink']).toBe('#f4f2ec')
    // …and the fields have to follow, or the screen's light ink lands on a
    // platform-white input.
    expect(dark['--surface']).toBe('color-mix(in srgb, #1e1a5e 88%, white)')
    // The form itself is still not painted — the screen layer does that.
    expect(dark.background).toBeUndefined()

    const pale = appearanceVars(
      resolveFormAppearance({ background: { kind: 'solid', color: '#f7efe2' } }, {})
    )
    expect(pale['--ink']).toBe('#20242b')
  })

  it('composites a faded form colour over the screen rather than guessing', () => {
    // With a known screen there is one right answer, so the both-papers hedge
    // does not apply: black at 30% over a cream screen is a pale surface.
    const vars = appearanceVars(
      resolveFormAppearance(
        { theme: { page_bg: '#000000', page_bg_opacity: 30 },
          background: { kind: 'solid', color: '#faf3e6' } },
        {}
      )
    )
    expect(vars['--ink']).toBe('#20242b')
    // The same fade with no screen behind it stays unknowable and inherits.
    expect(
      appearanceVars({ theme: { page_bg: '#000000', page_bg_opacity: 30 } })['--ink']
    ).toBeUndefined()
  })

  it('ignores a screen the form is not actually sitting on', () => {
    // An opaque form colour hides the screen entirely, so the screen must not
    // pull ink toward itself.
    const vars = appearanceVars(
      resolveFormAppearance(
        { theme: { page_bg: '#faf9f6' }, background: { kind: 'solid', color: '#000000' } },
        {}
      )
    )
    expect(vars['--ink']).toBe('#20242b')
  })

  it('treats an image or gradient screen as unknown, not as no screen', () => {
    // Nothing here can reduce a picture to one colour, so these fall back to
    // the same answer they gave before the background zone existed.
    for (const kind of ['image', 'gradient']) {
      expect(appearanceVars(resolveFormAppearance({ background: { kind } }, {}))['--ink'])
        .toBeUndefined()
    }
  })

  it('emits nothing for an untouched form — unless asked to isolate', () => {
    // The default contract is unchanged: one themed element on a page adds no
    // declarations it does not need.
    expect(appearanceVars({ theme: {} })).toEqual({})
    // Isolating is the opposite job: it exists to STOP a value arriving from
    // somewhere, so it has to name every family it manages.
    const iso = appearanceVars({ theme: {} }, { isolate: true })
    expect(iso['--pine']).toBe('var(--base-pine)')
    expect(iso['--font-body']).toBe('"IBM Plex Sans"')
    expect(iso['--text-md']).toBe('1rem')
    expect(iso['--s-4']).toBe('1rem')
    expect(iso['--r-md']).toBe('10px')
    expect(iso['--container-narrow']).toBe('44rem')
  })

  it('isolating never overrides what the form actually set', () => {
    const iso = appearanceVars(
      { theme: { primary_color: '#8a2f5f', text_scale: 'large', radius: 'round', width: 'wide' } },
      { isolate: true }
    )
    expect(iso['--pine']).toBe('#8a2f5f')
    expect(iso['--text-md']).toBe('1.15rem')
    expect(iso['--r-md']).toBe('22px')
    expect(iso['--container-narrow']).toBe('52rem')
    // …and still resets the families it did not set.
    expect(iso['--font-body']).toBe('"IBM Plex Sans"')
  })

  it('isolating leaves ink and surface to inherit, deliberately', () => {
    // A form with no background of its own is genuinely sitting on the outer
    // form's background, so the outer form's ink is the right ink for it.
    // Resetting these would put dark text back on a dark page.
    const iso = appearanceVars({ theme: {} }, { isolate: true })
    expect(iso['--ink']).toBeUndefined()
    expect(iso['--surface']).toBeUndefined()
    expect(iso.background).toBeUndefined()
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

describe('introStyle / progressStyle', () => {
  it('colours the intro blurb and the participant counter independently', () => {
    const r = resolveFormAppearance(
      { intro: { color: '#8a2f5f' }, nav: { progress_color: '#146b5c' } },
      {}
    )
    expect(introStyle(r)).toEqual({ color: '#8a2f5f' })
    expect(progressStyle(r)).toEqual({ color: '#146b5c' })
  })

  it('is undefined rather than an empty object when unset, so both inherit', () => {
    // The intro falls back to the page's --ink and the counter to .eyebrow's
    // gold. Returning {} would still be falsy-free and would override neither,
    // but it would put an empty style object on every register page that has
    // never been customized.
    const r = resolveFormAppearance({}, {})
    expect(introStyle(r)).toBeUndefined()
    expect(progressStyle(r)).toBeUndefined()
    expect(introStyle(null)).toBeUndefined()
    expect(progressStyle(null)).toBeUndefined()
  })

  it('does not inherit either colour from the event page', () => {
    // There is nothing to inherit from: an event page has no intro blurb and no
    // participant counter, so mapping one of its colours onto these would tie
    // them to a choice made for something else.
    const r = resolveFormAppearance({}, { text_color: '#ff0000', title_color: '#00ff00' })
    expect(introStyle(r)).toBeUndefined()
    expect(progressStyle(r)).toBeUndefined()
  })

  it('treats a cleared colour as unset', () => {
    const r = resolveFormAppearance({ intro: { color: '' }, nav: { progress_color: '' } }, {})
    expect(introStyle(r)).toBeUndefined()
    expect(progressStyle(r)).toBeUndefined()
  })

  it('keeps the progress colour beside the flag that hides the line', () => {
    const r = resolveFormAppearance({ nav: { progress: 'none', progress_color: '#146b5c' } }, {})
    expect(showsProgress(r)).toBe(false)
    expect(progressStyle(r)).toEqual({ color: '#146b5c' })
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

  it('switches at the contrast crossover, not at the midpoint of the range', () => {
    // A mid-tone is still a PALE surface as far as contrast goes: #bebbb4
    // scores 1.7:1 against light ink and 8.1:1 against dark. Anything above
    // luminance 0.20 takes dark text, which is a long way below "looks light".
    expect(readableInk('#bebbb4')).toBe('#20242b')
    expect(readableInk('#808080')).toBe('#20242b')
    expect(readableInk('#9aa3ad')).toBe('#20242b')
    // …and a mid-DARK surface still takes light text.
    expect(readableInk('#0e5044')).toBe('#f4f2ec')
    expect(readableInk('#2b2f36')).toBe('#f4f2ec')
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
