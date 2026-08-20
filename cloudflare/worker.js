import catalog from '../data/regulatory_catalog.json'

const VERSION = '1.4.0-cloudflare-beta'
const PRIMARY_VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'
const FALLBACK_VISION_MODEL = '@cf/google/gemma-4-26b-a4b-it'
const TEXT_MODEL = '@cf/zai-org/glm-4.7-flash'
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function unwrapAI(result) {
  if (result == null) return ''
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return result.map(unwrapAI).filter(Boolean).join('\n')
  const candidates = [
    result.response,
    result.result,
    result.output_text,
    result.output,
    result.text,
    result.message?.content,
    result.choices?.[0]?.message?.content,
    result.choices?.[0]?.text,
  ]
  for (const candidate of candidates) {
    if (candidate == null) continue
    if (typeof candidate === 'string') return candidate
    if (typeof candidate === 'object') return candidate
  }
  return result
}

function balancedJSONObject(text) {
  let start = -1, depth = 0, inString = false, escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') { if (depth === 0) start = i; depth += 1 }
    else if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function extractJSON(raw) {
  const unwrapped = unwrapAI(raw)
  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    if (unwrapped.response && typeof unwrapped.response === 'object') return unwrapped.response
    return unwrapped
  }
  let text = String(unwrapped || '').trim()
  if (!text) return null
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json|javascript|js)?\s*/gi, '').replace(/```/g, '').trim()
  try { return JSON.parse(text) } catch {}
  const candidate = balancedJSONObject(text)
  if (candidate) { try { return JSON.parse(candidate) } catch {} }
  return null
}

function aiText(result) {
  const value = unwrapAI(result)
  return typeof value === 'string' ? value : JSON.stringify(value || '')
}

function normalizeCategory(value) {
  return String(value || 'other').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other'
}

function arr(value, limit = 20) {
  return Array.isArray(value) ? value.filter(v => v != null).map(v => String(v).trim()).filter(Boolean).slice(0, limit) : []
}

function pct(value) {
  return Math.max(0, Math.min(99, Math.round(Number(value || 0))))
}

function compactCatalog() {
  return Object.entries(catalog.acts || {}).map(([id, act]) => ({
    id,
    title: act.title,
    legal_basis: act.legal_basis,
    classification: act.classification,
    status: act.status,
    summary: act.summary,
    source_url: act.source_url,
    source_type: act.source_type,
  }))
}

const PRODUCT_HINTS = [
  ['over-ear headphones', 'headphones', /\b(over[- ]?ear|circumaural)\b.*\b(headphone|headset)|\b(headphone|headset)s?\b/i],
  ['earbuds', 'earbuds', /\b(earbud|in[- ]?ear earphone)s?\b/i],
  ['folding multi-tool', 'multi_tool', /\b(multi[- ]?tool|multitool|folding tool|swiss army|pocket tool)\b/i],
  ['eyeglasses', 'eyewear', /\b(eyeglass|spectacle|glasses frame|pair of glasses)\b/i],
  ['smartphone', 'smartphone', /\b(smartphone|mobile phone|cell phone|handset)\b/i],
  ['laptop computer', 'laptop', /\b(laptop|notebook computer|portable computer)\b/i],
  ['computer server', 'server', /\b(server|rack server|blade server)\b/i],
  ['desktop computer', 'desktop_computer', /\bdesktop computer\b|\bcomputer tower\b/i],
  ['computer monitor', 'monitor', /\b(computer monitor|display monitor|lcd monitor|oled monitor)\b/i],
  ['keyboard', 'keyboard', /\bkeyboard\b/i],
  ['computer mouse', 'computer_mouse', /\bcomputer mouse\b|\bwireless mouse\b/i],
  ['wireless router', 'router', /\b(router|wifi router|wi-fi router|wireless router)\b/i],
  ['network switch', 'network_switch', /\bnetwork switch\b|\bethernet switch\b/i],
  ['speaker', 'speaker', /\b(bluetooth speaker|loudspeaker|portable speaker|speaker)\b/i],
  ['camera', 'camera', /\b(digital camera|mirrorless camera|dslr|camera body)\b/i],
  ['television', 'television', /\b(television|smart tv|tv set)\b/i],
  ['power bank', 'power_bank', /\b(power bank|portable charger|battery pack)\b/i],
  ['battery', 'battery', /\b(battery|cell pack|accumulator)\b/i],
  ['electric vehicle battery', 'battery_ev', /\b(ev battery|traction battery|electric vehicle battery)\b/i],
  ['plastic beverage bottle', 'plastic_beverage_bottle', /\b(plastic|pet)\b.*\b(beverage|water|drink)\b.*\bbottle\b|\bplastic bottle\b/i],
  ['beverage bottle', 'beverage_bottle', /\b(beverage|water|drink)\b.*\bbottle\b|\bbottle\b/i],
  ['power drill', 'power_tool', /\b(power drill|cordless drill|electric drill)\b/i],
  ['hand tool', 'hand_tool', /\b(screwdriver|pliers|wrench|spanner|hand tool)\b/i],
  ['led lamp', 'led_lamp', /\b(led lamp|led bulb|light bulb|lamp)\b/i],
  ['electronic toy', 'electronic_toy', /\b(electronic toy|toy robot|remote control toy)\b/i],
  ['garment', 'textile_garment', /\b(shirt|t-shirt|jacket|trouser|pants|dress|garment|textile clothing)\b/i],
  ['printed circuit board', 'pcb', /\b(printed circuit board|circuit board|pcb|electronic board)\b/i],
  ['charger', 'charger', /\b(wall charger|usb charger|power adapter|ac adapter|charger)\b/i],
  ['cable', 'cable', /\b(usb cable|power cable|charging cable|electrical cable|cable)\b/i],
]

function heuristicProduct(text) {
  const source = String(text || '')
  for (const [product_type, category, pattern] of PRODUCT_HINTS) {
    if (pattern.test(source)) return { product_type, category, family_support: 'medium', alternative_families: [] }
  }
  return null
}

function evidenceText(evidence) {
  return [
    evidence?.product_type_hint,
    evidence?.category_hint,
    ...(evidence?.objects || []),
    ...(evidence?.visible_text || []),
    ...(evidence?.logos_or_brand_marks || []),
    ...(evidence?.observable_features || []),
    evidence?.plain_observation,
  ].filter(Boolean).join(' ')
}

function deterministicVisualConfidence(evidence) {
  const objects = arr(evidence?.objects, 12).length
  const text = arr(evidence?.visible_text, 20).length
  const features = arr(evidence?.observable_features, 20).length
  const ambiguities = arr(evidence?.ambiguities, 10).length
  const quality = String(evidence?.image_quality || 'usable').toLowerCase()
  const hasHint = Boolean(evidence?.product_type_hint)
  let score = 42 + Math.min(objects, 3) * 7 + Math.min(features, 5) * 4 + Math.min(text, 4) * 3 + (hasHint ? 10 : 0) - Math.min(ambiguities, 4) * 5
  if (quality === 'good' || quality === 'high') score += 8
  if (quality === 'poor' || quality === 'low') score -= 18
  return pct(score)
}

function deterministicFamilyConfidence(reasoned, evidenceConfidence) {
  const support = String(reasoned?.family_support || 'weak').toLowerCase()
  const base = support === 'strong' ? 90 : support === 'medium' ? 76 : 54
  const alternatives = arr(reasoned?.alternative_families, 6).length
  return pct(base * 0.68 + evidenceConfidence * 0.32 - alternatives * 5)
}

function deterministicExactConfidence(reasoned, evidence) {
  const brand = String(reasoned?.brand || '').trim()
  const model = String(reasoned?.model || '').trim()
  const visible = [...arr(evidence?.visible_text, 20), ...arr(evidence?.logos_or_brand_marks, 10)].join(' ').toLowerCase()
  if (!brand && !model) return 5
  let score = 15
  if (brand && visible.includes(brand.toLowerCase())) score += 30
  if (model && visible.includes(model.toLowerCase())) score += 50
  else if (model) score += 8
  return pct(score)
}

async function runJSON(env, prompt, maxTokens = 1800) {
  const result = await env.AI.run(TEXT_MODEL, {
    messages: [
      { role: 'system', content: 'You are REGIQ. Follow supplied evidence exactly. Return one valid JSON object only, without markdown.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: maxTokens,
  })
  return extractJSON(result)
}

function normalizeEvidence(candidate, raw = '', model = PRIMARY_VISION_MODEL) {
  const parsed = candidate && typeof candidate === 'object' ? candidate : {}
  const rawText = String(raw || '')
  const hinted = heuristicProduct(`${parsed.product_type_hint || ''} ${parsed.category_hint || ''} ${rawText}`)
  const objects = arr(parsed.objects, 12)
  if (!objects.length && hinted?.product_type) objects.push(hinted.product_type)
  return {
    objects,
    visible_text: arr(parsed.visible_text, 20),
    logos_or_brand_marks: arr(parsed.logos_or_brand_marks, 10),
    observable_features: arr(parsed.observable_features, 20),
    image_quality: String(parsed.image_quality || 'usable').toLowerCase(),
    ambiguities: arr(parsed.ambiguities, 10),
    plain_observation: String(parsed.plain_observation || rawText || '').replace(/```/g, '').slice(0, 2400),
    product_type_hint: String(parsed.product_type_hint || hinted?.product_type || '').trim() || null,
    category_hint: normalizeCategory(parsed.category_hint || hinted?.category || 'other'),
    family_support_hint: String(parsed.family_support_hint || (hinted ? 'medium' : 'weak')).toLowerCase(),
    brand_hint: parsed.brand_hint ? String(parsed.brand_hint).trim() : null,
    model_hint: parsed.model_hint ? String(parsed.model_hint).trim() : null,
    vision_model: model,
  }
}

