import React from 'react'
import ReactDOM from 'react-dom/client'
import './uploadCompat'
import './fastScanClient'
import App from './AppV2'
import './regiq-os.css'
import './mobile.css'

// AppV2 uses a visually styled upload control inside the dark scan panel.
// Explicitly delegate clicks to its file input for reliable desktop/mobile behavior.
document.addEventListener('click', event => {
  const uploadControl = event.target.closest('.os-file-button')
  if (!uploadControl) return
  const input = uploadControl.querySelector('input[type="file"]')
  if (!input || event.target === input) return
  event.preventDefault()
  event.stopPropagation()
  input.click()
})

// Keep the interaction fixes and make the in-app mark match the installed PWA icon.
const uploadStyle = document.createElement('style')
uploadStyle.textContent = `
  .os-capture-empty .os-file-button {
    background: rgba(255,255,255,.11) !important;
    color: #fff !important;
    border: 1px solid rgba(255,255,255,.18) !important;
    box-shadow: inset 0 1px rgba(255,255,255,.06);
    opacity: 1 !important;
  }
  .os-capture-empty .os-file-button:hover {
    background: rgba(255,255,255,.17) !important;
    transform: translateY(-1px);
  }
  .os-capture-empty .os-file-button svg { color: #fff; }

  .os-scan-result:has(.os-warning-card) .os-intelligence-button,
  .os-scan-result:has(.os-warning-card) .os-signal-card {
    display: none !important;
  }

  .os-logo {
    color: transparent !important;
    background: url('/regiq-icon.svg?v=6') center / cover no-repeat !important;
    border-radius: 10px !important;
    box-shadow: 0 7px 18px rgba(0, 19, 30, .24) !important;
  }
`
document.head.appendChild(uploadStyle)

if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
