import heic2any from 'heic2any'

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])
const HEIC_EXT = /\.(heic|heif)$/i

function isHeic(file) {
  return HEIC_TYPES.has((file?.type || '').toLowerCase()) || HEIC_EXT.test(file?.name || '')
}

async function convertHeic(file) {
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  const base = (file.name || 'regiq-upload').replace(/\.(heic|heif)$/i, '')
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

// Capture file-selection events before React sees them. For HEIC/HEIF only,
// replace the selected file with a browser-friendly JPEG and re-dispatch the
// change event. Normal JPEG/PNG/WebP uploads pass through untouched.
document.addEventListener('change', async event => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') return
  const file = input.files?.[0]
  if (!file || !isHeic(file) || input.dataset.regiqConverted === '1') return

  event.stopImmediatePropagation()

  try {
    input.disabled = true
    const jpeg = await convertHeic(file)
    const transfer = new DataTransfer()
    transfer.items.add(jpeg)
    input.files = transfer.files
    input.dataset.regiqConverted = '1'
    input.disabled = false
    input.dispatchEvent(new Event('change', { bubbles: true }))
  } catch (error) {
    input.disabled = false
    input.dataset.regiqUploadError = error?.message || 'HEIC conversion failed'
    console.error('REGIQ could not convert HEIC/HEIF upload:', error)
  } finally {
    queueMicrotask(() => delete input.dataset.regiqConverted)
  }
}, true)