function usefulEvidence(evidence) {
  if (!evidence) return false
  if (evidence.product_type_hint) return true
  if (arr(evidence.objects, 12).length) return true
  if (arr(evidence.observable_features, 20).length >= 2) return true
  return String(evidence.plain_observation || '').trim().length >= 20
}

async function callVision(env, model, image) {
  const prompt = `You are REGIQ's product vision component. Identify the GENERIC product family and extract only visible evidence. Do not determine regulations.
Return JSON if possible:
{
  "product_type_hint":"generic product name such as over-ear headphones, folding multi-tool, smartphone, battery, server, plastic bottle",
  "category_hint":"short machine-readable family",
  "family_support_hint":"strong|medium|weak",
  "brand_hint":null,
  "model_hint":null,
  "objects":["generic objects visibly present"],
  "visible_text":["only text actually readable"],
  "logos_or_brand_marks":["only marks actually visible"],
  "observable_features":["directly visible physical features"],
  "image_quality":"good|usable|poor",
  "ambiguities":["important facts not knowable from this image"],
  "plain_observation":"2-4 factual sentences"
}
For an obvious object, name the generic family even if exact brand/model is unknown. Brand/model must be null unless directly visible. Never infer hidden battery chemistry, wireless capability, intended use, certification, capacity, material composition or legal status.`

  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: 'Recognize the generic product family first, then report visible evidence conservatively. Formatting errors must not prevent a useful generic identification.' },
      { role: 'user', content: prompt },
    ],
    image,
    temperature: 0,
    max_tokens: 900,
  })
  const raw = aiText(result)
  return normalizeEvidence(extractJSON(result), raw, model)
}

