import baseWorker from './worker-recognition.js'

const FAST_VERSION = '0.3.0-moondream-caption-deadline-dev'
const FAST_VISION_MODEL = '@cf/moondream/moondream3.1-9B-A2B'
const MODEL_DEADLINE_MS = 2500

const PRODUCT_HINTS = [
  ['over-ear headphones', 'headphones', /\b(over[- ]?ear|circumaural|headphone|headset)s?\b/i],
  ['earbuds', 'earbuds', /\b(earbud|earphone|in[- ]?ear)s?\b/i],
  ['smartphone', 'smartphone', /\b(smartphone|mobile phone|cell phone|handset)\b/i],
  ['laptop computer', 'laptop', /\b(laptop|notebook computer|portable computer)\b/i],
  ['computer server', 'server', /\b(server|rack server|blade server)\b/i],
  ['folding multi-tool', 'multi_tool', /\b(multi[- ]?tool|multitool|folding tool|swiss army|pocket tool)\b/i],
  ['eyeglasses', 'eyewear', /\b(eyeglasses?|spectacles?|glasses frame|pair of glasses)\b/i],
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
  const value = String(text || '').replace(/[`*_#]/g, ' ').trim()
  for (const [product_type, category, pattern] of PRODUCT_HINTS) {
    if (pattern.test(value)) return { product_type, category, confidence: 0.96 }
  }

  const first = value
    .split(/[\n.!?]/)
    .map(v => v.trim())
    .find(Boolean)

  if (!first || /unknown|cannot|unclear|unsure|not enough/i.test(first)) return null
  const generic = first
    .replace(/^(this is|it is|a photo of|an image of|the image shows|a|an)\s+/i, '')
    .trim()
    .slice(0, 72)
  if (!generic || generic.split(/\s+/).length > 8) return null

  return {
    product_type: generic,
    category: generic.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other',
    confidence: 0.78,
  }
}

function toDataUri(file, bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`
}

function deadline(ms) {
  return new Promise((_, reject) => {
    const error = new Error(`Fast vision deadline exceeded after ${ms} ms`)
    error.code = 'FAST_VISION_TIMEOUT'
    setTimeout(() => reject(error), ms)
  })
}

async function fastIdentify(request, env) {
  const started = Date.now()
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ detail: 'Image file is required.' }, { status: 400 })
  if (file.size > 4 * 1024 * 1024) return Response.json({ detail: 'Fast image exceeds the 4 MB limit.' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const image = toDataUri(file, bytes)
  const inferenceStarted = Date.now()

  const result = await Promise.race([
    env.AI.run(FAST_VISION_MODEL, {
      task: 'caption',
      image,
      caption_length: 'short',
      temperature: 0,
      max_tokens: 24,
      stream: false,
    }),
    deadline(MODEL_DEADLINE_MS),
  ])

  const inference_ms = Date.now() - inferenceStarted
  const answer = String(result?.caption || result?.answer || result?.response || result?.text || '').trim()
  const family = classify(answer)
  const elapsed_ms = Date.now() - started

  if (!family) {
    return Response.json({
      version: FAST_VERSION,
      model: FAST_VISION_MODEL,
      elapsed_ms,
      inference_ms,
      identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
      description: answer,
    })
  }

  return Response.json({
    version: FAST_VERSION,
    model: FAST_VISION_MODEL,
    elapsed_ms,
    inference_ms,
    identification: {
      status: 'identified',
      product_type: family.product_type,
      category: family.category,
      confidence: family.confidence,
      recognition_mode: 'moondream31_short_caption_fast_path',
    },
    description: answer,
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/api/scan/fast-identify') {
      try {
        return await fastIdentify(request, env)
      } catch (error) {
        const timedOut = error?.code === 'FAST_VISION_TIMEOUT'
        console.warn('REGIQ Moondream fast recognition failed', String(error?.message || error))
        return Response.json({
          version: FAST_VERSION,
          model: FAST_VISION_MODEL,
          elapsed_ms: MODEL_DEADLINE_MS,
          identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
          diagnostic_code: timedOut ? 'FAST_RECOGNITION_TIMEOUT' : 'FAST_RECOGNITION_UNAVAILABLE',
        }, { status: 200 })
      }
    }
    return baseWorker.fetch(request, env, ctx)
  },
}
