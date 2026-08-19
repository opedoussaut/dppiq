import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './yuka.css'

// Some browsers are inconsistent with heavily styled <label> file pickers.
// Delegate clicks from the REGIQ upload card directly to its hidden file input.
document.addEventListener('click', (event) => {
  const uploadCard = event.target.closest('.scan-choice:not(.primary-choice)')
  if (!uploadCard) return

  const fileInput = uploadCard.querySelector('input[type="file"]')
  if (!fileInput || event.target === fileInput) return

  event.preventDefault()
  event.stopPropagation()
  fileInput.click()
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