async function extractVisualEvidence(env, file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  const image = `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`

  let primary = null
  try { primary = await callVision(env, PRIMARY_VISION_MODEL, image) } catch (error) { console.warn('REGIQ primary vision failed', String(error?.message || error)) }
  if (usefulEvidence(primary) && (primary.product_type_hint || heuristicProduct(evidenceText(primary)))) return primary

  let fallback = null
  try { fallback = await callVision(env, FALLBACK_VISION_MODEL, image) } catch (error) { console.warn('REGIQ fallback vision failed', String(error?.message || error)) }
  if (usefulEvidence(fallback)) return fallback
  if (usefulEvidence(primary)) return primary

  return {
    objects: [], visible_text: [], logos_or_brand_marks: [], observable_features: [], image_quality: 'poor',
    ambiguities: ['The product family could not be established reliably from this image.'],
    plain_observation: '', product_type_hint: null, category_hint: 'other', family_support_hint: 'weak',
    brand_hint: null, model_hint: null, vision_model: fallback?.vision_model || primary?.vision_model || PRIMARY_VISION_MODEL,
  }
}

function directReasoning(evidence) {
  const hint = evidence?.product_type_hint ? {
    product_type: evidence.product_type_hint,
    category: evidence.category_hint || 'other',
    family_support: ['strong','medium','weak'].includes(evidence.family_support_hint) ? evidence.family_support_hint : 'medium',
    alternative_families: [],
  } : heuristicProduct(evidenceText(evidence))

  if (hint) return {
    ...hint,
    brand: evidence.brand_hint || null,
    model: evidence.model_hint || null,
    supported_facts: [...new Set([...arr(evidence.objects, 8), ...arr(evidence.observable_features, 16), ...arr(evidence.visible_text, 12)])].slice(0, 20),
    critical_unknowns: arr(evidence.ambiguities, 10),
    reasoning_summary: String(evidence.plain_observation || `Visible evidence supports a generic identification as ${hint.product_type}.`).slice(0, 1200),
  }

  const firstObject = arr(evidence?.objects, 12).find(v => !/^(object|item|product|thing|device)$/i.test(v))
  if (firstObject) return {
    product_type: firstObject,
    category: normalizeCategory(firstObject),
    family_support: 'weak',
    alternative_families: [],
    brand: null,
    model: null,
    supported_facts: [...new Set([...arr(evidence.objects, 8), ...arr(evidence.observable_features, 16), ...arr(evidence.visible_text, 12)])].slice(0, 20),
    critical_unknowns: [...arr(evidence.ambiguities, 10), 'Confirm the exact product family before relying on product-specific regulation.'].slice(0, 12),
    reasoning_summary: String(evidence.plain_observation || `The image appears to contain ${firstObject}, but the family is not strongly established.`).slice(0, 1200),
  }
  return null
}

