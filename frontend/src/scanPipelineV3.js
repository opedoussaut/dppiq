import catalog from '../../data/regulatory_catalog.json'

const rawFetch = window.fetch.bind(window)

const FAST_DEADLINE_MS = 3500
const INVESTIGATION_DEADLINE_MS = 7000
const VERIFICATION_DEADLINE_MS = 5000
const FAST_IMAGE_MAX_DIMENSION = 768
const FAST_IMAGE_QUALITY = 0.78

let scanStartedAt = 0
let lastFast = null
let fastTimer = null

function emitFast(detail) {
  window.dispatchEvent(new CustomEvent('regiq-fastscan', { detail }))
}

function emitActivity(detail) {
  window.dispatchEvent(new CustomEvent('regiq-activity', { detail }))
}

function resetActivities() {
  window.dispatchEvent(new CustomEvent('regiq-activity-reset'))
}

function stopFastTimer() {
  if (fastTimer) clearInterval(fastTimer)
  fastTimer = null
}

function startFastTimer() {
  scanStartedAt = performance.now()
  lastFast = null
  stopFastTimer()
  emitFast({ phase: 'searching', elapsed_ms: 0 })
  fastTimer = setInterval(() => {
    emitFast({ phase: 'searching', elapsed_ms: performance.now() - scanStartedAt })
  }, 80)
}

async function prepareFastImage(file) {
  if (!('createImageBitmap' in window)) return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
    const maxSide = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, FAST_IMAGE_MAX_DIMENSION / Math.max(1, maxSide))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', FAST_IMAGE_QUALITY))
    if (!blob) return file
    return new File([blob], 'regiq-fast.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}

function formWith(file) {
  const data = new FormData()
  data.append('file', file)
  return data
}

async function fetchWithDeadline(url, init, deadlineMs) {
  const controller = new AbortController()
  const externalSignal = init?.signal
  const forwardAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) forwardAbort()
    else externalSignal.addEventListener('abort', forwardAbort, { once: true })
  }

  const timeoutId = setTimeout(() => controller.abort('REGIQ_CLIENT_DEADLINE'), deadlineMs)
  try {
    return await rawFetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort)
  }
}

