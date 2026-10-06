/**
 * Dependency-free image metadata reader.
 *
 * Parses real bytes in the browser — nothing is uploaded, nothing is guessed:
 *   • JPEG  -> EXIF (TIFF IFD0 + Exif IFD + GPS IFD) from the APP1 segment
 *   • PNG   -> tEXt / iTXt textual chunks
 *   • WEBP  -> EXIF chunk inside the RIFF container
 *
 * Only the tags that actually matter for privacy are surfaced.
 */

const TIFF_TAGS = {
  0x010f: 'Camera Make',
  0x0110: 'Camera Model',
  0x0131: 'Software',
  0x013b: 'Author',
  0x8298: 'Copyright',
  0x0132: 'File Modified',
  0x010e: 'Image Description',
}

const EXIF_TAGS = {
  0x9003: 'Date Taken',
  0x9004: 'Date Digitised',
  0xa430: 'Camera Owner',
  0xa433: 'Lens Make',
  0xa434: 'Lens Model',
  0xa431: 'Camera Serial Number',
  0xa435: 'Lens Serial Number',
  0x9286: 'User Comment',
}

const GPS_TAGS = {
  0x0000: 'GPSVersion',
  0x0001: 'GPSLatitudeRef',
  0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef',
  0x0004: 'GPSLongitude',
  0x0005: 'GPSAltitudeRef',
  0x0006: 'GPSAltitude',
  0x001d: 'GPSDateStamp',
}

/**
 * @returns {{ format:string, tags:Record<string,string>, gps:{lat:number,lon:number}|null,
 *             hasExif:boolean, notes:string[] }}
 */
export function readImageMetadata(arrayBuffer) {
  const result = { format: 'unknown', tags: {}, gps: null, hasExif: false, notes: [] }
  try {
    const view = new DataView(arrayBuffer)
    if (view.byteLength < 12) return result

    if (view.getUint16(0) === 0xffd8) {
      result.format = 'JPEG'
      readJpeg(view, result)
    } else if (view.getUint32(0) === 0x89504e47) {
      result.format = 'PNG'
      readPng(view, result)
    } else if (
      view.getUint32(0) === 0x52494646 /* RIFF */ &&
      view.getUint32(8) === 0x57454250 /* WEBP */
    ) {
      result.format = 'WEBP'
      readWebp(view, result)
    } else if (view.getUint16(0) === 0x424d) {
      result.format = 'BMP'
    } else if (view.getUint32(0) >>> 8 === 0x474946) {
      result.format = 'GIF'
    }
  } catch {
    result.notes.push('Metadata could not be fully parsed for this file.')
  }
  return result
}

/* ------------------------------- JPEG ---------------------------------- */

function readJpeg(view, result) {
  let offset = 2
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1
      continue
    }
    const marker = view.getUint8(offset + 1)
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xda || marker === 0xd9) break // start of scan / end

    const size = view.getUint16(offset + 2)
    if (size < 2) break
    const segStart = offset + 4
    const segEnd = Math.min(segStart + size - 2, view.byteLength)

    if (marker === 0xe1) {
      const header = ascii(view, segStart, 6)
      if (header.startsWith('Exif')) {
        result.hasExif = true
        parseTiff(view, segStart + 6, result)
      } else if (header.startsWith('http')) {
        const xmp = ascii(view, segStart, segEnd - segStart)
        collectXmp(xmp, result)
      }
    } else if (marker === 0xfe) {
      const comment = ascii(view, segStart, segEnd - segStart).trim()
      if (comment) result.tags['JPEG Comment'] = comment.slice(0, 200)
    }

    offset = segStart + size - 2
  }
}

function parseTiff(view, start, result) {
  if (start + 8 > view.byteLength) return
  const byteOrder = view.getUint16(start)
  const little = byteOrder === 0x4949
  if (!little && byteOrder !== 0x4d4d) return
  if (view.getUint16(start + 2, little) !== 0x002a) return

  const ifd0 = start + view.getUint32(start + 4, little)
  const { exifPointer, gpsPointer } = readIfd(view, start, ifd0, little, TIFF_TAGS, result.tags)

  if (exifPointer) {
    readIfd(view, start, start + exifPointer, little, EXIF_TAGS, result.tags)
  }
  if (gpsPointer) {
    const gpsRaw = {}
    readIfd(view, start, start + gpsPointer, little, GPS_TAGS, gpsRaw, true)
    const coords = toCoordinates(gpsRaw)
    if (coords) {
      result.gps = coords
      result.tags['GPS Coordinates'] = `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`
    }
    if (gpsRaw.GPSDateStamp) result.tags['GPS Date'] = gpsRaw.GPSDateStamp
    if (gpsRaw.GPSAltitude) result.tags['GPS Altitude'] = `${gpsRaw.GPSAltitude} m`
  }
}

function readIfd(view, tiffStart, ifdStart, little, dictionary, out, raw = false) {
  const pointers = { exifPointer: 0, gpsPointer: 0 }
  if (ifdStart + 2 > view.byteLength) return pointers

  const count = view.getUint16(ifdStart, little)
  if (count > 512) return pointers

  for (let i = 0; i < count; i += 1) {
    const entry = ifdStart + 2 + i * 12
    if (entry + 12 > view.byteLength) break

    const tag = view.getUint16(entry, little)
    if (tag === 0x8769) {
      pointers.exifPointer = view.getUint32(entry + 8, little)
      continue
    }
    if (tag === 0x8825) {
      pointers.gpsPointer = view.getUint32(entry + 8, little)
      continue
    }

    const label = dictionary[tag]
    if (!label) continue

    const value = readValue(view, tiffStart, entry, little)
    if (value === null || value === '') continue
    out[raw ? label : label] = value
  }
  return pointers
}

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