async function reasonProductFamily(env, evidence) {
  const direct = directReasoning(evidence)
  if (direct?.family_support === 'strong') return direct

  try {
    const enriched = await runJSON(env, `Classify the product family from the supplied visual evidence. Do not infer hidden characteristics and do not reject an obvious generic family merely because exact brand/model is unknown.\nVISUAL EVIDENCE:\n${JSON.stringify(evidence)}\nReturn JSON: {"product_type":"generic product family","category":"machine-readable family","family_support":"strong|medium|weak","alternative_families":[],"brand":null,"model":null,"supported_facts":[],"critical_unknowns":[],"reasoning_summary":"one conservative sentence"}. Brand/model only if directly visible.`, 950)
    if (enriched?.product_type) {
      const supported = arr(enriched.supported_facts, 20)
      const unknowns = arr(enriched.critical_unknowns, 12)
      return {
        product_type: String(enriched.product_type).trim(),
        category: normalizeCategory(enriched.category || direct?.category),
        family_support: String(enriched.family_support || direct?.family_support || 'medium').toLowerCase(),
        alternative_families: arr(enriched.alternative_families, 6),
        brand: enriched.brand || direct?.brand || null,
        model: enriched.model || direct?.model || null,
        supported_facts: supported.length ? supported : (direct?.supported_facts || []),
        critical_unknowns: unknowns.length ? unknowns : (direct?.critical_unknowns || []),
        reasoning_summary: String(enriched.reasoning_summary || direct?.reasoning_summary || evidence.plain_observation || '').slice(0, 1200),
      }
    }
  } catch (error) {
    console.warn('REGIQ family enrichment failed', String(error?.message || error))
  }
  return direct
}

async function identifyProduct(env, file) {
  const evidence = await extractVisualEvidence(env, file)
  const reasoned = await reasonProductFamily(env, evidence)

  if (!reasoned?.product_type) {
    return {
      status: 'unresolved',
      message: 'I could not identify this product reliably from this image. Try another angle, move closer, or photograph a label or model marking.',
      product_type: null,
      category: 'other',
      visible_text: evidence.visible_text,
      visual_evidence: evidence,
      supported_facts: [],
      critical_unknowns: ['Product family is not established.'],
      alternative_families: [],
      visual_evidence_confidence: deterministicVisualConfidence(evidence),
      product_family_confidence: 0,
      exact_product_confidence: 0,
      confidence: 0,
      confidence_method: 'deterministic_from_observed_evidence_not_llm_self_rating',
      provider: 'cloudflare-workers-ai',
      model_used: evidence.vision_model,
    }
  }

  const visualEvidenceConfidence = deterministicVisualConfidence(evidence)
  const familyConfidence = deterministicFamilyConfidence(reasoned, visualEvidenceConfidence)
  const exactConfidence = deterministicExactConfidence(reasoned, evidence)
  const exactIdentityReliable = exactConfidence >= 70

  return {
    status: 'identified',
    product_type: String(reasoned.product_type).trim(),
    category: normalizeCategory(reasoned.category),
    brand: exactIdentityReliable && reasoned.brand ? String(reasoned.brand).trim() : null,
    model: exactIdentityReliable && reasoned.model ? String(reasoned.model).trim() : null,
    visible_text: evidence.visible_text,
    visual_evidence: evidence,
    supported_facts: arr(reasoned.supported_facts, 20),
    critical_unknowns: arr(reasoned.critical_unknowns, 12),
    alternative_families: arr(reasoned.alternative_families, 6),
    visual_evidence_confidence: visualEvidenceConfidence,
    product_family_confidence: familyConfidence,
    exact_product_confidence: exactConfidence,
    confidence: familyConfidence / 100,
    confidence_method: 'deterministic_from_observed_evidence_not_llm_self_rating',
    reasoning_summary: String(reasoned.reasoning_summary || evidence.plain_observation || '').slice(0, 1200),
    provider: 'cloudflare-workers-ai',
    model_used: evidence.vision_model,
    credential_source: 'cloudflare_binding',
    model_provenance: {
      provider: 'cloudflare-workers-ai',
      model: evidence.vision_model,
      source_url: evidence.vision_model === FALLBACK_VISION_MODEL
        ? 'https://developers.cloudflare.com/ai/models/%40cf/google/gemma-4-26b-a4b-it/'
        : 'https://developers.cloudflare.com/ai/models/%40cf/meta/llama-4-scout-17b-16e-instruct/',
      license: 'model-specific; see source',
      revision: null,
    },
  }
}

