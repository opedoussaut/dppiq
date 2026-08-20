import baseWorker from './worker-recognition.js'
import { handleStagedIntelligence } from './staged-intelligence.js'

const FAST_VERSION = '0.5.0-staged-intelligence-dev'
const FAST_VISION_MODEL = '@cf/moondream/moondream3.1-9B-A2B'
const TOTAL_MODEL_BUDGET_MS = 2800
const CAPTION_BUDGET_MS = 1500

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

  if (!first || /unknown|cannot|unclear|unsure|not enough|unable to/i.test(first)) return null
  const generic = first
    .replace(/^(this is|it is|a photo of|an image of|the image shows|the photo shows|a pair of|a|an)\s+/i, '')
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

function deadline(ms, code = 'FAST_VISION_TIMEOUT') {
  return new Promise((_, reject) => {
    const error = new Error(`Fast vision deadline exceeded after ${ms} ms`)
    error.code = code
    setTimeout(() => reject(error), ms)
  })
}

function resultText(result) {
  const payload = result?.result || result || {}
  return String(
    payload?.caption ||
    payload?.answer ||
    payload?.response ||
    payload?.text ||
    result?.caption ||
    result?.answer ||
    result?.response ||
    result?.text ||
    '',
  ).trim()
}

async function runCaption(env, image, budgetMs) {
  return Promise.race([
    env.AI.run(FAST_VISION_MODEL, {
      task: 'caption',
      image,
      caption_length: 'short',
      temperature: 0,
      max_tokens: 24,
      stream: false,
    }),
    deadline(budgetMs, 'FAST_CAPTION_TIMEOUT'),
  ])
}

async function runQuery(env, image, budgetMs) {
  return Promise.race([
    env.AI.run(FAST_VISION_MODEL, {
      task: 'query',
      image,
      question: 'Name the generic physical product family in this image. Answer with only 2 to 5 words. No brand, no model, no explanation.',
      reasoning: false,
      temperature: 0,
      max_tokens: 18,
      stream: false,
    }),
    deadline(budgetMs, 'FAST_QUERY_TIMEOUT'),
  ])
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
  const attempts = []

  let captionText = ''
  let queryText = ''
  let family = null

  try {
    const captionResult = await runCaption(env, image, CAPTION_BUDGET_MS)
    captionText = resultText(captionResult)
    attempts.push({ skill: 'caption', text: captionText.slice(0, 160) })
    family = classify(captionText)
  } catch (error) {
    attempts.push({ skill: 'caption', error: String(error?.code || error?.message || 'caption_failed') })
  }

  if (!family) {
    const elapsed = Date.now() - inferenceStarted
    const remaining = Math.max(0, TOTAL_MODEL_BUDGET_MS - elapsed)
    if (remaining >= 350) {
      try {
        const queryResult = await runQuery(env, image, remaining)
        queryText = resultText(queryResult)
        attempts.push({ skill: 'query', text: queryText.slice(0, 160) })
        family = classify(queryText)
      } catch (error) {
        attempts.push({ skill: 'query', error: String(error?.code || error?.message || 'query_failed') })
      }
    }
  }

  const inference_ms = Date.now() - inferenceStarted
  const elapsed_ms = Date.now() - started
  const description = queryText || captionText

  if (!family) {
    return Response.json({
      version: FAST_VERSION,
      model: FAST_VISION_MODEL,
      elapsed_ms,
      inference_ms,
      identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
      description,
      attempts,
      diagnostic_code: inference_ms >= TOTAL_MODEL_BUDGET_MS - 50 ? 'FAST_RECOGNITION_TIMEOUT' : 'FAST_RECOGNITION_NO_MATCH',
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
      recognition_mode: queryText ? 'moondream31_query_fallback' : 'moondream31_short_caption_fast_path',
    },
    description,
    attempts,
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/api/scan/fast-identify') {
      try {
        return await fastIdentify(request, env)
      } catch (error) {
        console.warn('REGIQ Moondream fast recognition failed', String(error?.message || error))
        return Response.json({
          version: FAST_VERSION,
          model: FAST_VISION_MODEL,
          elapsed_ms: TOTAL_MODEL_BUDGET_MS,
          identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
          diagnostic_code: 'FAST_RECOGNITION_UNAVAILABLE',
        }, { status: 200 })
      }
    }

    const staged = await handleStagedIntelligence(request, env)
    if (staged) return staged

    return baseWorker.fetch(request, env, ctx)
  },
}
