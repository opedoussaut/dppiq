const rawFetch = window.fetch.bind(window)

const INVESTIGATION_CLIENT_DEADLINE_MS = 7000
const VERIFICATION_CLIENT_DEADLINE_MS = 5000
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const GENERAL_CONTEXT_IDS = ['gpsr-2023-988', 'reach-1907-2006', 'espr-2024-1781']

let catalogPromise = null

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function parseBody(init) {
  try {
    if (typeof init?.body === 'string') return JSON.parse(init.body)
  } catch {}
  return {}
}

async function catalog() {
  if (!catalogPromise) {
    catalogPromise = rawFetch('/api/regulation/catalog', { cache: 'force-cache' })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null)
  }
  return catalogPromise
}

function resolveFamily(identification, data) {
  const direct = String(identification?.category || '').toLowerCase()
  if (data?.product_families?.[direct]) return direct

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

function missingEvidenceForAct(id) {
  const map = {
    'red-2014-53': ['Confirm whether the product intentionally transmits or receives radio waves, for example Bluetooth or Wi-Fi.'],
    'common-charger-2022-2380': ['Confirm rechargeable-battery charging capability, product category and charging interface relevant to Common Charger scope.'],
    'battery-2023-1542': ['Confirm whether a battery is incorporated or supplied and the battery category/characteristics relevant to scope.'],
    'rohs-2011-65': ['Confirm the product is electrical/electronic equipment within RoHS scope and whether an exclusion or exemption is relevant.'],
    'weee-2012-19': ['Confirm the product is electrical/electronic equipment within WEEE scope and the relevant producer/market role.'],
    'espr-2024-1781': ['Confirm whether a product-specific ESPR delegated act applies; ESPR alone does not establish a product-specific DPP obligation.'],
    'gpsr-2023-988': ['Confirm intended consumer use and whether sector-specific safety law fully covers the relevant risks.'],
    'reach-1907-2006': ['Confirm relevant material/substance information and supply-chain role for REACH article duties or restrictions.'],
  }
  return map[id] || ['Confirm the product characteristics and legal scope conditions that determine applicability.']
}

function fallbackInvestigation(identification, data, reason, elapsedMs) {
  const family = resolveFamily(identification, data)
  let ids = family ? (data?.product_families?.[family] || []) : []
  if (!ids.length) ids = GENERAL_CONTEXT_IDS.filter(id => data?.acts?.[id])
  const general = !family

  const findings = ids.map(id => {
    const act = data?.acts?.[id]
    if (!act) return null
    return {
      act_id: id,
      applicability: general ? 'context' : act.status === 'upcoming' ? 'upcoming' : 'conditional',
      why: general
        ? `General screening context: ${act.summary}`
        : `REGIQ curated ${String(family).replaceAll('_', ' ')} reference-family candidate; exact applicability still depends on product evidence.`,
      obligations: [],
      missing_evidence: missingEvidenceForAct(id),
    }
  }).filter(Boolean)

  const investigation = {
    headline: general ? 'General regulatory screening context' : 'Reference-family regulatory candidates identified',
    summary: general
      ? 'REGIQ retained general EU screening context because the staged investigator exceeded its interactive latency budget.'
      : `REGIQ retained ${findings.length} verified ${String(family).replaceAll('_', ' ')} regulatory candidates after the live investigator exceeded its interactive latency budget.`,
    findings,
    global_missing_evidence: [...new Set(findings.flatMap(item => item.missing_evidence))].slice(0, 12),
    _regiq: {
      candidate_family: family,
      candidate_mode: family ? 'curated_product_family' : 'general_context',
      draft_mode: 'browser_latency_guardrail',
      agent_used: false,
      degraded_reason: reason,
    },
  }

  return {
    stage: 'investigation',
    status: 'completed',
    elapsed_ms: Math.round(elapsedMs),
    degraded: true,
    model: 'latency_guardrail',
    candidate_family: family,
    candidate_count: findings.length,
    investigation,
  }
}

function fallbackVerification(identification, investigation, data, reason, elapsedMs) {
  const findings = Array.isArray(investigation?.findings) ? investigation.findings : []
  const reviews = findings.map(finding => ({
    act_id: finding.act_id,
    verdict: 'needs_more_evidence',
    reason: 'Retained conservatively because exact applicability depends on the listed missing product evidence; live independent verification exceeded the interactive latency budget.',
  }))

  const regimes = findings.map(finding => {
    const act = data?.acts?.[finding.act_id]
    if (!act) return null
    return {
      id: finding.act_id,
      title: act.title,
      legal_basis: act.legal_basis,
      classification: act.classification,
      source_url: act.source_url,
      status: finding.applicability || 'conditional',
      why: finding.why || act.summary,
      obligations: Array.isArray(finding.obligations) ? finding.obligations : [],
      conditions: Array.isArray(finding.missing_evidence) ? finding.missing_evidence : [],
      confidence: null,
      confidence_label: 'not_scored',
      verification: 'needs_more_evidence',
      verification_note: reviews.find(review => review.act_id === finding.act_id)?.reason,
      source_authority: act.source_type,
    }
  }).filter(Boolean)

  const verification = {
    reviews,
    overall_note: 'The live verifier exceeded the interactive latency budget. REGIQ preserved only verified catalog candidates and marked every finding as requiring more evidence.',
    _regiq: {
      verifier_mode: 'browser_latency_guardrail',
      agent_used: false,
      degraded_reason: reason,
    },
  }

  const profile = {
    status: 'conservative_staged_assessment',
    headline: investigation?.headline || 'Conservative regulatory screening',
    summary: investigation?.summary || 'REGIQ retained verified regulatory candidates with conservative evidence requirements.',
    regimes,
    dpp: {
      status: 'not_identified',
      label: 'No passport requirement established',
      explanation: 'No product-specific passport requirement is asserted by the latency guardrail. Exact scope must be established from authoritative product-specific rules and evidence.',
    },
    missing_evidence: [...new Set([
      ...(identification?.critical_unknowns || []),
      ...(investigation?.global_missing_evidence || []),
    ])].slice(0, 20),
    overall_confidence: null,
    overall_confidence_label: 'not_scored',
    investigation: {
      mode: 'staged_compact_corpus_with_browser_latency_guardrail',
      investigator_model: investigation?._regiq?.agent_used === false ? 'guardrail' : 'cloudflare-workers-ai',
      verifier_model: 'latency_guardrail',
      verifier_note: verification.overall_note,
      corpus_scope: 'verified REGIQ candidate subset',
      candidate_family: investigation?._regiq?.candidate_family || null,
    },
    reasoning_mode: 'staged_evidence_first_with_latency_guardrails',
    fallback_used: true,
    disclaimer: 'REGIQ retained only verified catalog candidates because live verification exceeded its latency budget. This is a screening aid, not legal advice.',
  }

  return {
    stage: 'verification',
    status: 'completed',
    elapsed_ms: Math.round(elapsedMs),
    degraded: true,
    model: 'latency_guardrail',
    verification,
    regulatory_profile: profile,
  }
}

async function guardedRequest(input, init, deadlineMs, fallbackFactory) {
  const started = performance.now()
  const controller = new AbortController()
  let timeoutId
  let timedOut = false

  const externalSignal = init?.signal
  const abortFromExternal = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal()
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true })
  }

  try {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort('REGIQ_STAGE_CLIENT_TIMEOUT')
    }, deadlineMs)

    const response = await rawFetch(input, { ...init, signal: controller.signal })
    if (response.ok) return response
    const elapsed = performance.now() - started
    return jsonResponse(await fallbackFactory(`HTTP_${response.status}`, elapsed))
  } catch (error) {
    const elapsed = performance.now() - started
    const reason = timedOut ? 'CLIENT_STAGE_TIMEOUT' : String(error?.name || error?.message || 'CLIENT_STAGE_ERROR')
    return jsonResponse(await fallbackFactory(reason, elapsed))
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal)
  }
}

window.fetch = async function regiqStageNetworkGuard(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()

  if (method === 'POST' && /\/api\/intelligence\/investigate(?:\?|$)/.test(url)) {
    const body = parseBody(init)
    return guardedRequest(input, init, INVESTIGATION_CLIENT_DEADLINE_MS, async (reason, elapsed) => {
      const data = await catalog()
      return fallbackInvestigation(body.identification || {}, data || {}, reason, elapsed)
    })
  }

  if (method === 'POST' && /\/api\/intelligence\/verify(?:\?|$)/.test(url)) {
    const body = parseBody(init)
    return guardedRequest(input, init, VERIFICATION_CLIENT_DEADLINE_MS, async (reason, elapsed) => {
      const data = await catalog()
      return fallbackVerification(body.identification || {}, body.investigation || {}, data || {}, reason, elapsed)
    })
  }

  return rawFetch(input, init)
}
