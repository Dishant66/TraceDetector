import { readAsArrayBuffer, loadImageElement } from '../utils/file.js'
import { readImageMetadata } from '../utils/metadata.js'
import { scanText } from '../utils/patterns.js'

/**
 * On-device scan — real analysis that always works, with no API key and no upload.
 *
 * It covers the parts of the problem that can be solved deterministically:
 *   1. embedded file metadata (EXIF / PNG text / XMP), including GPS
 *   2. QR codes and barcodes, via the browser's native BarcodeDetector
 *   3. sensitive patterns inside the file name and inside metadata values
 *
 * It deliberately does NOT read text rendered inside the picture — the
 * checklist reports that as "not checked" rather than pretending it is clean.
 */
export async function runLocalScan(file, dataUrl) {
  const findings = []
  const notes = []
  let metadata = { format: 'unknown', tags: {}, gps: null, hasExif: false, notes: [] }

  try {
    const buffer = await readAsArrayBuffer(file)
    metadata = readImageMetadata(buffer)
  } catch {
    notes.push('File metadata could not be read for this image.')
  }

  /* ---------------------------- metadata ------------------------------ */

  if (metadata.gps) {
    findings.push({
      detectorId: 'exif-gps',
      category: 'metadata',
      type: 'GPS Location in File Metadata',
      severity: 'high',
      confidence: 1,
      description: `This file carries the exact coordinates where it was captured (${metadata.gps.lat.toFixed(
        5,
      )}, ${metadata.gps.lon.toFixed(5)}). The location travels with the image even though it is invisible on screen.`,
      evidence: `${metadata.gps.lat.toFixed(5)}, ${metadata.gps.lon.toFixed(5)}`,
      recommendation:
        'Strip EXIF data before sharing — most phones offer "remove location" in the share sheet, or re-export the image.',
      locationHint: 'Embedded metadata (not visible in the picture)',
      box: null,
      source: 'metadata',
    })
  }

  const DEVICE_TAGS = [
    ['Camera Owner', 'critical'],
    ['Author', 'medium'],
    ['Camera Serial Number', 'medium'],
    ['Lens Serial Number', 'low'],
    ['Camera Make', 'low'],
    ['Camera Model', 'low'],
    ['Software', 'low'],
    ['Copyright', 'low'],
  ]

  const deviceHits = DEVICE_TAGS.filter(([tag]) => metadata.tags[tag]).map(([tag, severity]) => ({
    tag,
    severity,
    value: metadata.tags[tag],
  }))

  if (deviceHits.length) {
    const worst = deviceHits.some((h) => h.severity === 'critical')
      ? 'high'
      : deviceHits.some((h) => h.severity === 'medium')
        ? 'medium'
        : 'low'

    findings.push({
      detectorId: 'exif-device',
      category: 'metadata',
      type: 'Device & Author Metadata',
      severity: worst,
      confidence: 1,
      description:
        'The file stores details about who created it and on what device. Combined with other images, this fingerprints you across everything you post.',
      evidence: deviceHits
        .slice(0, 4)
        .map((h) => `${h.tag}: ${truncate(String(h.value), 40)}`)
        .join(' · '),
      recommendation: 'Export a clean copy (screenshot it, or use "remove properties") before sharing publicly.',
      locationHint: 'Embedded metadata (not visible in the picture)',
      box: null,
      source: 'metadata',
    })
  }

  const timestamp = metadata.tags['Date Taken'] || metadata.tags['Creation Time']
  if (timestamp) {
    findings.push({
      detectorId: 'exif-timestamp',
      category: 'metadata',
      type: 'Capture Timestamp',
      severity: 'low',
      confidence: 1,
      description: `The file records exactly when it was captured (${truncate(String(timestamp), 32)}), which can place you at a time and place.`,
      evidence: truncate(String(timestamp), 40),
      recommendation: 'Usually harmless, but strip it if the timing itself is sensitive.',
      locationHint: 'Embedded metadata (not visible in the picture)',
      box: null,
      source: 'metadata',
    })
  }

  // Sensitive strings hiding inside metadata values (comments, descriptions…)
  const metadataText = Object.entries(metadata.tags)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  for (const hit of scanText(metadataText, { source: 'metadata' })) {
    findings.push(
      toFinding(hit, {
        locationHint: 'Inside the file metadata',
        confidence: 0.95,
        descriptionSuffix: ' It was found in the file metadata rather than in the visible picture.',
      }),
    )
  }

  /* ---------------------------- file name ----------------------------- */

  const nameText = (file.name || '').replace(/[_\-+]/g, ' ')
  for (const hit of scanText(nameText, { source: 'filename' })) {
    findings.push(
      toFinding(hit, {
        locationHint: 'In the file name',
        confidence: 0.9,
        severityShift: -1,
        descriptionSuffix: ' File names are preserved by most chat apps and upload forms.',
      }),
    )
  }

  /* ------------------------ barcodes & QR codes ------------------------ */

  const barcode = await detectBarcodes(dataUrl)
  if (!barcode.supported) {
    notes.push(
      'Native barcode scanning is not available in this browser, so QR and barcode detection was skipped.',
    )
  }
  for (const code of barcode.codes) {
    findings.push(code)
  }

  return {
    findings,
    metadata,
    notes,
    capabilities: {
      text: false,
      metadata: true,
      codes: barcode.supported,
    },
  }
}

