import legacyWorker from './worker.js'

const PRIMARY_VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'
const TEXT_MODEL = '@cf/zai-org/glm-4.7-flash'

const FAMILY_RULES = [
  ['over-ear headphones', 'headphones', /\b(over[- ]?ear|circumaural|headphones?|headsets?)\b/i],
  ['earbuds', 'earbuds', /\b(earbuds?|earphones?|in[- ]?ear)\b/i],
  ['folding multi-tool', 'multi_tool', /\b(multi[- ]?tool|multitool|folding tool|pocket tool|swiss army)\b/i],
  ['eyeglasses', 'eyewear', /\b(eyeglasses?|spectacles?|glasses frame|pair of glasses)\b/i],
  ['smartphone', 'smartphone', /\b(smartphone|mobile phone|cell phone|handset)\b/i],
  ['laptop computer', 'laptop', /\b(laptop|notebook computer|portable computer)\b/i],
  ['computer server', 'server', /\b(server|rack server|blade server)\b/i],
  ['desktop computer', 'desktop_computer', /\b(desktop computer|computer tower)\b/i],
  ['computer monitor', 'monitor', /\b(computer monitor|display monitor|lcd monitor|oled monitor)\b/i],
  ['keyboard', 'keyboard', /\bkeyboard\b/i],
  ['computer mouse', 'computer_mouse', /\b(computer mouse|wireless mouse)\b/i],
  ['wireless router', 'router', /\b(router|wi[- ]?fi router|wireless router)\b/i],
  ['network switch', 'network_switch', /\b(network switch|ethernet switch)\b/i],
  ['speaker', 'speaker', /\b(bluetooth speaker|loudspeaker|portable speaker|speaker)\b/i],
  ['camera', 'camera', /\b(digital camera|mirrorless camera|dslr|camera body)\b/i],
  ['television', 'television', /\b(television|smart tv|tv set)\b/i],
  ['power bank', 'power_bank', /\b(power bank|portable charger|battery pack)\b/i],
  ['electric vehicle battery', 'battery_ev', /\b(ev battery|traction battery|electric vehicle battery)\b/i],
  ['battery', 'battery', /\b(battery|accumulator|cell pack)\b/i],
  ['plastic beverage bottle', 'plastic_beverage_bottle', /\b(plastic|pet)\b[\s\S]{0,50}\b(bottle|beverage|water|drink)\b|\bplastic bottle\b/i],
  ['beverage bottle', 'beverage_bottle', /\b(beverage bottle|water bottle|drink bottle)\b/i],
  ['power drill', 'power_tool', /\b(power drill|cordless drill|electric drill)\b/i],
  ['hand tool', 'hand_tool', /\b(screwdriver|pliers|wrench|spanner|hand tool)\b/i],
  ['led lamp', 'led_lamp', /\b(led lamp|led bulb|light bulb|lamp)\b/i],
  ['electronic toy', 'electronic_toy', /\b(electronic toy|toy robot|remote control toy)\b/i],
  ['garment', 'textile_garment', /\b(shirt|t-shirt|jacket|trousers?|pants|dress|garment|clothing)\b/i],
  ['printed circuit board', 'pcb', /\b(printed circuit board|circuit board|pcb|electronic board)\b/i],
  ['charger', 'charger', /\b(wall charger|usb charger|power adapter|ac adapter|charger)\b/i],
  ['cable', 'cable', /\b(usb cable|power cable|charging cable|electrical cable|cable)\b/i],
]

function classifyDescription(text) {
  const source = String(text || '')
  for (const [product_type, category, pattern] of FAMILY_RULES) {
    if (pattern.test(source)) return { product_type, category }
  }
  return null
}

function markdownText(result) {
  const item = Array.isArray(result) ? result[0] : result
  if (!item || item.format === 'error') return ''
  return String(item.data || '').trim()
}