function confidence(identityConfidence, sourceOfficial, verifierState, applicability, missingCount) {
  const identity = Math.max(0, Math.min(Number(identityConfidence || 0), 1))
  const agreement = verifierState === 'confirmed' ? 1 : verifierState === 'needs_more_evidence' ? 0.62 : 0.2
  const specificity = ({ applicable: 1, likely: 0.82, conditional: 0.62, upcoming: 0.78, context: 0.48 })[applicability] || 0.5
  const completeness = Math.max(0.55, 1 - 0.08 * Number(missingCount || 0))
  const value = (0.28 * identity + 0.27 * agreement + 0.30 * (sourceOfficial ? 1 : 0.45) + 0.15 * specificity) * completeness
  return Math.max(1, Math.min(99, Math.round(value * 100)))
}

function confidenceLabel(score) {
  return score >= 85 ? 'high' : score >= 65 ? 'medium' : 'low'
}

function dppSummary(regimes) {
  const explicit = regimes.filter(r => /digital product passport|battery passport|passport/i.test(`${r.title || ''} ${(r.obligations || []).join(' ')}`))
  if (explicit.length) {
    const best = [...explicit].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0]
    return { status: 'investigated', label: 'Passport relevance found', explanation: `Passport relevance is supported by ${best.title}. Check exact scope and application dates.` }
  }
  return { status: 'not_identified', label: 'No passport requirement identified', explanation: 'No supported product-specific passport requirement was identified in the verified corpus for the available evidence.' }
}

