/**
 * "Before you share this image" checklist.
 *
 * Every item is resolved from the actual analysis:
 *   clear   -> the engine checked for it and found nothing
 *   risk    -> matching findings exist
 *   unknown -> this engine could not check it (never claimed as "clear")
 */

export const CHECKLIST_ITEMS = [
  {
    id: 'passwords',
    label: 'No passwords visible',
    requires: 'text',
    match: (f) => f.detectorId === 'password-literal' || /password|passphrase/i.test(f.type),
  },
  {
    id: 'secrets',
    label: 'No API keys, tokens or secrets visible',
    requires: 'text',
    match: (f) => f.category === 'credential',
  },
  {
    id: 'contact',
    label: 'No personal contact details visible',
    requires: 'text',
    match: (f) => f.category === 'contact' || f.category === 'personal-information',
  },
  {
    id: 'documents',
    label: 'No sensitive document or ID numbers visible',
    requires: 'text',
    match: (f) => f.category === 'identifier',
  },
  {
    id: 'workplace',
    label: 'No confidential workplace information visible',
    requires: 'text',
    match: (f) => f.category === 'workplace',
  },
  {
    id: 'codes',
    label: 'No scannable QR codes or barcodes',
    requires: 'codes',
    match: (f) => f.category === 'code',
  },
  {
    id: 'geotag',
    label: 'No GPS location embedded in the file',
    requires: 'metadata',
    match: (f) => f.detectorId === 'exif-gps',
  },
  {
    id: 'device',
    label: 'No device or author identity in file metadata',
    requires: 'metadata',
    match: (f) => f.category === 'metadata' && f.detectorId !== 'exif-gps',
  },
]

const UNKNOWN_REASON = {
  text: 'This engine does not read text inside the image, so this could not be verified.',
  codes: 'Barcode scanning is not available in this browser, so this could not be verified.',
  metadata: 'File metadata was not available for this analysis.',
}

export function buildChecklist(findings = [], capabilities = {}) {
  return CHECKLIST_ITEMS.map((item) => {
    const matched = findings.filter(item.match)

    if (matched.length > 0) {
      return {
        id: item.id,
        label: item.label,
        status: 'risk',
        count: matched.length,
        detail: summarise(matched),
      }
    }

    if (capabilities[item.requires] === false) {
      return {
        id: item.id,
        label: item.label,
        status: 'unknown',
        count: 0,
        detail: UNKNOWN_REASON[item.requires] || 'Not checked by this engine.',
      }
    }

    return { id: item.id, label: item.label, status: 'clear', count: 0, detail: 'Checked — nothing found.' }
  })
}

function summarise(matched) {
  const types = [...new Set(matched.map((f) => f.type))]
  const shown = types.slice(0, 3).join(', ')
  const extra = types.length > 3 ? ` +${types.length - 3} more` : ''
  return `Found: ${shown}${extra}`
}
