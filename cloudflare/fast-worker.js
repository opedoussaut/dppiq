import baseWorker from './worker-recognition.js'
import { handleStagedIntelligence } from './staged-intelligence.js'

const FAST_VERSION = '0.6.0-multi-object-dev'
const FAST_VISION_MODEL = '@cf/moondream/moondream3.1-9B-A2B'
const TOTAL_MODEL_BUDGET_MS = 3000
const CAPTION_BUDGET_MS = 1500
const OBJECT_LIST_BUDGET_MS = 2600
const MAX_CANDIDATES = 8

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
  ['computer monitor', 'monitor', /\b(computer monitor|display monitor|lcd monitor|oled monitor|screen)\b/i],
  ['keyboard', 'keyboard', /\bkeyboard\b/i],
  ['computer mouse', 'computer_mouse', /\bcomputer mouse\b|\bwireless mouse\b|\bmouse\b/i],
  ['speaker', 'speaker', /\b(bluetooth speaker|loudspeaker|portable speaker|speaker)\b/i],
  ['camera', 'camera', /\b(digital camera|mirrorless camera|dslr|camera body|camera)\b/i],
  ['power drill', 'power_tool', /\b(power drill|cordless drill|electric drill)\b/i],
  ['printed circuit board', 'pcb', /\b(printed circuit board|circuit board|pcb|electronic board)\b/i],
  ['charger', 'charger', /\b(wall charger|usb charger|power adapter|ac adapter|charger)\b/i],
  ['table', 'table', /\btable\b|\bdesk\b/i],
  ['chair', 'chair', /\bchair\b/i],
  ['lamp', 'lamp', /\blamp\b|\blight fixture\b/i],
  ['backpack', 'backpack', /\bbackpack\b|\brucksack\b/i],
  ['book', 'book', /\bbook\b/i],
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
    confidence: 0.80,
  }
}

function cleanObjectLabel(value) {
  return String(value || '')
    .replace(/```(?:json|text)?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/^\s*(?:object|item|product)\s*[:=-]\s*/i, '')
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseObjectCandidates(text) {
  const raw = String(text || '').trim()
  if (!raw) return []

  let labels = []
  const jsonCandidate = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  try {
    const parsed = JSON.parse(jsonCandidate)
    if (Array.isArray(parsed)) labels = parsed
    else if (Array.isArray(parsed?.objects)) labels = parsed.objects
  } catch {}

  if (!labels.length) {
    labels = raw
      .replace(/```(?:json|text)?/gi, '')
      .replace(/```/g, '')
      .split(/\n|;|,(?=\s*[A-Za-z])/)
  }

  const ignored = /^(person|people|man|woman|human|hand|hands|finger|fingers|face|head|arm|arms|body|background|foreground|wall|walls|floor|ceiling|shadow|reflection|image|photo|picture|scene)$/i
  const seen = new Set()
  const candidates = []

  for (const labelValue of labels) {
    const label = cleanObjectLabel(typeof labelValue === 'string' ? labelValue : labelValue?.name || labelValue?.label || '')
    if (!label || ignored.test(label)) continue
    if (/^(there (is|are)|the image|the photo|visible objects|objects visible)/i.test(label)) continue

    const classified = classify(label)
    if (!classified) continue
    const key = `${classified.category}:${classified.product_type.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      id: `object-${candidates.length + 1}`,
      product_type: classified.product_type,
      category: classified.category,
      confidence: classified.confidence,
      source_label: label.slice(0, 96),
    })
    if (candidates.length >= MAX_CANDIDATES) break
  }

  return candidates
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

async function runObjectList(env, image, budgetMs) {
  return Promise.race([
    env.AI.run(FAST_VISION_MODEL, {
      task: 'query',
      image,
      question: 'List every distinct physical object or manufactured product clearly visible in this image that a user could choose for regulatory analysis. Ignore people, body parts, walls, floors, shadows and reflections. Return only generic object names, one per line, maximum 8. No explanation, no brand, no model.',
      reasoning: false,
      temperature: 0,
      max_tokens: 96,
      stream: false,
    }),
    deadline(budgetMs, 'FAST_OBJECT_LIST_TIMEOUT'),
  ])
}

function primaryFromCaption(captionText, candidates) {
  const captionFamily = classify(captionText)
  if (!captionFamily) return candidates[0] || null
  const exact = candidates.find(candidate => candidate.category === captionFamily.category)
  return exact || { id: 'object-primary', ...captionFamily, source_label: captionText.slice(0, 96) }
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

  const [captionSettled, objectsSettled] = await Promise.allSettled([
    runCaption(env, image, CAPTION_BUDGET_MS),
    runObjectList(env, image, OBJECT_LIST_BUDGET_MS),
  ])

  let captionText = ''
  let objectListText = ''

  if (captionSettled.status === 'fulfilled') {
    captionText = resultText(captionSettled.value)
    attempts.push({ skill: 'caption', text: captionText.slice(0, 160) })
  } else {
    attempts.push({ skill: 'caption', error: String(captionSettled.reason?.code || captionSettled.reason?.message || 'caption_failed') })
  }

  if (objectsSettled.status === 'fulfilled') {
    objectListText = resultText(objectsSettled.value)
    attempts.push({ skill: 'object_list', text: objectListText.slice(0, 320) })
  } else {
    attempts.push({ skill: 'object_list', error: String(objectsSettled.reason?.code || objectsSettled.reason?.message || 'object_list_failed') })
  }

  let candidates = parseObjectCandidates(objectListText)
  const primary = primaryFromCaption(captionText, candidates)

  if (primary && !candidates.some(candidate => candidate.category === primary.category && candidate.product_type === primary.product_type)) {
    candidates = [primary, ...candidates].slice(0, MAX_CANDIDATES)
  }

  const family = primary || candidates[0] || null
  const inference_ms = Date.now() - inferenceStarted
  const elapsed_ms = Date.now() - started
  const description = captionText || objectListText

  if (!family) {
    return Response.json({
      version: FAST_VERSION,
      model: FAST_VISION_MODEL,
      elapsed_ms,
      inference_ms,
      identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
      candidates: [],
      object_count: 0,
      description,
      object_list_text: objectListText,
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
      recognition_mode: candidates.length > 1 ? 'moondream31_multi_object_scan' : 'moondream31_single_object_scan',
    },
    candidates,
    object_count: candidates.length,
    description,
    object_list_text: objectListText,
    attempts,
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method === 'POST' && (url.pathname === '/api/scan/fast-identify' || url.pathname === '/api/scan/fast-detect')) {
      try {
        return await fastIdentify(request, env)
      } catch (error) {
        console.warn('REGIQ Moondream fast recognition failed', String(error?.message || error))
        return Response.json({
          version: FAST_VERSION,
          model: FAST_VISION_MODEL,
          elapsed_ms: TOTAL_MODEL_BUDGET_MS,
          identification: { status: 'unresolved', product_type: null, category: 'other', confidence: 0 },
          candidates: [],
          object_count: 0,
          diagnostic_code: 'FAST_RECOGNITION_UNAVAILABLE',
        }, { status: 200 })
      }
    }

    const staged = await handleStagedIntelligence(request, env)
    if (staged) return staged

    return baseWorker.fetch(request, env, ctx)
  },
}