async function investigate(env, identification) {
  if (identification?.status !== 'identified') return null
  const legalCorpus = compactCatalog()
  const product = {
    product_type: identification.product_type,
    category: identification.category,
    brand: identification.exact_product_confidence >= 70 ? identification.brand : null,
    model: identification.exact_product_confidence >= 70 ? identification.model : null,
    visible_text: identification.visible_text || [],
    supported_facts: identification.supported_facts || [],
    critical_unknowns: identification.critical_unknowns || [],
    family_confidence: identification.product_family_confidence,
    exact_product_confidence: identification.exact_product_confidence,
    visual_observation: identification.visual_evidence?.plain_observation,
  }

  const investigation = await runJSON(env, `You are REGIQ's Regulatory Investigator Agent. Investigate ONLY from supported product facts against the complete verified EU regulatory corpus below.
STRICT RULES:
- Use ONLY act IDs in the supplied corpus.
- Exact brand/model identity is irrelevant unless explicitly supported.
- Never infer battery presence, radio functionality, intended use, chemistry, capacity, medical purpose, materials composition or market role unless present in supported_facts/visible_text.
- If a missing fact changes legal applicability, make the finding conditional and add the fact to missing_evidence.
- Never invent legal requirements, dates, URLs, articles or thresholds.
- Select only materially relevant acts.
PRODUCT EVIDENCE:\n${JSON.stringify(product)}
VERIFIED EU CORPUS:\n${JSON.stringify(legalCorpus)}
Return JSON: {"headline":"short screening conclusion","summary":"2-3 factual sentences","findings":[{"act_id":"exact id","applicability":"applicable|likely|conditional|upcoming|context","why":"why relevant","obligations":["supported high-level checks"],"missing_evidence":["facts needed"]}],"global_missing_evidence":["highest-value missing facts"]}`, 2200)
  if (!investigation || !Array.isArray(investigation.findings)) return null

  const verification = await runJSON(env, `You are REGIQ's independent Regulatory Verifier. Challenge every finding using ONLY the product evidence and verified corpus. Reject any finding that depends on an inferred hidden characteristic. Do not add regulations.
PRODUCT:\n${JSON.stringify(product)}
CORPUS:\n${JSON.stringify(legalCorpus)}
FINDINGS:\n${JSON.stringify(investigation)}
Return JSON: {"reviews":[{"act_id":"exact id","verdict":"confirmed|needs_more_evidence|rejected","reason":"brief factual critique"}],"overall_note":"brief verification note"}`, 1500) || { reviews: [], overall_note: 'Verifier response unavailable.' }

  const actMap = Object.fromEntries(legalCorpus.map(a => [a.id, a]))
  const reviewMap = Object.fromEntries((verification.reviews || []).filter(r => r.act_id).map(r => [r.act_id, r]))
  const regimes = []
  for (const finding of investigation.findings || []) {
    const act = actMap[finding.act_id]
    if (!act) continue
    const review = reviewMap[finding.act_id] || { verdict: 'needs_more_evidence', reason: 'No independent verifier verdict.' }
    if (review.verdict === 'rejected') continue
    const missing = arr(finding.missing_evidence, 12)
    const score = confidence(identification.product_family_confidence / 100, act.source_type === 'official_eur_lex', review.verdict, finding.applicability || 'conditional', missing.length)
    regimes.push({
      id: finding.act_id,
      title: act.title,
      legal_basis: act.legal_basis,
      classification: act.classification,
      source_url: act.source_url,
      status: finding.applicability || 'conditional',
      why: finding.why || act.summary,
      obligations: arr(finding.obligations, 12),
      conditions: missing,
      confidence: score,
      confidence_label: confidenceLabel(score),
      verification: review.verdict,
      verification_note: review.reason,
      source_authority: act.source_type === 'official_eur_lex' ? 'official_eur_lex' : act.source_type,
    })
  }
  if (!regimes.length) return null
  regimes.sort((a, b) => b.confidence - a.confidence)
  const overall = Math.round(regimes.reduce((sum, r) => sum + r.confidence, 0) / regimes.length)
  const missingGlobal = [...new Set([...(identification.critical_unknowns || []), ...arr(investigation.global_missing_evidence, 20)])].slice(0, 20)
  return {
    status: 'agentic_assessment',
    headline: investigation.headline || 'Agentic regulatory screening completed',
    summary: investigation.summary || 'REGIQ screened supported product evidence against its verified regulatory corpus.',
    regimes,
    dpp: dppSummary(regimes),
    missing_evidence: missingGlobal,
    overall_confidence: overall,
    overall_confidence_label: confidenceLabel(overall),
    investigation: {
      mode: 'evidence_first_cloudflare_investigator_verifier',
      investigator_model: TEXT_MODEL,
      verifier_model: TEXT_MODEL,
      verifier_note: verification.overall_note,
      corpus_scope: 'verified REGIQ EU catalog',
    },
    reasoning_mode: 'evidence_first_agentic_investigator_verifier',
    fallback_used: false,
    disclaimer: 'REGIQ confidence is computed from observable evidence, source authority, applicability specificity, missing evidence and independent-agent agreement. It is not an LLM self-rating and is not legal advice.',
  }
}

function resolveReferenceFamily(identification) {
  const direct = String(identification?.category || '').toLowerCase()
  if (catalog.product_families?.[direct]) return direct
  const text = `${identification?.product_type || ''} ${identification?.category || ''}`.toLowerCase()
  const patterns = [
    ['smartphone', /smartphone|mobile phone|cell phone/],
    ['laptop', /laptop|notebook computer/],
    ['wireless_headphones', /headphone|headset|earbud|earphone/],
    ['power_bank', /power bank|portable charger/],
    ['household_battery', /\baa battery\b|\baaa battery\b|household battery/],
    ['led_lamp', /led lamp|light bulb|led bulb/],
    ['power_tool', /power drill|cordless drill|power tool/],
    ['textile_garment', /shirt|t-shirt|garment|jacket|trouser|dress|textile/],
    ['electronic_toy', /electronic toy|toy robot/],
    ['plastic_beverage_bottle', /plastic.*bottle|beverage bottle|water bottle/],
    ['battery_ev', /electric vehicle battery|ev battery|traction battery/],
  ]
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || null
}

