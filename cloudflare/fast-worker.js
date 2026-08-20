import baseWorker from './worker-recognition.js'

const FAST_VERSION = '0.1.0-fast-scan-dev'

const PRODUCT_HINTS = [
  ['over-ear headphones', 'headphones', /\b(over[- ]?ear|circumaural|headphone|headset)s?\b/i],
  ['earbuds', 'earbuds', /\b(earbud|in[- ]?ear earphone)s?\b/i],
  ['smartphone', 'smartphone', /\b(smartphone|mobile phone|cell phone|handset)\b/i],
  ['laptop computer', 'laptop', /\b(laptop|notebook computer|portable computer)\b/i],
  ['computer server', 'server', /\b(server|rack server|blade server)\b/i],
  ['folding multi-tool', 'multi_tool', /\b(multi[- ]?tool|multitool|folding tool|swiss army|pocket tool)\b/i],
  ['battery', 'battery', /\b(battery|cell pack|accumulator)\b/i],
  ['plastic beverage bottle', 'plastic_beverage_bottle', /\b(plastic|pet).*\b(bottle|beverage|water|drink)\b|\bplastic bottle\b/i],
  ['beverage bottle', 'beverage_bottle', /\b(beverage|water|drink).*\bbottle\b|\bbottle\b/i],
  ['computer monitor', 'monitor', /\b(computer monitor|display monitor|lcd monitor|oled monitor)\b/i],
  ['keyboard', 'keyboard', /\bkeyboard\b/i],
  ['computer mouse', 'computer_mouse', /\bcomputer mouse\b|\bwireless mouse\b/i],
  ['speaker', 'speaker', /\b(bluetooth speaker|loudspeaker|portable speaker|speaker)\b/i],
  ['camera', 'camera', /\b(digital camera|mirrorless camera|dslr|camera body)\b/i],
  ['power drill', 'power_tool', /\b(power drill|cordless drill|electric drill)\b/i],
  ['printed circuit board', 'pcb', /\b(printed circuit board|circuit board|pcb|electronic board)\b/i],
  ['charger', 'charger', /\b(wall charger|usb charger|power adapter|ac adapter|charger)\b/i],
]

function classify(text) {
  const value = String(text || '')
  for (const [product_type, category, pattern] of PRODUCT_HINTS) {
    if (pattern.test(value)) return { product_type, category }
  }
  const firstLine = value.split(/\n+/).map(v => v.trim()).find(Boolean)
  return firstLine ? { product_type: firstLine.slice(0, 90), category: 'other' } : null
}

async function fastIdentify(request, env) {
  const started = Date.now()
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ detail: 'Image file is required.' }, { status: 400 })

  const converted = await env.AI.toMarkdown(
    {
      name: file.name || 'scan.jpg',
      blob: new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' }),
    },
    {
      conversionOptions: {
        output: { format: 'text' },
        image: { descriptionLanguage: 'en' },
      },
    },
  )

  const result = Array.isArray(converted) ? converted[0] : converted
  const description = result?.data || ''
  const family = classify(description)
  const elapsed_ms = Date.now() - started

  if (!family) {
    return Response.json({
      version: FAST_VERSION,
      elapsed_ms,
      identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
      description,
    })
  }

  return Response.json({
    version: FAST_VERSION,
    elapsed_ms,
    identification: {
      status: 'identified',
      product_type: family.product_type,
      category: family.category,
      confidence: family.category === 'other' ? 0.65 : 0.92,
      recognition_mode: 'cloudflare_tomarkdown_object_description_fast_path',
    },
    description,
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/api/scan/fast-identify') {
      try {
        return await fastIdentify(request, env)
      } catch (error) {
        console.warn('REGIQ fast recognition failed', String(error?.message || error))
        return Response.json({
          version: FAST_VERSION,
          identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
          diagnostic_code: 'FAST_RECOGNITION_UNAVAILABLE',
        }, { status: 200 })
      }
    }
    return baseWorker.fetch(request, env, ctx)
  },
}
