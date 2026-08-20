const nativeFetch = window.fetch.bind(window)

const FAST_UI_DEADLINE_MS = 3500
const FAST_IMAGE_MAX_DIMENSION = 768
const FAST_IMAGE_QUALITY = 0.78

let scanStartedAt = 0
let scanTimer = null
let lastFound = null

function emitFast(detail) {
  window.dispatchEvent(new CustomEvent('regiq-fastscan', { detail }))
}

function emitActivity(detail) {
  window.dispatchEvent(new CustomEvent('regiq-activity', { detail }))
}

function stopFastClock() {
  clearInterval(scanTimer)
  scanTimer = null
}

function startFastClock() {
  scanStartedAt = performance.now()
  lastFound = null
  document.getElementById('regiq-fast-result-card')?.remove()
  document.querySelectorAll('.regiq-found-badge').forEach(node => node.remove())
  stopFastClock()
  emitFast({ phase: 'searching', elapsed_ms: 0 })
  scanTimer = setInterval(() => {
    const elapsed = performance.now() - scanStartedAt
    if (elapsed >= FAST_UI_DEADLINE_MS) {
      stopFastClock()
      emitFast({ phase: 'timeout', elapsed_ms: FAST_UI_DEADLINE_MS })
      return
    }
    emitFast({ phase: 'searching', elapsed_ms: elapsed })
  }, 80)
}

function makeForm(file) {
  const data = new FormData()
  data.append('file', file)
  return data
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

async function fastRequest(file) {
  const controller = new AbortController()
  let timeoutId
  const work = (async () => {
    const prepared = await prepareFastImage(file)
    const response = await nativeFetch('/api/scan/fast-identify', {
      method: 'POST',
      body: makeForm(prepared),
      signal: controller.signal,
    })
    return response.ok ? response.json() : null
  })().catch(() => null)

  const timeout = new Promise(resolve => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve({ __fast_timeout: true })
    }, FAST_UI_DEADLINE_MS)
  })

  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizedFastIdentification(fast) {
  const source = fast?.identification || {}
  const confidence = Number(source.confidence || 0)
  const pct = Math.max(0, Math.min(99, Math.round(confidence * 100)))
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

async function runJsonStage(id, label, subtitle, url, body) {
  const started = performance.now()
  emitActivity({ id, phase: 'start', label, subtitle, started_at: Date.now() })

  try {
    const response = await nativeFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    const elapsed = performance.now() - started

    if (!response.ok || !payload) {
      const error = new Error(payload?.detail || `HTTP ${response.status}`)
      error.stagePayload = payload
      throw error
    }

    emitActivity({
      id,
      phase: 'complete',
      label,
      elapsed_ms: elapsed,
      server_elapsed_ms: payload.elapsed_ms,
      degraded: Boolean(payload.degraded),
      message: payload.degraded
        ? (id === 'investigation' ? 'Curated candidate map used as a safe fallback' : 'Conservative verification fallback used')
        : null,
    })
    return payload
  } catch (error) {
    const elapsed = performance.now() - started
    emitActivity({ id, phase: 'error', label, elapsed_ms: elapsed, message: error?.message || 'Stage failed' })
    throw error
  }
}

async function stagedIntelligence(identification) {
  const investigationPayload = await runJsonStage(
    'investigation',
    'Regulatory investigation',
    'Mapping product evidence against a compact verified candidate corpus',
    '/api/intelligence/investigate',
    { identification },
  )

  const verificationPayload = await runJsonStage(
    'verification',
    'Independent verification',
    'Challenging candidate applicability and unsupported assumptions',
    '/api/intelligence/verify',
    { identification, investigation: investigationPayload.investigation },
  )

  return {
    investigation: investigationPayload.investigation,
    regulatory_profile: verificationPayload.regulatory_profile,
    stage_metrics: {
      investigation_ms: investigationPayload.elapsed_ms,
      verification_ms: verificationPayload.elapsed_ms,
      investigation_degraded: Boolean(investigationPayload.degraded),
      verification_degraded: Boolean(verificationPayload.degraded),
    },
  }
}

function composeScanResult(file, identification, profile, fast, stageMetrics = {}) {
  return {
    filename: file?.name || 'scan.jpg',
    content_type: file?.type || 'image/jpeg',
    identification,
    regulatory_profile: profile,
    regulatory: profile ? {
      status: profile.status,
      label: profile.headline,
      scope_note: profile.summary,
      classification: 'MULTI_REGIME_PROFILE',
      legal_basis: null,
      source_url: null,
    } : {
      status: 'temporarily_unavailable',
      label: 'Product identified',
      scope_note: 'Product identification succeeded, but regulatory intelligence could not be completed in this request.',
      classification: 'IDENTIFICATION_ONLY',
      legal_basis: null,
      source_url: null,
    },
    discovery: {
      status: profile ? 'ready_for_source_discovery' : 'intelligence_temporarily_unavailable',
      message: profile ? 'Staged investigator and verifier completed.' : 'The fast product identity is preserved; no unsupported regulatory conclusion was generated.',
    },
    fast_scan: {
      elapsed_ms: lastFound?.elapsed_ms ?? fast?.elapsed_ms ?? null,
      server_elapsed_ms: fast?.elapsed_ms ?? null,
      inference_ms: fast?.inference_ms ?? null,
      mode: fast?.identification?.recognition_mode || 'fast_vision',
    },
    stage_metrics: stageMetrics,
  }
}

async function fallbackDeepScan(input, init, reason = 'Fast identification unavailable') {
  const started = performance.now()
  emitActivity({
    id: 'deep-product',
    phase: 'start',
    label: 'Deep product analysis',
    subtitle: reason,
    started_at: Date.now(),
  })
  try {
    const response = await nativeFetch(input, init)
    const elapsed = performance.now() - started
    emitActivity({ id: 'deep-product', phase: 'complete', label: 'Deep product analysis', elapsed_ms: elapsed })
    const payload = await response.clone().json().catch(() => null)
    if (payload?.identification?.status === 'identified') {
      emitFast({ phase: 'deep-found', elapsed_ms: performance.now() - scanStartedAt, identification: payload.identification })
    }
    return response
  } catch (error) {
    emitActivity({ id: 'deep-product', phase: 'error', label: 'Deep product analysis', elapsed_ms: performance.now() - started, message: error?.message || 'Deep analysis failed' })
    throw error
  }
}

async function interceptScan(input, init = {}) {
  const body = init?.body
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof File)) return nativeFetch(input, init)

  window.dispatchEvent(new CustomEvent('regiq-activity-reset'))
  startFastClock()
  const fast = await fastRequest(file)
  const clientElapsed = performance.now() - scanStartedAt

  if (fast?.identification?.status === 'identified') {
    const elapsed = Math.min(clientElapsed, FAST_UI_DEADLINE_MS)
    lastFound = { elapsed_ms: elapsed, identification: fast.identification }
    stopFastClock()
    emitFast({ phase: 'found', elapsed_ms: elapsed, identification: fast.identification, metrics: fast })

    const identification = normalizedFastIdentification(fast)
    try {
      const staged = await stagedIntelligence(identification)
      const result = composeScanResult(file, identification, staged.regulatory_profile, fast, staged.stage_metrics)
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
    } catch (error) {
      emitActivity({
        id: 'staged-intelligence',
        phase: 'error',
        label: 'Regulatory intelligence',
        elapsed_ms: 0,
        message: 'Product identity preserved · staged regulatory service unavailable',
      })
      const result = composeScanResult(file, identification, null, fast, { error: error?.message || 'staged_intelligence_failed' })
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
    }
  }

  stopFastClock()
  if (fast?.__fast_timeout || fast?.diagnostic_code === 'FAST_RECOGNITION_TIMEOUT') {
    emitFast({ phase: 'timeout', elapsed_ms: Math.min(clientElapsed, FAST_UI_DEADLINE_MS) })
    return fallbackDeepScan(input, init, 'Instant recognition timed out · resolving with deeper vision')
  }

  emitFast({ phase: 'no-match', elapsed_ms: clientElapsed })
  return fallbackDeepScan(input, init, 'No instant match · resolving with deeper vision')
}