function deterministicFallback(identification) {
  const family = identification.product_family_confidence >= 75 ? resolveReferenceFamily(identification) : null
  const ids = family ? (catalog.product_families?.[family] || []) : []
  const regimes = ids.map(id => {
    const act = catalog.acts?.[id]
    if (!act) return null
    return {
      id,
      title: act.title,
      legal_basis: act.legal_basis,
      classification: act.classification,
      source_url: act.source_url,
      status: act.status === 'upcoming' ? 'upcoming' : 'conditional',
      why: `Reference-family fallback: ${act.summary}`,
      obligations: [],
      conditions: ['Confirm exact technical characteristics and legal scope before relying on applicability.'],
      confidence: null,
      confidence_label: 'not_scored',
      verification: 'fallback_not_agent_verified',
      verification_note: 'Shown from REGIQ curated reference-family catalog because the agentic investigation was unavailable.',
      source_authority: act.source_type,
    }
  }).filter(Boolean)

  if (!regimes.length) {
    for (const id of ['gpsr-2023-988', 'reach-1907-2006', 'espr-2024-1781']) {
      const act = catalog.acts?.[id]
      if (!act) continue
      regimes.push({
        id,
        title: act.title,
        legal_basis: act.legal_basis,
        classification: act.classification,
        source_url: act.source_url,
        status: 'context',
        why: `General screening context only: ${act.summary}`,
        obligations: [],
        conditions: ['Product-specific applicability has not been established.'],
        confidence: null,
        confidence_label: 'not_scored',
        verification: 'fallback_not_agent_verified',
        verification_note: 'General context only; no sufficiently supported product family was available.',
        source_authority: act.source_type,
      })
    }
  }

  return {
    status: 'fallback_assessment',
    headline: family ? 'Reference-family regulatory screening' : 'General regulatory screening context',
    summary: family ? `REGIQ is showing the curated ${family.replaceAll('_', ' ')} reference family as a conservative fallback.` : 'REGIQ could not establish a product family strongly enough for product-specific fallback rules, so only general EU context is shown.',
    regimes,
    dpp: dppSummary(regimes),
    missing_evidence: identification.critical_unknowns?.length ? identification.critical_unknowns : ['Confirm product specifications, intended use, market placement and relevant technical characteristics.'],
    overall_confidence: null,
    overall_confidence_label: 'not_scored',
    investigation: { mode: 'deterministic_verified_catalog_fallback', investigator_model: TEXT_MODEL, verifier_model: TEXT_MODEL, verifier_note: 'Agentic output unavailable or structurally unusable.', corpus_scope: 'verified REGIQ EU catalog' },
    reasoning_mode: 'deterministic_verified_catalog_fallback',
    fallback_used: true,
    disclaimer: 'This fallback is a screening aid based on REGIQ verified reference catalog. It is not a legal compliance determination.',
  }
}

async function scanImage(request, env) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ detail: 'Image file is required.' }, 400)
    if (file.size > 10 * 1024 * 1024) return json({ detail: 'Image exceeds the 10 MB public demo limit.' }, 413)

    const identification = await identifyProduct(env, file)
    if (identification.status !== 'identified') {
      return json({
        filename: file.name,
        content_type: file.type || 'image/jpeg',
        identification,
        regulatory_profile: null,
        regulatory: { status: 'not_assessed', label: 'Product family not established', scope_note: 'REGIQ will not investigate product-specific rules until the product family is identified reliably.', classification: 'NOT_ASSESSED', legal_basis: null, source_url: null },
        discovery: { status: 'waiting_for_identification', message: 'Try another angle or photograph a product label. No regulatory conclusion has been generated.' },
      })
    }

    const regulatoryProfile = await investigate(env, identification) || deterministicFallback(identification)
    return json({
      filename: file.name,
      content_type: file.type || 'image/jpeg',
      identification,
      regulatory_profile: regulatoryProfile,
      regulatory: { status: regulatoryProfile.status, label: regulatoryProfile.headline, scope_note: regulatoryProfile.summary, classification: 'MULTI_REGIME_PROFILE', legal_basis: null, source_url: null },
      discovery: { status: regulatoryProfile.regimes?.length ? 'ready_for_source_discovery' : 'waiting_for_identification', message: regulatoryProfile.fallback_used ? 'Agentic analysis degraded safely to REGIQ verified catalog.' : 'The investigator used supported visual evidence against REGIQ verified legal corpus.' },
    })
  } catch (error) {
    const message = String(error?.message || error || 'Unknown inference error')
    const capacity = /limit|quota|capacity|neuron|429|3040|5035/i.test(message)
    console.error('REGIQ scan pipeline error', message)
    if (capacity) return json({ detail: 'REGIQ has reached the current free Workers AI capacity. Please try again later.', free_tier_capacity: 'exhausted' }, 429)
    return json({
      filename: null,
      identification: {
        status: 'unresolved',
        message: 'REGIQ could not identify this product reliably from this image. Try another angle, move closer, or photograph the product label.',
        product_type: null,
        category: 'other',
        visual_evidence_confidence: 0,
        product_family_confidence: 0,
        exact_product_confidence: 0,
      },
      regulatory_profile: null,
      regulatory: { status: 'not_assessed', label: 'Recognition incomplete', scope_note: 'No product-specific regulatory conclusion was generated.', classification: 'NOT_ASSESSED', legal_basis: null, source_url: null },
      discovery: { status: 'waiting_for_identification', message: 'No regulatory conclusion has been generated.' },
      diagnostic_code: 'RECOGNITION_INCOMPLETE',
    }, 200)
  }
}

