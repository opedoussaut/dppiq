import heic2any from 'heic2any'

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])
const HEIC_EXT = /\.(heic|heif)$/i

function isHeic(file) {
  return HEIC_TYPES.has((file?.type || '').toLowerCase()) || HEIC_EXT.test(file?.name || '')
}

export async function preprocessUpload(file) {
  if (!file) return null
  if (!isHeic(file)) return file

  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  const base = (file.name || 'regiq-upload').replace(/\.(heic|heif)$/i, '')
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
