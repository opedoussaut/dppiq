import React from 'react'
import ReactDOM from 'react-dom/client'
import './uploadCompat'
import App from './AppV2'
import './regiq-os.css'

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
