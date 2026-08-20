const nativeFetch = window.fetch.bind(window)

let selectionActive = false
let detectedElapsedMs = null

function isFastIdentify(url, method) {
  return method === 'POST' && /\/api\/scan\/fast-identify(?:\?|$)/.test(url)
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]))
}

function confidencePercent(candidate) {
  const value = Number(candidate?.confidence || 0)
  return Math.max(0, Math.min(99, Math.round(value * 100)))
}

function removeChooser() {
  document.getElementById('regiq-object-chooser')?.remove()
  document.body.classList.remove('regiq-object-choice-active')
}

function waitForPreview(timeoutMs = 1200) {
  return new Promise(resolve => {
    const existing = document.querySelector('.os-preview')
    if (existing) return resolve(existing)
    const started = performance.now()
    const timer = setInterval(() => {
      const preview = document.querySelector('.os-preview')
      if (preview || performance.now() - started > timeoutMs) {
        clearInterval(timer)
        resolve(preview || document.body)
      }
    }, 30)
  })
}

async function chooseCandidate(candidates, elapsedMs) {
  const host = await waitForPreview()
  removeChooser()
  document.body.classList.add('regiq-object-choice-active')

  const overlay = document.querySelector('.regiq-fast-overlay')
  if (overlay) overlay.style.setProperty('display', 'none', 'important')

  return new Promise(resolve => {
    const chooser = document.createElement('section')
    chooser.id = 'regiq-object-chooser'
    chooser.className = 'regiq-object-chooser'
    chooser.setAttribute('role', 'dialog')
    chooser.setAttribute('aria-modal', 'true')
    chooser.setAttribute('aria-label', 'Choose an object to investigate')

    const seconds = (Number(elapsedMs || 0) / 1000).toFixed(1)
    chooser.innerHTML = `
      <div class="regiq-object-chooser-head">
        <div>
          <span class="regiq-object-kicker">${candidates.length} OBJECTS FOUND · ${seconds} S</span>
          <h2>What do you want to investigate?</h2>
          <p>REGIQ detected several physical objects in this frame. Choose one to continue into regulatory intelligence.</p>
        </div>
        <div class="regiq-object-scan-mark"><span></span></div>
      </div>
      <div class="regiq-object-grid">
        ${candidates.map((candidate, index) => `
          <button type="button" class="regiq-object-option" data-object-index="${index}">
            <span class="regiq-object-index">${String(index + 1).padStart(2, '0')}</span>
            <span class="regiq-object-name">${escapeHtml(candidate.product_type)}</span>
            <span class="regiq-object-confidence">${confidencePercent(candidate)}%</span>
            <span class="regiq-object-arrow">→</span>
          </button>
        `).join('')}
      </div>
      <div class="regiq-object-foot">Only the object you choose will be sent to the regulatory investigator.</div>
    `

    chooser.querySelectorAll('.regiq-object-option').forEach(button => {
      button.addEventListener('click', () => {
        const selected = candidates[Number(button.dataset.objectIndex)] || candidates[0]
        removeChooser()
        if (overlay) overlay.style.removeProperty('display')
        resolve(selected)
      })
    })

    host.appendChild(chooser)
  })
}

window.addEventListener('regiq-fastscan', event => {
  const detail = event.detail || {}
  if (selectionActive && detail.phase === 'searching') {
    event.stopImmediatePropagation()
    return
  }
  if (detail.phase === 'found' && detectedElapsedMs != null) {
    detail.elapsed_ms = detectedElapsedMs
    detectedElapsedMs = null
  }
})

window.fetch = async function regiqMultiObjectFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()

  if (!isFastIdentify(url, method)) return nativeFetch(input, init)

  const response = await nativeFetch(input, init)
  if (!response.ok) return response

  const payload = await response.clone().json().catch(() => null)
  const candidates = Array.isArray(payload?.candidates)
    ? payload.candidates.filter(candidate => candidate?.product_type).slice(0, 8)
    : []

  if (candidates.length <= 1) return response

  selectionActive = true
  detectedElapsedMs = Number(payload.elapsed_ms || payload.inference_ms || 0)
  let selected
  try {
    selected = await chooseCandidate(candidates, detectedElapsedMs)
  } finally {
    selectionActive = false
  }

  const chosen = selected || candidates[0]
  const next = {
    ...payload,
    identification: {
      status: 'identified',
      product_type: chosen.product_type,
      category: chosen.category || 'other',
      confidence: Number(chosen.confidence || 0.8),
      recognition_mode: 'moondream31_multi_object_user_selected',
    },
    selection: {
      required: true,
      candidate_count: candidates.length,
      selected_id: chosen.id || null,
      selected_product_type: chosen.product_type,
    },
  }

  return new Response(JSON.stringify(next), {
    status: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