async function describeWithCloudflare(env, file) {
  try {
    const buffer = await file.arrayBuffer()
    const result = await env.AI.toMarkdown(
      {
        name: file.name || 'regiq-product.jpg',
        blob: new Blob([buffer], { type: file.type || 'image/jpeg' }),
      },
      {
        conversionOptions: {
          output: { format: 'text' },
          image: { descriptionLanguage: 'en' },
        },
      },
    )
    return markdownText(result)
  } catch (error) {
    console.warn('REGIQ object-description pass failed', String(error?.message || error))
    return ''
  }
}

async function classifyDescriptionWithTextModel(env, description) {
  if (!description) return null
  try {
    const response = await env.AI.run(TEXT_MODEL, {
      messages: [
        {
          role: 'system',
          content: 'Return only a short generic physical product family. Never return a brand or model. Examples: over-ear headphones, folding multi-tool, smartphone, laptop computer, battery, computer server, plastic beverage bottle, eyeglasses. If uncertain return UNKNOWN.',
        },
        { role: 'user', content: `What generic physical product is described here?\n${description.slice(0, 2500)}` },
      ],
      temperature: 0,
      max_tokens: 40,
    })
    const raw = typeof response === 'string'
      ? response
      : String(response?.response || response?.result || response?.text || response?.output_text || '')
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[`*_#]/g, '').trim()
    if (!cleaned || /unknown|cannot determine|uncertain/i.test(cleaned)) return null
    const known = classifyDescription(cleaned)
    if (known) return known
    const generic = cleaned.split(/[\n.!?]/)[0].trim().slice(0, 80)
    if (!generic || generic.split(/\s+/).length > 8) return null
    return { product_type: generic, category: generic.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other' }
  } catch (error) {
    console.warn('REGIQ description classifier failed', String(error?.message || error))
    return null
  }
}

function syntheticVisionResult(description, family) {
  return {
    response: JSON.stringify({
      product_type_hint: family.product_type,
      category_hint: family.category,
      family_support_hint: 'strong',
      brand_hint: null,
      model_hint: null,
      objects: [family.product_type],
      visible_text: [],
      logos_or_brand_marks: [],
      observable_features: [`Cloudflare object-description pipeline identified the generic family as ${family.product_type}.`],
      image_quality: 'good',
      ambiguities: [
        'Exact brand and model are not established from generic visual recognition alone.',
        'Hidden technical characteristics must be confirmed separately when they affect regulatory applicability.',
      ],
      plain_observation: description.slice(0, 2200),
    }),
  }
}

function proxyEnvironment(env, injectedVision) {
  let injected = false
  const ai = new Proxy(env.AI, {
    get(target, prop, receiver) {
      if (prop === 'run') {
        return async (model, input, options) => {
          if (!injected && injectedVision && model === PRIMARY_VISION_MODEL) {
            injected = true
            return injectedVision
          }
          return target.run(model, input, options)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === 'AI') return ai
      return Reflect.get(target, prop, receiver)
    },
  })
}

async function recognitionFirstFetch(request, env) {
  const url = new URL(request.url)
  if (request.method !== 'POST' || url.pathname !== '/api/scan/image') {
    return legacyWorker.fetch(request, env)
  }

  let injectedVision = null
  try {
    const clone = request.clone()
    const form = await clone.formData()
    const file = form.get('file')
    if (file instanceof File) {
      const description = await describeWithCloudflare(env, file)
      if (description) {
        let family = classifyDescription(description)
        if (!family) family = await classifyDescriptionWithTextModel(env, description)
        if (family) {
          console.log('REGIQ recognition-first family', family.product_type)
          injectedVision = syntheticVisionResult(description, family)
        }
      }
    }
  } catch (error) {
    console.warn('REGIQ recognition-first wrapper degraded to legacy vision', String(error?.message || error))
  }

  return legacyWorker.fetch(request, injectedVision ? proxyEnvironment(env, injectedVision) : env)
}

export default {
  async fetch(request, env) {
    return recognitionFirstFetch(request, env)
  },
}