function readValue(view, tiffStart, entry, little) {
  const type = view.getUint16(entry + 2, little)
  const count = view.getUint32(entry + 4, little)
  const unit = TYPE_SIZES[type]
  if (!unit || count === 0 || count > 4096) return null

  const total = unit * count
  const offset = total <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little)
  if (offset < 0 || offset + total > view.byteLength) return null

  if (type === 2 || type === 7) {
    let text = ascii(view, offset, count)
    // EXIF UserComment is prefixed with an 8-byte charset marker.
    if (type === 7) text = text.replace(/^(ASCII|UNICODE|JIS)\0*/, '')
    return sanitiseText(text)
  }

  const values = []
  for (let i = 0; i < count; i += 1) {
    const at = offset + i * unit
    switch (type) {
      case 1:
        values.push(view.getUint8(at))
        break
      case 3:
        values.push(view.getUint16(at, little))
        break
      case 4:
        values.push(view.getUint32(at, little))
        break
      case 9:
        values.push(view.getInt32(at, little))
        break
      case 5:
      case 10: {
        const num = type === 5 ? view.getUint32(at, little) : view.getInt32(at, little)
        const den = type === 5 ? view.getUint32(at + 4, little) : view.getInt32(at + 4, little)
        values.push(den === 0 ? 0 : num / den)
        break
      }
      default:
        break
    }
  }
  if (!values.length) return null
  return values.length === 1 ? values[0] : values
}

function toCoordinates(gps) {
  const lat = dmsToDecimal(gps.GPSLatitude, gps.GPSLatitudeRef)
  const lon = dmsToDecimal(gps.GPSLongitude, gps.GPSLongitudeRef)
  if (lat === null || lon === null) return null
  if (lat === 0 && lon === 0) return null
  return { lat, lon }
}

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null
  const [d, m, s] = dms.map(Number)
  if (![d, m, s].every(Number.isFinite)) return null
  let value = d + m / 60 + s / 3600
  const direction = String(ref || '').trim().toUpperCase()
  if (direction === 'S' || direction === 'W') value = -value
  return value
}

/* -------------------------------- PNG ---------------------------------- */

const PNG_KEY_LABELS = {
  Author: 'Author',
  Copyright: 'Copyright',
  Software: 'Software',
  Source: 'Source Device',
  Comment: 'Comment',
  Description: 'Image Description',
  'Creation Time': 'Creation Time',
  Title: 'Title',
}

function readPng(view, result) {
  let offset = 8
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset)
    const type = ascii(view, offset + 4, 4)
    const dataStart = offset + 8
    if (length > view.byteLength) break

    if (type === 'tEXt' || type === 'iTXt') {
      const chunk = ascii(view, dataStart, Math.min(length, 2048))
      const nul = chunk.indexOf('\0')
      if (nul > 0) {
        const key = chunk.slice(0, nul)
        const value = sanitiseText(chunk.slice(nul + 1).replace(LEADING_CONTROL, ''))
        const label = PNG_KEY_LABELS[key] || (key.length < 32 ? key : null)
        if (label && value) {
          result.hasExif = true
          result.tags[label] = value.slice(0, 200)
        }
      }
    } else if (type === 'eXIf') {
      result.hasExif = true
      parseTiff(view, dataStart, result)
    } else if (type === 'IDAT' || type === 'IEND') {
      break
    }

    offset = dataStart + length + 4
  }
}

/* -------------------------------- WEBP --------------------------------- */

function readWebp(view, result) {
  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const fourcc = ascii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    if (size <= 0 || dataStart + size > view.byteLength) break

    if (fourcc === 'EXIF') {
      result.hasExif = true
      const skip = ascii(view, dataStart, 6).startsWith('Exif') ? 6 : 0
      parseTiff(view, dataStart + skip, result)
    } else if (fourcc === 'XMP ') {
      collectXmp(ascii(view, dataStart, Math.min(size, 4096)), result)
    }

    offset = dataStart + size + (size % 2)
  }
}

function collectXmp(xmp, result) {
  const creator = /<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]{1,120})<\/rdf:li>/.exec(xmp)
  if (creator) {
    result.hasExif = true
    result.tags.Author = sanitiseText(creator[1])
  }
  const tool = /(?:xmp:CreatorTool|photoshop:History)="([^"]{1,120})"/.exec(xmp)
  if (tool) {
    result.hasExif = true
    result.tags.Software = sanitiseText(tool[1])
  }
}

/* ------------------------------- helpers -------------------------------- */

// Control-character strippers. Built with RegExp so the source stays readable
// (and lint-clean) while still matching the raw bytes EXIF can contain.
// eslint-disable-next-line no-control-regex -- EXIF payloads legitimately contain control bytes
const LEADING_CONTROL = new RegExp('^[\\u0000-\\u0008]+')
// eslint-disable-next-line no-control-regex -- EXIF payloads legitimately contain control bytes
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g')

function ascii(view, offset, length) {
  let out = ''
  const end = Math.min(offset + length, view.byteLength)
  for (let i = offset; i < end; i += 1) out += String.fromCharCode(view.getUint8(i))
  return out
}

function sanitiseText(text) {
  return String(text).replace(CONTROL_CHARS, '').trim()
}