async function fastIdentify(file) {
  const prepared = await prepareFastImage(file)
  try {
    const response = await fetchWithDeadline('/api/scan/fast-identify', {
      method: 'POST',
      body: formWith(prepared),
    }, FAST_DEADLINE_MS)
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

function normalizedIdentification(fast) {
  const source = fast?.identification || {}
  const confidence = Math.max(0, Math.min(1, Number(source.confidence || 0)))
  const pct = Math.round(confidence * 100)
  return {
    status: 'identified',
    product_type: source.product_type,
    category: source.category || 'other',
    brand: null,
    model: null,
    confidence,
    product_family_confidence: pct,
    visual_evidence_confidence: pct,
    exact_product_confidence: 0,
    confidence_method: 'fast_cloudflare_vision',
    recognition_mode: source.recognition_mode || 'fast_vision',
    provider: 'cloudflare-workers-ai',
    supported_facts: [`Generic product family visually identified as ${source.product_type}.`],
    critical_unknowns: [
      'Exact brand and model are not established by the fast scan.',
      'Hidden technical characteristics must be confirmed when they affect regulatory applicability.',
    ],
    alternative_families: [],
    visible_text: [],
    visual_evidence: {
      objects: [source.product_type],
      plain_observation: String(fast?.description || '').slice(0, 2200),
      image_quality: 'usable',
      recognition_mode: source.recognition_mode || 'fast_vision',
    },
  }
}

function resolveFamily(identification) {
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

function fallbackInvestigation(identification, reason = 'interactive_guardrail') {
  const family = resolveFamily(identification)
  let ids = family ? (catalog.product_families?.[family] || []) : []
  if (!ids.length) ids = ['gpsr-2023-988', 'reach-1907-2006', 'espr-2024-1781'].filter(id => catalog.acts?.[id])
  const general = !family

  const findings = ids.map(id => {
    const act = catalog.acts?.[id]
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

  return {
    stage: 'investigation',
    status: 'completed',
    elapsed_ms: INVESTIGATION_DEADLINE_MS,
    degraded: true,
    model: 'client_guardrail',
    candidate_family: family,
    candidate_count: findings.length,
    investigation: {
      headline: general ? 'General regulatory screening context' : 'Reference-family regulatory candidates identified',
      summary: general
        ? 'REGIQ retained general EU screening context because live investigation did not complete inside the interactive latency budget.'
        : `REGIQ retained ${findings.length} verified ${String(family).replaceAll('_', ' ')} regulatory candidates because live investigation did not complete inside the interactive latency budget.`,
      findings,
      global_missing_evidence: [...new Set(findings.flatMap(item => item.missing_evidence))].slice(0, 12),
      _regiq: {
        candidate_family: family,
        candidate_mode: family ? 'curated_product_family' : 'general_context',
        draft_mode: 'client_guardrail',
        agent_used: false,
        degraded_reason: reason,
      },
    },
  }
}

function fallbackVerification(identification, investigation, reason = 'interactive_guardrail') {
  const findings = Array.isArray(investigation?.findings) ? investigation.findings : []
  const regimes = findings.map(finding => {
    const act = catalog.acts?.[finding.act_id]
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
      verification_note: 'Retained conservatively because exact applicability depends on missing product evidence.',
      source_authority: act.source_type,
    }
  }).filter(Boolean)

  const missing = [...new Set([
    ...(identification?.critical_unknowns || []),
    ...(investigation?.global_missing_evidence || []),
  ])].slice(0, 20)

  return {
    stage: 'verification',
    status: 'completed',
    elapsed_ms: VERIFICATION_DEADLINE_MS,
    degraded: true,
    model: 'client_guardrail',
    verification: {
      reviews: regimes.map(regime => ({
        act_id: regime.id,
        verdict: 'needs_more_evidence',
        reason: regime.verification_note,
      })),
      overall_note: 'Live independent verification did not complete inside the interactive latency budget. REGIQ retained only verified catalog candidates and marked them as requiring more evidence.',
      _regiq: { verifier_mode: 'client_guardrail', agent_used: false, degraded_reason: reason },
    },
    regulatory_profile: {
      status: 'conservative_staged_assessment',
      headline: investigation?.headline || 'Conservative regulatory screening',
      summary: investigation?.summary || 'REGIQ retained verified regulatory candidates with conservative evidence requirements.',
      regimes,
      dpp: {
        status: 'not_identified',
        label: 'No passport requirement established',
        explanation: 'No product-specific passport requirement is asserted by the latency guardrail.',
      },
      missing_evidence: missing,
      overall_confidence: null,
      overall_confidence_label: 'not_scored',
      investigation: {
        mode: 'staged_compact_corpus_with_client_guardrails',
        investigator_model: investigation?._regiq?.agent_used === false ? 'guardrail' : 'cloudflare-workers-ai',
        verifier_model: 'guardrail',
        verifier_note: 'Conservative verification guardrail used.',
        corpus_scope: 'verified REGIQ candidate subset',
        candidate_family: investigation?._regiq?.candidate_family || null,
      },
      reasoning_mode: 'staged_evidence_first_with_client_guardrails',
      fallback_used: true,
      disclaimer: 'REGIQ retained only verified catalog candidates because live verification exceeded its interactive budget. This is a screening aid, not legal advice.',
    },
  }
}

async function runStage({ id, label, subtitle, url, body, deadlineMs, fallback }) {
  const started = performance.now()
  emitActivity({ id, phase: 'start', label, subtitle, started_at: Date.now() })
  let payload = null
  let degraded = false
  let reason = null

  try {
    const response = await fetchWithDeadline(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, deadlineMs)
    if (!response.ok) throw new Error(`HTTP_${response.status}`)
    payload = await response.json()
    if (!payload?.status) throw new Error('INVALID_STAGE_PAYLOAD')
    degraded = Boolean(payload.degraded)
  } catch (error) {
    reason = String(error?.name === 'AbortError' ? 'CLIENT_TIMEOUT' : error?.message || 'CLIENT_STAGE_ERROR')
    payload = fallback(reason)
    degraded = true
  }

  const elapsed = performance.now() - started
  emitActivity({
    id,
    phase: 'complete',
    label,
    elapsed_ms: elapsed,
    degraded,
    message: degraded
      ? (id === 'investigation' ? 'Completed with curated REGIQ guardrails' : 'Completed with conservative verification guardrails')
      : null,
  })
  return payload
}

function composeResult(file, identification, fast, investigationPayload, verificationPayload) {
  return {
    filename: file?.name || 'scan.jpg',
    content_type: file?.type || 'image/jpeg',
    identification,
    regulatory_profile: verificationPayload.regulatory_profile,
    regulatory: {
      status: verificationPayload.regulatory_profile?.status || 'conservative_staged_assessment',
      label: verificationPayload.regulatory_profile?.headline || 'Regulatory screening completed',
      scope_note: verificationPayload.regulatory_profile?.summary || '',
      classification: 'MULTI_REGIME_PROFILE',
      legal_basis: null,
      source_url: null,
    },
    discovery: {
      status: 'ready_for_source_discovery',
      message: 'Product identity, regulatory investigation and verification completed.',
    },
    fast_scan: {
      elapsed_ms: lastFast?.elapsed_ms ?? fast?.elapsed_ms ?? null,
      server_elapsed_ms: fast?.elapsed_ms ?? null,
      inference_ms: fast?.inference_ms ?? null,
      mode: fast?.identification?.recognition_mode || 'fast_vision',
    },
    stage_metrics: {
      investigation_ms: investigationPayload.elapsed_ms,
      verification_ms: verificationPayload.elapsed_ms,
      investigation_degraded: Boolean(investigationPayload.degraded),
      verification_degraded: Boolean(verificationPayload.degraded),
    },
  }
}

async function deepFallback(input, init, reason) {
  const started = performance.now()
  emitActivity({ id: 'deep-product', phase: 'start', label: 'Deep product analysis', subtitle: reason, started_at: Date.now() })
  try {
    const response = await rawFetch(input, init)
    emitActivity({ id: 'deep-product', phase: 'complete', label: 'Deep product analysis', elapsed_ms: performance.now() - started })
    return response
  } catch (error) {
    emitActivity({ id: 'deep-product', phase: 'error', label: 'Deep product analysis', elapsed_ms: performance.now() - started, message: error?.message || 'Deep product analysis failed' })
    throw error
  }
}

async function orchestrateScan(input, init = {}) {
  const body = init?.body
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof File)) return rawFetch(input, init)

  resetActivities()
  startFastTimer()

  const fast = await fastIdentify(file)
  const fastElapsed = performance.now() - scanStartedAt

  if (fast?.identification?.status !== 'identified') {
    stopFastTimer()
    emitFast({ phase: fastElapsed >= FAST_DEADLINE_MS ? 'timeout' : 'no-match', elapsed_ms: Math.min(fastElapsed, FAST_DEADLINE_MS) })
    return deepFallback(input, init, 'Instant recognition unavailable · resolving with deeper vision')
  }

  stopFastTimer()
  lastFast = { elapsed_ms: fastElapsed, identification: fast.identification }
  emitFast({ phase: 'found', elapsed_ms: fastElapsed, identification: fast.identification, metrics: fast })

  const identification = normalizedIdentification(fast)

  const investigationPayload = await runStage({
    id: 'investigation',
    label: 'Regulatory investigation',
    subtitle: 'Mapping product evidence against a compact verified candidate corpus',
    url: '/api/intelligence/investigate',
    body: { identification },
    deadlineMs: INVESTIGATION_DEADLINE_MS,
    fallback: reason => fallbackInvestigation(identification, reason),
  })

  const verificationPayload = await runStage({
    id: 'verification',
    label: 'Independent verification',
    subtitle: 'Challenging candidate applicability and unsupported assumptions',
    url: '/api/intelligence/verify',
    body: { identification, investigation: investigationPayload.investigation },
    deadlineMs: VERIFICATION_DEADLINE_MS,
    fallback: reason => fallbackVerification(identification, investigationPayload.investigation, reason),
  })

  const result = composeResult(file, identification, fast, investigationPayload, verificationPayload)
  emitActivity({
    id: 'dossier',
    phase: 'complete',
    label: 'Regulatory dossier ready',
    elapsed_ms: performance.now() - scanStartedAt,
    degraded: Boolean(result.stage_metrics.investigation_degraded || result.stage_metrics.verification_degraded),
    message: result.stage_metrics.investigation_degraded || result.stage_metrics.verification_degraded
      ? 'Dossier ready with conservative REGIQ guardrails'
      : 'Dossier ready',
  })
  emitFast({ phase: 'ready', elapsed_ms: performance.now() - scanStartedAt, identification: fast.identification })

  document.getElementById('regiq-fast-result-card')?.remove()
  return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
}

window.fetch = function regiqScanPipelineV3(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()
  if (method === 'POST' && /\/api\/scan\/image(?:\?|$)/.test(url)) return orchestrateScan(input, init)
  return rawFetch(input, init)
}

function ensureFastOverlay() {
  const preview = document.querySelector('.os-preview')
  if (!preview) return null
  let overlay = preview.querySelector('.regiq-fast-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.className = 'regiq-fast-overlay'
    overlay.innerHTML = `
      <div class="regiq-fast-radar"><span></span></div>
      <div class="regiq-fast-copy"><strong>Scanning product</strong><small>Searching visual identity</small></div>
      <div class="regiq-fast-time">0.0 s</div>
    `
    preview.appendChild(overlay)
  }
  return overlay
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]))
}

