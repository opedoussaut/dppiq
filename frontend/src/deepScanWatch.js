const bridgedFetch = window.fetch.bind(window)

let active = false
let deepStartedAt = 0
let deepTimer = null
let deepArmed = false
let quickElapsedMs = null

function ensureStyles() {
  if (document.getElementById('regiq-deep-watch-style')) return
  const style = document.createElement('style')
  style.id = 'regiq-deep-watch-style'
  style.textContent = `
    .regiq-deep-watch {
      position: absolute;
      z-index: 13;
      top: 98px;
      left: 20px;
      right: 20px;
      min-height: 58px;
      display: none;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 18px;
      color: #fff;
      border: 1px solid rgba(176, 135, 255, .28);
      background: rgba(38, 25, 66, .78);
      backdrop-filter: blur(18px) saturate(160%);
      -webkit-backdrop-filter: blur(18px) saturate(160%);
      box-shadow: 0 14px 36px rgba(24, 12, 46, .22);
    }
    .regiq-deep-watch.running { display: flex; }
    .regiq-deep-watch.ready {
      display: flex;
      border-color: rgba(69, 213, 145, .26);
      background: rgba(10, 45, 35, .82);
    }
    .regiq-deep-watch.error {
      display: flex;
      border-color: rgba(255, 170, 78, .28);
      background: rgba(60, 32, 13, .82);
    }
    .regiq-deep-watch-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 auto;
      background: #a78bfa;
      box-shadow: 0 0 0 6px rgba(167,139,250,.12), 0 0 16px rgba(167,139,250,.7);
      animation: regiqDeepPulse 1.2s ease-in-out infinite;
    }
    .regiq-deep-watch.ready .regiq-deep-watch-dot {
      background: #36d98c;
      box-shadow: 0 0 0 6px rgba(54,217,140,.12), 0 0 16px rgba(54,217,140,.7);
      animation: none;
    }
    .regiq-deep-watch.error .regiq-deep-watch-dot {
      background: #ffad55;
      box-shadow: 0 0 0 6px rgba(255,173,85,.12);
      animation: none;
    }
    .regiq-deep-watch-copy {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .regiq-deep-watch-copy strong { font-size: 13px; }
    .regiq-deep-watch-copy small { color: rgba(255,255,255,.64); font-size: 10px; }
    .regiq-deep-watch-time {
      min-width: 58px;
      text-align: right;
      font-size: 13px;
      font-weight: 760;
      font-variant-numeric: tabular-nums;
    }
    @keyframes regiqDeepPulse {
      50% { opacity: .45; transform: scale(.82); }
    }
    @media (max-width: 640px) {
      .regiq-deep-watch { top: 82px; left: 12px; right: 12px; min-height: 54px; border-radius: 16px; }
      .regiq-deep-watch-time { min-width: 50px; }
    }
  `
  document.head.appendChild(style)
}

function ensureWatch() {
  ensureStyles()
  const preview = document.querySelector('.os-preview')
  if (!preview) return null
  let watch = preview.querySelector('.regiq-deep-watch')
  if (!watch) {
    watch = document.createElement('div')
    watch.className = 'regiq-deep-watch'
    watch.innerHTML = `
      <span class="regiq-deep-watch-dot"></span>
      <div class="regiq-deep-watch-copy">
        <strong>Deep analysis</strong>
        <small>Investigating product and regulatory signals</small>
      </div>
      <div class="regiq-deep-watch-time">0.0 s</div>
    `
    preview.appendChild(watch)
  }
  return watch
}

function resetWatch() {
  clearInterval(deepTimer)
  deepTimer = null
  deepStartedAt = 0
  deepArmed = false
  quickElapsedMs = null
  document.querySelectorAll('.regiq-deep-watch').forEach(node => node.remove())
}

function renderTime(ms) {
  return `${(Math.max(0, Number(ms || 0)) / 1000).toFixed(1)} s`
}

function startDeep(reason = 'analysis', instantElapsed = null) {
  if (!active || deepStartedAt) return
  quickElapsedMs = Number.isFinite(instantElapsed) ? instantElapsed : quickElapsedMs
  deepStartedAt = performance.now()
  const watch = ensureWatch()
  if (!watch) return
  watch.classList.remove('ready', 'error')
  watch.classList.add('running')
  watch.querySelector('strong').textContent = reason === 'matched' ? 'Deep regulatory analysis' : 'Deep product analysis'
  watch.querySelector('small').textContent = reason === 'matched'
    ? 'Product found · investigating and verifying regulation'
    : 'Instant scan finished · using deeper vision and regulatory reasoning'
  watch.querySelector('.regiq-deep-watch-time').textContent = '0.0 s'

  clearInterval(deepTimer)
  deepTimer = setInterval(() => {
    const current = ensureWatch()
    if (!current || !deepStartedAt) return
    current.querySelector('.regiq-deep-watch-time').textContent = renderTime(performance.now() - deepStartedAt)
  }, 100)
}

function finishDeep(ok = true) {
  if (!deepStartedAt) return
  const elapsed = performance.now() - deepStartedAt
  clearInterval(deepTimer)
  deepTimer = null
  const watch = ensureWatch()
  if (!watch) return
  watch.classList.remove('running')
  watch.classList.add(ok ? 'ready' : 'error')
  watch.querySelector('strong').textContent = ok ? 'Analysis ready' : 'Analysis interrupted'
  watch.querySelector('small').textContent = quickElapsedMs != null
    ? `Instant stage ${renderTime(quickElapsedMs)} · deeper stage complete`
    : 'Deeper stage complete'
  watch.querySelector('.regiq-deep-watch-time').textContent = renderTime(elapsed)
}

window.addEventListener('regiq-fastscan', event => {
  if (!active) return
  const detail = event.detail || {}
  if (detail.phase === 'found') {
    quickElapsedMs = Number(detail.elapsed_ms || 0)
    startDeep('matched', quickElapsedMs)
  }
  if (detail.phase === 'timeout' || detail.phase === 'no-match') {
    quickElapsedMs = Number(detail.elapsed_ms || 0)
    startDeep('fallback', quickElapsedMs)
  }
})

window.fetch = function regiqDeepWatchFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase()
  const isFullScan = method === 'POST' && /\/api\/scan\/image(?:\?|$)/.test(url)
  if (!isFullScan) return bridgedFetch(input, init)

  resetWatch()
  active = true
  deepArmed = true

  const fallbackArm = setTimeout(() => {
    if (active && deepArmed && !deepStartedAt) startDeep('fallback', 3500)
  }, 3600)

  const work = bridgedFetch(input, init)
  return Promise.resolve(work).then(
    response => {
      clearTimeout(fallbackArm)
      if (!deepStartedAt) startDeep('fallback', quickElapsedMs)
      finishDeep(response?.ok !== false)
      active = false
      return response
    },
    error => {
      clearTimeout(fallbackArm)
      if (!deepStartedAt) startDeep('fallback', quickElapsedMs)
      finishDeep(false)
      active = false
      throw error
    },
  )
}
