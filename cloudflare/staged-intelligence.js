import catalog from '../data/regulatory_catalog.json'

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const INVESTIGATOR_DEADLINE_MS = 9000
const VERIFIER_DEADLINE_MS = 7000

const GENERAL_CONTEXT_IDS = ['gpsr-2023-988', 'reach-1907-2006', 'espr-2024-1781']

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function unwrapAI(result) {
  if (result == null) return ''
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return result.map(unwrapAI).filter(Boolean).join('\n')
  for (const candidate of [result.response, result.result, result.output_text, result.output, result.text, result.message?.content, result.choices?.[0]?.message?.content, result.choices?.[0]?.text]) {
    if (candidate == null) continue
    return candidate
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
  const value = unwrapAI(raw)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.response && typeof value.response === 'object') return value.response
    return value
  }
  const text = String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json|javascript|js)?\s*/gi, '')
    .replace(/```/g, '')
    .trim()
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const candidate = balancedJSONObject(text)
  if (!candidate) return null
  try { return JSON.parse(candidate) } catch { return null }
}

function arr(value, limit = 20) {
  return Array.isArray(value) ? value.filter(v => v != null).map(v => String(v).trim()).filter(Boolean).slice(0, limit) : []
}

function productEvidence(identification) {
  return {
    product_type: identification.product_type,
    category: identification.category,
    brand: Number(identification.exact_product_confidence || 0) >= 70 ? identification.brand : null,
    model: Number(identification.exact_product_confidence || 0) >= 70 ? identification.model : null,
    visible_text: identification.visible_text || [],
    supported_facts: identification.supported_facts || [],
    critical_unknowns: identification.critical_unknowns || [],
    family_confidence: identification.product_family_confidence,
    exact_product_confidence: identification.exact_product_confidence,
    visual_observation: identification.visual_evidence?.plain_observation,
  }
}

function resolveReferenceFamily(identification) {
  const direct = String(identification?.category || '').toLowerCase()
  if (catalog.product_families?.[direct]) return direct

  const text = `${identification?.product_type || ''} ${identification?.category || ''}`.toLowerCase()
  const patterns = [
    ['wireless_headphones', /headphone|headset|earbud|earphone/],
    ['smartphone', /smartphone|mobile phone|cell phone/],
    ['laptop', /laptop|notebook computer/],
    ['power_bank', /power bank|portable charger/],
    ['led_lamp', /led lamp|light bulb|led bulb/],
    ['power_tool', /power drill|cordless drill|power tool/],
    ['textile_garment', /shirt|t-shirt|garment|jacket|trouser|dress|textile/],
    ['electronic_toy', /electronic toy|toy robot/],
    ['plastic_beverage_bottle', /plastic.*bottle|beverage bottle|water bottle/],
    ['battery_ev', /electric vehicle battery|ev battery|traction battery/],
  ]
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || null
}

function candidateContext(identification) {
  const family = resolveReferenceFamily(identification)
  let ids = family ? (catalog.product_families?.[family] || []) : []
  const text = `${identification?.product_type || ''} ${identification?.category || ''}`.toLowerCase()

  if (!ids.length && /\bbattery\b|accumulator|cell pack/.test(text)) ids = ['battery-2023-1542']
  if (!ids.length) ids = GENERAL_CONTEXT_IDS

  const corpus = ids.map(id => {
    const act = catalog.acts?.[id]
    if (!act) return null
    return {
      id,
      title: act.title,
      legal_basis: act.legal_basis,
      classification: act.classification,
      status: act.status,
      summary: act.summary,
      source_url: act.source_url,
      source_type: act.source_type,
    }
  }).filter(Boolean)

  return {
    family,
    ids: corpus.map(item => item.id),
    corpus,
    mode: family ? 'curated_product_family' : ids.length === 1 && ids[0] === 'battery-2023-1542' ? 'curated_battery_context' : 'general_context',
  }
}

function missingEvidenceForAct(id) {
  const map = {
    'red-2014-53': ['Confirm whether the product intentionally transmits or receives radio waves (for example Bluetooth or Wi-Fi).'],
    'common-charger-2022-2380': ['Confirm rechargeable-battery charging capability, product category and charging interface relevant to Common Charger scope.'],
    'battery-2023-1542': ['Confirm whether a battery is incorporated or supplied and the battery category/characteristics relevant to scope.'],
    'rohs-2011-65': ['Confirm the product is electrical/electronic equipment within RoHS scope and whether any exclusion or exemption is relevant.'],
    'weee-2012-19': ['Confirm the product is electrical/electronic equipment within WEEE scope and the relevant producer/market role.'],
    'espr-2024-1781': ['Confirm whether a product-specific ESPR delegated act applies; ESPR alone does not establish a product-specific DPP obligation.'],
    'gpsr-2023-988': ['Confirm intended consumer use and whether sector-specific safety law fully covers the relevant risks.'],
    'reach-1907-2006': ['Confirm relevant material/substance information and supply-chain role for REACH article duties or restrictions.'],
  }
  return map[id] || ['Confirm the product characteristics and legal scope conditions that determine applicability.']
}

function deterministicInvestigation(identification, context, reason = 'agent_output_unavailable') {
  const general = context.mode === 'general_context'
  const findings = context.corpus.map(act => ({
    act_id: act.id,
    applicability: general ? 'context' : act.status === 'upcoming' ? 'upcoming' : 'conditional',
    why: general
      ? `General screening context: ${act.summary}`
      : `REGIQ curated ${context.family?.replaceAll('_', ' ') || identification.product_type} reference-family candidate; exact applicability still depends on product evidence.`,
    obligations: [],
    missing_evidence: missingEvidenceForAct(act.id),
  }))
  const global = [...new Set(findings.flatMap(item => item.missing_evidence))].slice(0, 12)
  return {
    headline: general ? 'General regulatory screening context' : 'Reference-family regulatory candidates identified',
    summary: general
      ? 'REGIQ could not map this product to a curated product-family corpus, so only general EU screening context is retained.'
      : `REGIQ mapped the identified product family to ${findings.length} curated EU regulatory candidates. Applicability remains conditional until the relevant technical facts are confirmed.`,
    findings,
    global_missing_evidence: global,
    _regiq: {
      candidate_family: context.family,
      candidate_mode: context.mode,
      draft_mode: 'deterministic_reference_family',
      agent_used: false,
      degraded_reason: reason,
    },
  }
}

function investigationSchema(validIds) {
  return {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            act_id: { type: 'string', enum: validIds },
            applicability: { type: 'string', enum: ['applicable', 'likely', 'conditional', 'upcoming', 'context'] },
            why: { type: 'string' },
            obligations: { type: 'array', items: { type: 'string' } },
            missing_evidence: { type: 'array', items: { type: 'string' } },
          },
          required: ['act_id', 'applicability', 'why', 'obligations', 'missing_evidence'],
        },
      },
      global_missing_evidence: { type: 'array', items: { type: 'string' } },
    },
    required: ['headline', 'summary', 'findings', 'global_missing_evidence'],
  }
}

function verificationSchema(validIds) {
  return {
    type: 'object',
    properties: {
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            act_id: { type: 'string', enum: validIds },
            verdict: { type: 'string', enum: ['confirmed', 'needs_more_evidence', 'rejected'] },
            reason: { type: 'string' },
          },
          required: ['act_id', 'verdict', 'reason'],
        },
      },
      overall_note: { type: 'string' },
    },
    required: ['reviews', 'overall_note'],
  }
}

async function withDeadline(promise, ms, code) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${code} after ${ms} ms`)
      error.code = code
      reject(error)
    }, ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runStructured(env, prompt, schema, maxTokens, deadlineMs, deadlineCode) {
  try {
    const result = await withDeadline(env.AI.run(TEXT_MODEL, {
      messages: [
        { role: 'system', content: 'You are REGIQ. Use only supplied evidence and legal candidates. Be conservative and concise.' },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: schema,
      },
      temperature: 0,
      max_tokens: maxTokens,
    }), deadlineMs, deadlineCode)
    return { data: extractJSON(result), error: null }
  } catch (error) {
    return { data: null, error: String(error?.code || error?.message || 'structured_ai_failed') }
  }
}