function showFastCard(detail) {
  const rail = document.querySelector('.os-scan-result')
  if (!rail || !detail?.identification?.product_type) return
  let card = document.getElementById('regiq-fast-result-card')
  if (!card) {
    card = document.createElement('article')
    card.id = 'regiq-fast-result-card'
    card.className = 'os-card regiq-fast-result-card'
    rail.prepend(card)
  }
  const seconds = (Number(detail.elapsed_ms || 0) / 1000).toFixed(1)
  const confidence = Math.round(Number(detail.identification.confidence || 0) * 100)
  card.innerHTML = `
    <div class="regiq-fast-result-copy">
      <span class="os-overline">MATCH FOUND</span>
      <h2>${escapeHtml(detail.identification.product_type)}</h2>
      <p>Generic product family${confidence ? ` · ${confidence}% signal` : ''}</p>
      <div class="regiq-fast-building"><span></span> Building regulatory intelligence…</div>
    </div>
    <div class="regiq-fast-found-time"><strong>${seconds}</strong><span>seconds</span></div>
  `
}

window.addEventListener('regiq-fastscan', event => {
  const detail = event.detail || {}
  const overlay = ensureFastOverlay()

  if (detail.phase === 'searching') {
    if (!overlay) return
    overlay.classList.remove('found', 'failed')
    overlay.style.display = 'flex'
    overlay.querySelector('strong').textContent = 'Scanning product'
    overlay.querySelector('small').textContent = detail.elapsed_ms > 1200 ? 'Searching visual identity…' : 'Looking for a match…'
    overlay.querySelector('.regiq-fast-time').textContent = `${(Number(detail.elapsed_ms || 0) / 1000).toFixed(1)} s`
  }

  if (detail.phase === 'found') {
    if (overlay) {
      overlay.classList.add('found')
      overlay.querySelector('strong').textContent = detail.identification?.product_type || 'Product found'
      overlay.querySelector('small').textContent = 'Match found · regulatory investigation starts'
      overlay.querySelector('.regiq-fast-time').textContent = `${(Number(detail.elapsed_ms || 0) / 1000).toFixed(1)} s`
    }
    showFastCard(detail)
  }

  if (detail.phase === 'timeout' || detail.phase === 'no-match') {
    if (!overlay) return
    overlay.classList.add('failed')
    overlay.querySelector('strong').textContent = detail.phase === 'timeout' ? 'Quick scan timed out' : 'No instant match'
    overlay.querySelector('small').textContent = 'Deeper product analysis starts'
    overlay.querySelector('.regiq-fast-time').textContent = `${(Number(detail.elapsed_ms || 0) / 1000).toFixed(1)} s`
  }

  if (detail.phase === 'ready') {
    if (!overlay) return
    overlay.classList.add('found')
    overlay.querySelector('small').textContent = 'Regulatory dossier ready'
  }
})
