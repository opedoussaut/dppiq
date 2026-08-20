const nativeFetch = window.fetch.bind(window)

function ensureStyle() {
  if (document.getElementById('regiq-fast-scan-style')) return
  const style = document.createElement('style')
  style.id = 'regiq-fast-scan-style'
  style.textContent = `
    .regiq-fast-scan-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 20px 22px;
      border-radius: 24px;
      background: rgba(255,255,255,.92);
      border: 1px solid rgba(20,24,32,.08);
      box-shadow: 0 18px 50px rgba(40,48,64,.10);
      animation: regiqFastIn .28s ease both;
    }
    .regiq-fast-scan-card small { display:block; letter-spacing:.12em; font-size:10px; color:#6b7280; margin-bottom:5px; }
    .regiq-fast-scan-card strong { display:block; font-size:22px; color:#111318; }
    .regiq-fast-scan-card p { margin:5px 0 0; color:#6b7280; font-size:13px; }
    .regiq-fast-pulse { width:11px; height:11px; border-radius:50%; background:#34c759; box-shadow:0 0 0 7px rgba(52,199,89,.12); flex:0 0 auto; }
    @keyframes regiqFastIn { from { opacity:0; transform:translateY(8px) scale(.98) } to { opacity:1; transform:none } }
  `
  document.head.appendChild(style)
}

function showFastResult(payload) {
  const id = payload?.identification
  if (id?.status !== 'identified' || !id.product_type) return
  ensureStyle()
  const rail = document.querySelector('.os-scan-result')
  if (!rail) return
  let card = document.getElementById('regiq-fast-scan-card')
  if (!card) {
    card = document.createElement('article')
    card.id = 'regiq-fast-scan-card'
    card.className = 'regiq-fast-scan-card'
    rail.prepend(card)
  }
  const seconds = Number.isFinite(payload.elapsed_ms) ? (payload.elapsed_ms / 1000).toFixed(1) : null
  card.innerHTML = `<div><small>INSTANT RECOGNITION</small><strong>${escapeHtml(id.product_type)}</strong><p>${seconds ? `Identified in ${seconds}s · ` : ''}Building regulatory intelligence…</p></div><span class="regiq-fast-pulse"></span>`
}

function hideFastResult() {
  document.getElementById('regiq-fast-scan-card')?.remove()
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]))
}

window.fetch = function regiqFastFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const isFullScan = url.includes('/api/scan/image') && String(init?.method || 'GET').toUpperCase() === 'POST' && init?.body instanceof FormData

  if (!isFullScan) return nativeFetch(input, init)

  hideFastResult()
  const fastBody = new FormData()
  for (const [key, value] of init.body.entries()) fastBody.append(key, value)

  nativeFetch('/api/scan/fast-identify', { method: 'POST', body: fastBody })
    .then(response => response.ok ? response.json() : null)
    .then(showFastResult)
    .catch(() => undefined)

  return nativeFetch(input, init).finally(() => {
    window.setTimeout(hideFastResult, 700)
  })
}
