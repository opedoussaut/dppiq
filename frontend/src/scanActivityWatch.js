const timers = new Map()
const states = new Map()

function renderTime(ms) {
  return `${(Math.max(0, Number(ms || 0)) / 1000).toFixed(1)} s`
}

function ensureStyles() {
  if (document.getElementById('regiq-activity-style')) return
  const style = document.createElement('style')
  style.id = 'regiq-activity-style'
  style.textContent = `
    .regiq-activity-stack {
      position: absolute;
      z-index: 14;
      top: 118px;
      left: 20px;
      right: 20px;
      display: grid;
      gap: 14px;
      pointer-events: none;
    }
    .regiq-activity-watch {
      min-height: 58px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      padding: 10px 14px;
      border-radius: 18px;
      color: #fff;
      border: 1px solid rgba(176,135,255,.25);
      background: rgba(42,28,70,.80);
      backdrop-filter: blur(18px) saturate(160%);
      -webkit-backdrop-filter: blur(18px) saturate(160%);
      box-shadow: 0 14px 34px rgba(18,10,35,.20);
      animation: regiqActivityIn .22s ease both;
      transition: background .25s ease, border-color .25s ease, opacity .25s ease;
    }
    .regiq-activity-watch[data-id="verification"] {
      background: rgba(22,45,80,.82);
      border-color: rgba(93,169,255,.25);
    }
    .regiq-activity-watch[data-id="deep-product"] {
      background: rgba(74,43,17,.82);
      border-color: rgba(255,174,84,.28);
    }
    .regiq-activity-watch.complete {
      background: rgba(10,48,37,.84);
      border-color: rgba(65,222,149,.28);
    }
    .regiq-activity-watch.degraded {
      background: rgba(74,52,18,.84);
      border-color: rgba(255,193,92,.34);
    }
    .regiq-activity-watch.error {
      background: rgba(67,29,24,.84);
      border-color: rgba(255,111,96,.28);
    }
    .regiq-activity-dot {
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: #a78bfa;
      box-shadow: 0 0 0 6px rgba(167,139,250,.12), 0 0 16px rgba(167,139,250,.7);
      animation: regiqActivityPulse 1.15s ease-in-out infinite;
    }
    .regiq-activity-watch[data-id="verification"] .regiq-activity-dot {
      background: #5da9ff;
      box-shadow: 0 0 0 6px rgba(93,169,255,.12), 0 0 16px rgba(93,169,255,.7);
    }
    .regiq-activity-watch[data-id="deep-product"] .regiq-activity-dot {
      background: #ffad55;
      box-shadow: 0 0 0 6px rgba(255,173,85,.12), 0 0 16px rgba(255,173,85,.55);
    }
    .regiq-activity-watch.complete .regiq-activity-dot {
      background: #36d98c;
      box-shadow: 0 0 0 6px rgba(54,217,140,.12), 0 0 16px rgba(54,217,140,.7);
      animation: none;
    }
    .regiq-activity-watch.degraded .regiq-activity-dot {
      background: #ffc15c;
      box-shadow: 0 0 0 6px rgba(255,193,92,.13), 0 0 16px rgba(255,193,92,.5);
      animation: none;
    }
    .regiq-activity-watch.error .regiq-activity-dot {
      background: #ff7566;
      box-shadow: 0 0 0 6px rgba(255,117,102,.12);
      animation: none;
    }
    .regiq-activity-copy {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .regiq-activity-copy strong { font-size: 13px; }
    .regiq-activity-copy small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(255,255,255,.64);
      font-size: 10px;
    }
    .regiq-activity-time {
      min-width: 62px;
      text-align: right;
      font-size: 13px;
      font-weight: 760;
      font-variant-numeric: tabular-nums;
    }
    @keyframes regiqActivityPulse { 50% { opacity:.45; transform:scale(.82); } }
    @keyframes regiqActivityIn { from { opacity:0; transform:translateY(-5px) } to { opacity:1; transform:none } }
    @media (max-width: 640px) {
      .regiq-activity-stack { top: 88px; left: 12px; right: 12px; gap: 10px; }
      .regiq-activity-watch { min-height: 52px; padding: 9px 11px; border-radius: 15px; }
      .regiq-activity-time { min-width: 50px; font-size: 12px; }
      .regiq-activity-copy strong { font-size: 12px; }
    }
  `
  document.head.appendChild(style)
}

