import catalog from '../data/regulatory_catalog.json'

const TEXT_MODEL = '@cf/zai-org/glm-4.7-flash'
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

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
  let text = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json|javascript|js)?\s*/gi, '').replace(/```/g, '').trim()
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const candidate = balancedJSONObject(text)
  if (!candidate) return null
  try { return JSON.parse(candidate) } catch { return null }
}

function arr(value, limit = 20) {
  return Array.isArray(value) ? value.filter(v => v != null).map(v => String(v).trim()).filter(Boolean).slice(0, limit) : []
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

async function runJSON(env, prompt, maxTokens) {
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
  const legalCorpus = compactCatalog()
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

  if (!investigation || !Array.isArray(investigation.findings)) {
    return json({ detail: 'Investigator did not return a usable regulatory draft.', stage: 'investigation', elapsed_ms: Date.now() - started }, 502)
  }

  const validIds = new Set(legalCorpus.map(item => item.id))
  investigation.findings = investigation.findings.filter(item => validIds.has(item?.act_id))

  return json({
    stage: 'investigation',
    status: 'completed',
    elapsed_ms: Date.now() - started,
    investigation,
  })
}

async function verifyStage(request, env) {
  const started = Date.now()
  const body = await request.json()
  const identification = body?.identification || {}
  const investigation = body?.investigation || null
  if (identification.status !== 'identified' || !identification.product_type) return json({ detail: 'An identified product is required.' }, 400)
  if (!investigation || !Array.isArray(investigation.findings)) return json({ detail: 'A completed investigation draft is required.' }, 400)

  const product = productEvidence(identification)
  const legalCorpus = compactCatalog()
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
  const profile = {
    status: regimes.length ? 'agentic_assessment' : 'agentic_no_supported_findings',
    headline: investigation.headline || 'Agentic regulatory screening completed',
    summary: investigation.summary || 'REGIQ screened supported product evidence against its verified regulatory corpus.',
    regimes,
    dpp: dppSummary(regimes),
    missing_evidence: missingGlobal,
    overall_confidence: overall,
    overall_confidence_label: overall == null ? 'not_scored' : confidenceLabel(overall),
    investigation: {
      mode: 'staged_evidence_first_investigator_verifier',
      investigator_model: TEXT_MODEL,
      verifier_model: TEXT_MODEL,
      verifier_note: verification.overall_note,
      corpus_scope: 'verified REGIQ EU catalog',
    },
    reasoning_mode: 'staged_evidence_first_agentic_investigator_verifier',
    fallback_used: false,
    disclaimer: 'REGIQ confidence is computed from observable evidence, source authority, applicability specificity, missing evidence and independent-agent agreement. It is not an LLM self-rating and is not legal advice.',
  }

  return json({
    stage: 'verification',
    status: 'completed',
    elapsed_ms: Date.now() - started,
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
