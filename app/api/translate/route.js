import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { text, targetLocale, sourceLocale } = await request.json()
    if (!text || !targetLocale) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const sl = sourceLocale || 'auto'
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLocale}&dt=t&q=${encodeURIComponent(text)}`
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Translation API error' }, { status: res.status })
    }

    const data = await res.json()
    if (data && data[0]) {
      const translatedText = data[0].map((x) => x[0]).join('')
      return NextResponse.json({ translation: translatedText })
    }

    return NextResponse.json({ translation: text })
  } catch (error) {
    console.error('Translation route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