function ensureStack() {
  ensureStyles()
  const preview = document.querySelector('.os-preview')
  if (!preview) return null
  let stack = preview.querySelector('.regiq-activity-stack')
  if (!stack) {
    stack = document.createElement('div')
    stack.className = 'regiq-activity-stack'
    preview.appendChild(stack)
  }
  return stack
}

function ensureWatch(id, label, subtitle) {
  const stack = ensureStack()
  if (!stack) return null
  let watch = stack.querySelector(`[data-id="${id}"]`)
  if (!watch) {
    watch = document.createElement('div')
    watch.className = 'regiq-activity-watch'
    watch.dataset.id = id
    watch.innerHTML = `
      <span class="regiq-activity-dot"></span>
      <div class="regiq-activity-copy"><strong></strong><small></small></div>
      <div class="regiq-activity-time">0.0 s</div>
    `
    stack.appendChild(watch)
  }
  watch.querySelector('strong').textContent = label || id
  watch.querySelector('small').textContent = subtitle || ''
  return watch
}

function stopTimer(id) {
  const timer = timers.get(id)
  if (timer) clearInterval(timer)
  timers.delete(id)
}

function startStage(detail) {
  const id = detail.id
  if (!id) return
  stopTimer(id)
  const started = performance.now()
  states.set(id, { started, label: detail.label, subtitle: detail.subtitle })
  const watch = ensureWatch(id, detail.label, detail.subtitle)
  if (!watch) return
  watch.classList.remove('complete', 'degraded', 'error')
  watch.querySelector('.regiq-activity-time').textContent = '0.0 s'
  timers.set(id, setInterval(() => {
    const current = states.get(id)
    const currentWatch = document.querySelector(`.regiq-activity-watch[data-id="${id}"]`)
    if (!current || !currentWatch) return
    currentWatch.querySelector('.regiq-activity-time').textContent = renderTime(performance.now() - current.started)
  }, 100))
}

function finishStage(detail, ok = true) {
  const id = detail.id
  if (!id) return
  const state = states.get(id)
  const elapsed = Number.isFinite(detail.elapsed_ms)
    ? detail.elapsed_ms
    : state?.started ? performance.now() - state.started : 0
  stopTimer(id)
  const watch = ensureWatch(id, detail.label || state?.label || id, detail.subtitle || state?.subtitle || '')
  if (!watch) return
  watch.classList.remove('complete', 'degraded', 'error')
  if (!ok) watch.classList.add('error')
  else if (detail.degraded) watch.classList.add('degraded')
  else watch.classList.add('complete')
  watch.querySelector('.regiq-activity-time').textContent = renderTime(elapsed)

  if (!ok) {
    watch.querySelector('small').textContent = detail.message || 'Stage interrupted'
    return
  }
  if (detail.degraded) {
    watch.querySelector('small').textContent = detail.message || 'Completed conservatively with REGIQ guardrails'
    return
  }

  const subtitle = id === 'investigation'
    ? 'Candidate regulations mapped'
    : id === 'verification'
      ? 'Findings independently challenged'
      : id === 'deep-product'
        ? 'Deep product analysis complete'
        : 'Completed'
  watch.querySelector('small').textContent = subtitle
}

function reset() {
  for (const id of [...timers.keys()]) stopTimer(id)
  states.clear()
  document.querySelectorAll('.regiq-activity-stack').forEach(node => node.remove())
}

window.addEventListener('regiq-activity-reset', reset)
window.addEventListener('regiq-activity', event => {
  const detail = event.detail || {}
  if (detail.phase === 'start') startStage(detail)
  if (detail.phase === 'complete') finishStage(detail, true)
  if (detail.phase === 'error') finishStage(detail, false)
})