async function reassess(request, env) {
  try {
    const body = await request.json()
    const identification = { ...(body.identification || {}) }
    if (identification.status !== 'identified') return json({ detail: 'A previously identified product is required.' }, 400)
    const evidence = (body.gap_resolutions || []).filter(item => String(item?.value || '').trim())
    if (!evidence.length) return json({ detail: 'Provide at least one explicit product fact to bridge an evidence gap.' }, 400)
    const evidenceLines = evidence.map(item => `${item.gap || item.question || 'Product fact'}: ${String(item.value).trim()} [${item.evidence_level || 'self_declared'}]`)
    identification.supported_facts = [...(identification.supported_facts || []), ...evidenceLines]
    identification.critical_unknowns = (identification.critical_unknowns || []).filter(gap => !evidence.some(item => String(item.gap || item.question || '') === String(gap)))
    const profile = await investigate(env, identification) || deterministicFallback(identification)
    profile.reasoning_mode = profile.fallback_used ? 'deterministic_reassessment_fallback' : 'agentic_reassessment_with_user_evidence'
    profile.user_evidence = evidence
    return json({ identification, regulatory_profile: profile, reassessment: { status: 'completed', evidence_items: evidence.length, fallback_used: Boolean(profile.fallback_used) } })
  } catch (error) {
    return json({ detail: 'REGIQ could not complete this reassessment. Please review the supplied evidence and try again.' }, 500)
  }
}

async function api(request, env) {
  const path = new URL(request.url).pathname
  if (request.method === 'GET' && path === '/api/health') return json({ status: 'ok', name: 'REGIQ', version: VERSION, runtime: 'cloudflare-workers', regulatory_catalog_version: catalog.catalog_version, regulatory_catalog_verified_at: catalog.verified_at })
  if (request.method === 'GET' && path === '/api/model/provenance') return json({
    software: { name: 'REGIQ', version: VERSION, license: 'Apache-2.0', repository: 'https://github.com/opedoussaut/regiq' },
    vision: { enabled: true, provider: 'cloudflare-workers-ai', model: PRIMARY_VISION_MODEL, fallback_model: FALLBACK_VISION_MODEL, open_weight: true, server_token_configured: true, byo_hf_token_enabled: false, strategy: 'dual-vision generic-family recognition with nonfatal heuristic recovery' },
    regulation_agents: { enabled: true, provider: 'cloudflare-workers-ai', investigator_model: TEXT_MODEL, verifier_model: TEXT_MODEL, server_token_configured: true, byo_token_enabled: false, confidence_method: 'deterministic evidence-weighted score', resilience: 'verified_catalog_fallback' },
    hosting: { provider: 'cloudflare-workers', mode: 'free-tier-public-demo', billing_guardrail: 'no automatic paid inference configured by REGIQ' },
  })
  if (request.method === 'GET' && path === '/api/scan/config') return json({
    vision: { enabled: true, provider: 'cloudflare-workers-ai', model: PRIMARY_VISION_MODEL, fallback_model: FALLBACK_VISION_MODEL, server_token_configured: true, byo_hf_token_enabled: false, strategy: 'primary vision -> direct family recovery -> fallback vision -> optional reasoner' },
    regulation_agents: { enabled: true, provider: 'cloudflare-workers-ai', investigator_model: TEXT_MODEL, verifier_model: TEXT_MODEL, server_token_configured: true, byo_token_enabled: false },
    camera_capture: true,
    photo_upload: true,
    barcode_qr: true,
    byo_header: null,
    reference_product_families: Object.keys(catalog.product_families || {}).sort(),
    regulatory_catalog_version: catalog.catalog_version,
    public_runtime: 'Cloudflare Workers + Workers AI free daily allocation',
    principle: 'Recognize the generic family first. Never let a formatting failure become a false product claim or a fatal scan error.',
  })
  if (request.method === 'GET' && path === '/api/regulation/catalog') return json(catalog)
  if (request.method === 'POST' && path === '/api/scan/image') return scanImage(request, env)
  if (request.method === 'POST' && path === '/api/scan/reassess') return reassess(request, env)
  return json({ detail: 'Not found' }, 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return api(request, env)
    return env.ASSETS.fetch(request)
  },
}