function normalizeInvestigation(candidate, identification, context) {
  if (!candidate || !Array.isArray(candidate.findings)) return null
  const validIds = new Set(context.ids)
  const findings = candidate.findings
    .filter(item => validIds.has(item?.act_id))
    .map(item => ({
      act_id: item.act_id,
      applicability: ['applicable', 'likely', 'conditional', 'upcoming', 'context'].includes(item.applicability) ? item.applicability : 'conditional',
      why: String(item.why || catalog.acts?.[item.act_id]?.summary || '').slice(0, 600),
      obligations: arr(item.obligations, 6),
      missing_evidence: arr(item.missing_evidence, 8),
    }))

  if (!findings.length) return null
  for (const finding of findings) {
    if (['conditional', 'upcoming'].includes(finding.applicability) && !finding.missing_evidence.length) {
      finding.missing_evidence = missingEvidenceForAct(finding.act_id)
    }
  }

  return {
    headline: String(candidate.headline || 'Regulatory candidates investigated').slice(0, 220),
    summary: String(candidate.summary || 'REGIQ investigated the supported product evidence against a compact verified candidate corpus.').slice(0, 800),
    findings,
    global_missing_evidence: arr(candidate.global_missing_evidence, 12),
    _regiq: {
      candidate_family: context.family,
      candidate_mode: context.mode,
      draft_mode: 'agent_structured_compact_corpus',
      agent_used: true,
      degraded_reason: null,
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

async function investigateStage(request, env) {
  const started = Date.now()
  const body = await request.json()
  const identification = body?.identification || {}
  if (identification.status !== 'identified' || !identification.product_type) return json({ detail: 'An identified product is required.' }, 400)

  const product = productEvidence(identification)
  const context = candidateContext(identification)
  const schema = investigationSchema(context.ids)
  const prompt = `Investigate the supported product evidence against ONLY the supplied verified candidate acts.
Rules: do not add act IDs; do not infer hidden battery, radio, material, intended-use or market facts. If a hidden fact changes applicability, use conditional and state the missing evidence. Keep each why to one sentence and obligations to at most two high-level checks.
PRODUCT=${JSON.stringify(product)}
CANDIDATES=${JSON.stringify(context.corpus)}`

  const attempt = await runStructured(env, prompt, schema, 850, INVESTIGATOR_DEADLINE_MS, 'INVESTIGATOR_TIMEOUT')
  let investigation = normalizeInvestigation(attempt.data, identification, context)
  let degraded = false

  if (!investigation) {
    degraded = true
    investigation = deterministicInvestigation(identification, context, attempt.error || 'unusable_structured_output')
  }

  return json({
    stage: 'investigation',
    status: 'completed',
    elapsed_ms: Date.now() - started,
    degraded,
    model: TEXT_MODEL,
    candidate_family: context.family,
    candidate_count: context.ids.length,
    investigation,
  })
}

function deterministicVerification(investigation, reason = 'verifier_output_unavailable') {
  return {
    reviews: (investigation.findings || []).map(finding => ({
      act_id: finding.act_id,
      verdict: 'needs_more_evidence',
      reason: 'Retained conservatively because exact applicability still depends on the listed missing product evidence.',
    })),
    overall_note: 'Independent model verification was unavailable; REGIQ retained only curated candidates and marked them as requiring more evidence.',
    _regiq: {
      verifier_mode: 'deterministic_conservative_fallback',
      agent_used: false,
      degraded_reason: reason,
    },
  }
}

async function verifyStage(request, env) {
  const started = Date.now()
  const body = await request.json()
  const identification = body?.identification || {}
  const investigation = body?.investigation || null
  if (identification.status !== 'identified' || !identification.product_type) return json({ detail: 'An identified product is required.' }, 400)
  if (!investigation || !Array.isArray(investigation.findings)) return json({ detail: 'A completed investigation draft is required.' }, 400)

  const product = productEvidence(identification)
  const validIds = [...new Set(investigation.findings.map(item => item.act_id).filter(id => catalog.acts?.[id]))]
  const legalCorpus = validIds.map(id => ({ id, ...catalog.acts[id] }))
  const schema = verificationSchema(validIds)
  const prompt = `Independently verify the candidate findings using ONLY the product evidence and supplied legal candidates. Do not add regulations. Reject a finding only if unsupported even as a candidate; otherwise use needs_more_evidence when a hidden characteristic is required.
PRODUCT=${JSON.stringify(product)}
CANDIDATES=${JSON.stringify(legalCorpus)}
FINDINGS=${JSON.stringify(investigation.findings)}`

  const attempt = validIds.length
    ? await runStructured(env, prompt, schema, 650, VERIFIER_DEADLINE_MS, 'VERIFIER_TIMEOUT')
    : { data: null, error: 'no_candidate_findings' }

  let verification = attempt.data && Array.isArray(attempt.data.reviews)
    ? {
        reviews: attempt.data.reviews.filter(review => validIds.includes(review?.act_id)).map(review => ({
          act_id: review.act_id,
          verdict: ['confirmed', 'needs_more_evidence', 'rejected'].includes(review.verdict) ? review.verdict : 'needs_more_evidence',
          reason: String(review.reason || '').slice(0, 500),
        })),
        overall_note: String(attempt.data.overall_note || 'Independent verification completed.').slice(0, 700),
        _regiq: { verifier_mode: 'agent_structured_compact_corpus', agent_used: true, degraded_reason: null },
      }
    : null

  let degraded = false
  if (!verification || !verification.reviews.length) {
    degraded = true
    verification = deterministicVerification(investigation, attempt.error || 'unusable_structured_output')
  }

  const actMap = Object.fromEntries(legalCorpus.map(a => [a.id, a]))
  const reviewMap = Object.fromEntries((verification.reviews || []).map(r => [r.act_id, r]))
  const regimes = []

  for (const finding of investigation.findings || []) {
    const act = actMap[finding.act_id]
    if (!act) continue
    const review = reviewMap[finding.act_id] || { verdict: 'needs_more_evidence', reason: 'No independent verifier verdict.' }
    if (review.verdict === 'rejected') continue
    const missing = arr(finding.missing_evidence, 12)
    const familyConfidence = Number(identification.product_family_confidence || Math.round(Number(identification.confidence || 0) * 100))
    const score = confidence(familyConfidence / 100, act.source_type === 'official_eur_lex', review.verdict, finding.applicability || 'conditional', missing.length)
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

  regimes.sort((a, b) => b.confidence - a.confidence)
  const overall = regimes.length ? Math.round(regimes.reduce((sum, r) => sum + r.confidence, 0) / regimes.length) : null
  const missingGlobal = [...new Set([...(identification.critical_unknowns || []), ...arr(investigation.global_missing_evidence, 20)])].slice(0, 20)
  const fallbackUsed = Boolean(degraded || investigation?._regiq?.agent_used === false)

  const profile = {
    status: regimes.length ? (fallbackUsed ? 'conservative_staged_assessment' : 'agentic_assessment') : 'agentic_no_supported_findings',
    headline: investigation.headline || 'Regulatory screening completed',
    summary: investigation.summary || 'REGIQ screened supported product evidence against a compact verified regulatory candidate corpus.',
    regimes,
    dpp: dppSummary(regimes),
    missing_evidence: missingGlobal,
    overall_confidence: overall,
    overall_confidence_label: overall == null ? 'not_scored' : confidenceLabel(overall),
    investigation: {
      mode: fallbackUsed ? 'staged_compact_corpus_with_conservative_fallback' : 'staged_compact_corpus_investigator_verifier',
      investigator_model: TEXT_MODEL,
      verifier_model: TEXT_MODEL,
      verifier_note: verification.overall_note,
      corpus_scope: 'verified REGIQ candidate subset',
      candidate_family: investigation?._regiq?.candidate_family || null,
    },
    reasoning_mode: fallbackUsed ? 'staged_evidence_first_with_deterministic_guardrails' : 'staged_evidence_first_agentic_investigator_verifier',
    fallback_used: fallbackUsed,
    disclaimer: 'REGIQ confidence is computed from observable evidence, source authority, applicability specificity, missing evidence and verifier agreement. It is a screening aid, not legal advice.',
  }

  return json({
    stage: 'verification',
    status: 'completed',
    elapsed_ms: Date.now() - started,
    degraded,
    model: TEXT_MODEL,
    verification,
    regulatory_profile: profile,
  })
}

export async function handleStagedIntelligence(request, env) {
  const url = new URL(request.url)
  if (request.method === 'POST' && url.pathname === '/api/intelligence/investigate') return investigateStage(request, env)
  if (request.method === 'POST' && url.pathname === '/api/intelligence/verify') return verifyStage(request, env)
  return null
}
