export const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB
export const MIN_FILE_BYTES = 100

export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
]

export const ACCEPTED_LABEL = 'PNG, JPG, WEBP, GIF, BMP'
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',')

/**
 * Validates a user-selected file. Returns { ok } or { ok:false, code, message }.
 * Every failure path has a human message the UI can show directly.
 */
export function validateImageFile(file) {
  if (!file) {
    return { ok: false, code: 'empty', message: 'No file selected. Choose an image to analyse.' }
  }

  const type = (file.type || '').toLowerCase()
  const name = file.name || 'image'

  if (!type.startsWith('image/')) {
    return {
      ok: false,
      code: 'unsupported_type',
      message: `"${truncateName(name)}" is not an image. Supported formats: ${ACCEPTED_LABEL}.`,
    }
  }

  if (!ACCEPTED_TYPES.includes(type)) {
    return {
      ok: false,
      code: 'unsupported_type',
      message: `${type.replace('image/', '.')} files are not supported. Use ${ACCEPTED_LABEL}.`,
    }
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: 'too_large',
      message: `"${truncateName(name)}" is ${formatBytes(file.size)}. The limit is ${formatBytes(
        MAX_FILE_BYTES,
      )} — try exporting at a smaller size.`,
    }
  }

  if (file.size < MIN_FILE_BYTES) {
    return {
      ok: false,
      code: 'too_small',
      message: 'That file looks empty or corrupted. Try a different image.',
    }
  }

  return { ok: true }
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The file could not be read. It may be corrupted.'))
    reader.onabort = () => reject(new Error('Reading the file was interrupted.'))
    reader.readAsDataURL(file)
  })
}

export function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsArrayBuffer(file)
  })
}

/** Loads an image element so we can read natural dimensions / draw to canvas. */
export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be decoded.'))
    img.src = src
  })
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function truncateName(name, max = 38) {
  if (!name) return 'image'
  if (name.length <= max) return name
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  return `${name.slice(0, max - ext.length - 1)}…${ext}`
}

/**
 * Re-encodes large images so the AI request stays small and fast.
 * Falls back to the original data URL if canvas is unavailable.
 */
export async function downscaleDataUrl(dataUrl, maxEdge = 1600, quality = 0.85) {
  try {
    const img = await loadImageElement(dataUrl)
    const longest = Math.max(img.naturalWidth, img.naturalHeight)
    if (longest <= maxEdge) return dataUrl

    const scale = maxEdge / longest
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}