/* -------------------------------------------------------------------- */

async function detectBarcodes(dataUrl) {
  const Detector = typeof window !== 'undefined' ? window.BarcodeDetector : undefined
  if (!Detector) return { supported: false, codes: [] }

  try {
    const detector = new Detector()
    const img = await loadImageElement(dataUrl)
    const raw = await detector.detect(img)
    const width = img.naturalWidth || 1
    const height = img.naturalHeight || 1

    return {
      supported: true,
      codes: raw.slice(0, 8).map((code, index) => {
        const value = String(code.rawValue || '')
        const nested = scanText(value, { source: 'barcode' })
        const severity = nested.length
          ? nested[0].severity
          : /^https?:\/\//i.test(value)
            ? 'medium'
            : 'low'

        const bb = code.boundingBox
        const box = bb
          ? {
              x: clamp01(bb.x / width),
              y: clamp01(bb.y / height),
              w: clamp01(bb.width / width),
              h: clamp01(bb.height / height),
            }
          : null

        return {
          detectorId: `barcode-${index}`,
          category: 'code',
          type: `${formatCodeType(code.format)} Detected`,
          severity,
          confidence: 1,
          description: nested.length
            ? `A scannable code is present and its contents include ${nested
                .map((n) => n.type.toLowerCase())
                .join(', ')}. Anyone can scan it from the image.`
            : 'A scannable code is present. Codes often encode links, contact cards, payment handles or ticket IDs that are invisible to you but readable by any phone.',
          evidence: truncate(value, 80),
          recommendation:
            'Confirm what the code resolves to. If it points to something private, cover it before sharing.',
          locationHint: box ? 'Highlighted on the image' : 'Somewhere in the image',
          box,
          source: 'barcode',
        }
      }),
    }
  } catch {
    return { supported: false, codes: [] }
  }
}

function formatCodeType(format) {
  if (!format) return 'Scannable Code'
  if (format === 'qr_code') return 'QR Code'
  return `${String(format).replace(/_/g, ' ').toUpperCase()} Barcode`
}

const ORDER = ['critical', 'high', 'medium', 'low']

export function toFinding(hit, options = {}) {
  const { locationHint = '', confidence = 0.9, severityShift = 0, descriptionSuffix = '' } = options
  let severity = hit.severity
  if (severityShift) {
    const index = Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(hit.severity) - severityShift))
    severity = ORDER[index]
  }
  return {
    detectorId: hit.detectorId,
    category: hit.category,
    type: hit.type,
    severity,
    confidence,
    description: `${hit.description}${descriptionSuffix}`,
    evidence: hit.evidence,
    recommendation: hit.recommendation,
    locationHint,
    box: null,
    source: hit.source,
  }
}

function truncate(value, max) {
  const text = String(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