window.fetch = function regiqStagedFetchV2(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()
  if (method === 'POST' && /\/api\/scan\/image(?:\?|$)/.test(url)) return interceptScan(input, init)
  return nativeFetch(input, init)
}

function ensureOverlay() {
  const preview = document.querySelector('.os-preview')
  if (!preview) return null
  let overlay = preview.querySelector('.regiq-fast-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.className = 'regiq-fast-overlay'
    overlay.innerHTML = `
      <div class="regiq-fast-radar"><span></span></div>
      <div class="regiq-fast-copy">
        <strong>Scanning product</strong>
        <small>Searching visual identity</small>
      </div>
      <div class="regiq-fast-time">0.0 s</div>
    `
    preview.appendChild(overlay)
  }
  return overlay
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]))
}

function showFastResultCard(detail) {
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

function addFoundBadge(elapsedMs, label = 'Found') {
  const card = document.querySelector('.os-product-card')
  if (!card) return
  document.getElementById('regiq-fast-result-card')?.remove()
  let badge = card.querySelector('.regiq-found-badge')
  if (!badge) {
    badge = document.createElement('div')
    badge.className = 'regiq-found-badge'
    card.appendChild(badge)
  }
  badge.textContent = `${label} in ${(elapsedMs / 1000).toFixed(1)} s`
}

window.addEventListener('regiq-fastscan', event => {
  const detail = event.detail || {}
  const overlay = ensureOverlay()

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
    showFastResultCard(detail)
    setTimeout(() => addFoundBadge(Number(detail.elapsed_ms || 0)), 50)
  }

  if (detail.phase === 'timeout' || detail.phase === 'no-match') {
    if (!overlay) return
    overlay.classList.add('failed')
    overlay.querySelector('strong').textContent = detail.phase === 'timeout' ? 'Quick scan timed out' : 'No instant match'
    overlay.querySelector('small').textContent = 'Deeper product analysis starts'
    overlay.querySelector('.regiq-fast-time').textContent = `${(Number(detail.elapsed_ms || 0) / 1000).toFixed(1)} s`
  }

  if (detail.phase === 'deep-found') {
    if (overlay) {
      overlay.classList.add('found')
      overlay.querySelector('strong').textContent = detail.identification?.product_type || 'Product found'
      overlay.querySelector('small').textContent = 'Resolved by deeper product analysis'
      overlay.querySelector('.regiq-fast-time').textContent = `${(Number(detail.elapsed_ms || 0) / 1000).toFixed(1)} s`
    }
    setTimeout(() => addFoundBadge(Number(detail.elapsed_ms || 0), 'Resolved'), 50)
  }
})

const observer = new MutationObserver(() => {
  if (lastFound?.elapsed_ms != null) addFoundBadge(lastFound.elapsed_ms)
})
observer.observe(document.documentElement, { childList: true, subtree: true })
