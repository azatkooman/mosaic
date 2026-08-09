import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { QrCodeSvg } from './ParticipantTicket'

/**
 * The previous "QR" was hand-drawn and encoded nothing, so this guards the
 * property that actually matters: what the ticket renders can be scanned.
 * The matrix behind QrCodeSvg is rasterized exactly as drawn (modules plus
 * the 4-module quiet zone) and decoded with the same library the scanner
 * page falls back to.
 */
function rasterize(value, scale = 4) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const quiet = 4
  const dim = (modules.size + quiet * 2) * scale
  const px = new Uint8ClampedArray(dim * dim * 4).fill(255)
  for (let r = 0; r < modules.size; r++) {
    for (let c = 0; c < modules.size; c++) {
      if (!modules.get(r, c)) continue
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const i = (((r + quiet) * scale + y) * dim + (c + quiet) * scale + x) * 4
          px[i] = px[i + 1] = px[i + 2] = 0
        }
      }
    }
  }
  return { px, dim }
}

describe('ticket QR', () => {
  test('encodes a ticket URL that scanners can decode back', () => {
    const url = 'https://mosaic-snowy.vercel.app/t/a1b2c3d4e5f60718293a'
    const { px, dim } = rasterize(url)
    expect(jsQR(px, dim, dim)?.data).toBe(url)
  })

  test('QrCodeSvg renders the module matrix as SVG', () => {
    const html = renderToStaticMarkup(<QrCodeSvg value="https://example.com/t/a1b2c3d4e5f60718293a" />)
    expect(html).toContain('<svg')
    expect(html).toContain('<path')
    // Version 3 QR (29 modules) + 2×4 quiet zone.
    expect(html).toContain('viewBox="0 0 37 37"')
  })
})
