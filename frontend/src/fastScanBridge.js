const nativeFetch = window.fetch.bind(window)

let scanStartedAt = 0
let scanTimer = null
let lastFound = null

function emit(detail) {
  window.dispatchEvent(new CustomEvent('regiq-fastscan', { detail }))
}

function startClock() {
  scanStartedAt = performance.now()
  clearInterval(scanTimer)
  emit({ phase: 'searching', elapsed_ms: 0 })
  scanTimer = setInterval(() => {
    emit({ phase: 'searching', elapsed_ms: performance.now() - scanStartedAt })
  }, 80)
}

function stopClock() {
  clearInterval(scanTimer)
  scanTimer = null
}

function makeForm(file) {
  const data = new FormData()
  data.append('file', file)
  return data
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
    confidence_method: 'fast_cloudflare_object_description',
    recognition_mode: source.recognition_mode || 'fast_object_description',
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
      recognition_mode: source.recognition_mode || 'fast_object_description',
    },
  }
}

async function recoverIntelligence(fast, headers = {}) {
  if (fast?.identification?.status !== 'identified') return null
  const identification = normalizedFastIdentification(fast)
  try {
    const response = await nativeFetch('/api/scan/reassess', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        identification,
        gap_resolutions: [{
          gap: 'Generic product family',
          question: 'What generic product family is visible?',
          value: identification.product_type,
          evidence_level: 'machine_observed_fast_scan',
        }],
      }),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function composeRecoveredScan(original, recovered, fast) {
  const identification = recovered?.identification || normalizedFastIdentification(fast)
  const profile = recovered?.regulatory_profile || null
  return {
    ...(original || {}),
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
      status: 'pending',
      label: 'Product identified',
      scope_note: 'Regulatory intelligence is still being prepared.',
      classification: 'IDENTIFICATION_ONLY',
      legal_basis: null,
      source_url: null,
    },
    discovery: {
      status: profile ? 'ready_for_source_discovery' : 'intelligence_pending',
      message: profile ? 'Regulatory intelligence recovered from the fast product identity.' : 'Product identity is ready; intelligence is still pending.',
    },
    fast_scan: {
      elapsed_ms: fast?.elapsed_ms ?? lastFound?.elapsed_ms ?? null,
      mode: fast?.identification?.recognition_mode || 'fast_object_description',
    },
  }
}

async function interceptScan(input, init = {}) {
  const body = init?.body
  const file = body instanceof FormData ? body.get('file') : null
  if (!(file instanceof File)) return nativeFetch(input, init)

  startClock()

  const fastPromise = nativeFetch('/api/scan/fast-identify', {
    method: 'POST',
    body: makeForm(file),
  }).then(async response => response.ok ? response.json() : null).catch(() => null)

  const deepPromise = nativeFetch(input, init)

  const fast = await fastPromise
  if (fast?.identification?.status === 'identified') {
    const elapsed = Number.isFinite(fast.elapsed_ms) ? fast.elapsed_ms : performance.now() - scanStartedAt
    lastFound = { elapsed_ms: elapsed, identification: fast.identification }
    stopClock()
    emit({ phase: 'found', elapsed_ms: elapsed, identification: fast.identification })
  }

  let deepResponse
  try {
    deepResponse = await deepPromise
  } catch (error) {
    if (fast?.identification?.status !== 'identified') {
      stopClock()
      emit({ phase: 'failed' })
      throw error
    }
    const recovered = await recoverIntelligence(fast)
    return new Response(JSON.stringify(composeRecoveredScan({}, recovered, fast)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  let deepPayload = null
  try { deepPayload = await deepResponse.clone().json() } catch {}

  if (deepPayload?.identification?.status === 'identified') {
    if (!lastFound) {
      const elapsed = performance.now() - scanStartedAt
      lastFound = { elapsed_ms: elapsed, identification: deepPayload.identification }
      stopClock()
      emit({ phase: 'found', elapsed_ms: elapsed, identification: deepPayload.identification })
    }
    deepPayload.fast_scan = deepPayload.fast_scan || { elapsed_ms: lastFound?.elapsed_ms ?? null, mode: 'deep_scan' }
    return new Response(JSON.stringify(deepPayload), {
      status: deepResponse.status,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (fast?.identification?.status === 'identified') {
    emit({ phase: 'intelligence', elapsed_ms: lastFound?.elapsed_ms, identification: fast.identification })
    const recovered = await recoverIntelligence(fast)
    return new Response(JSON.stringify(composeRecoveredScan(deepPayload, recovered, fast)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  stopClock()
  emit({ phase: 'failed' })
  return deepResponse
}

window.fetch = function regiqFastFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()
  if (method === 'POST' && /\/api\/scan\/image(?:\?|$)/.test(url)) {
    return interceptScan(input, init)
  }
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

function addFoundBadge(elapsedMs) {
  const card = document.querySelector('.os-product-card')
  if (!card) return
  let badge = card.querySelector('.regiq-found-badge')
  if (!badge) {
    badge = document.createElement('div')
    badge.className = 'regiq-found-badge'
    card.appendChild(badge)
  }
  badge.textContent = `Found in ${(elapsedMs / 1000).toFixed(1)} s`
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
      overlay.querySelector('small').textContent = 'Match found · building intelligence'
      overlay.querySelector('.regiq-fast-time').textContent = `${(Number(detail.elapsed_ms || 0) / 1000).toFixed(1)} s`
    }
    setTimeout(() => addFoundBadge(Number(detail.elapsed_ms || 0)), 50)
  }
  if (detail.phase === 'intelligence' && overlay) {
    overlay.querySelector('small').textContent = 'Product found · verifying regulatory intelligence…'
  }
  if (detail.phase === 'failed' && overlay) {
    overlay.classList.add('failed')
    overlay.querySelector('strong').textContent = 'No confident match yet'
    overlay.querySelector('small').textContent = 'Try another angle or show a product label'
  }
})

const observer = new MutationObserver(() => {
  if (lastFound?.elapsed_ms != null) addFoundBadge(lastFound.elapsed_ms)
})
observer.observe(document.documentElement, { childList: true, subtree: true })
