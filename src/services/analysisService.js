import { downscaleDataUrl, loadImageElement } from '../utils/file.js'
import { scanText } from '../utils/patterns.js'
import { computeRiskScore, sortFindings } from '../utils/scoring.js'
import { buildChecklist } from '../utils/checklist.js'
import { requestAiAnalysis } from './aiClient.js'
import { runLocalScan, toFinding } from './localScanner.js'
import {
  DEMO_IMAGE,
  DEMO_FINDINGS,
  DEMO_SUMMARY,
  DEMO_METADATA,
  DEMO_EXTRACTED_TEXT,
} from '../data/demoReport.js'

export const ENGINES = {
  ai: {
    id: 'ai',
    label: 'AI Analysis',
    tone: 'ai',
    description: 'A vision model reads the image, combined with on-device metadata and rule-based checks.',
    disclaimer: 'Results come from an AI vision model. AI can miss things and can be wrong — review the image yourself too.',
  },
  local: {
    id: 'local',
    label: 'On-Device Scan',
    tone: 'local',
    description: 'Real analysis of file metadata, QR/barcodes and the file name. Nothing leaves your browser.',
    disclaimer: 'This engine does not read text printed inside the picture, so text-based checks are reported as "not checked".',
  },
  demo: {
    id: 'demo',
    label: 'Demo Analysis',
    tone: 'demo',
    description: 'A pre-written sample report on a bundled mock screenshot. Nothing here is a real detection.',
    disclaimer: 'These findings are sample data shipped with the app — they are NOT produced by an AI model and do not describe a real image you uploaded.',
  },
}

export const STAGES = [
  { id: 'scan', label: 'Scanning image…', detail: 'Reading pixels, dimensions and file structure' },
  { id: 'metadata', label: 'Reading embedded metadata…', detail: 'EXIF, GPS tags, device and author fields' },
  { id: 'text', label: 'Detecting visible text…', detail: 'Locating readable content and scannable codes' },
  { id: 'sensitive', label: 'Checking for sensitive information…', detail: 'Credentials, IDs, contact and location data' },
  { id: 'risk', label: 'Evaluating privacy risks…', detail: 'Scoring severity and confidence per finding' },
  { id: 'report', label: 'Preparing your report…', detail: 'Building findings, overlays and your checklist' },
]

/**
 * Runs one analysis and returns the single shape the whole UI renders from.
 *
 * @param {{ mode:'ai'|'local'|'demo', file?:File, dataUrl?:string, onStage?:(id:string)=>void }} options
 */
export async function runAnalysis({ mode, file, dataUrl, onStage = () => {} }) {
  if (mode === 'demo') return runDemo(onStage)
  if (!file || !dataUrl) {
    const error = new Error('No image is loaded. Upload an image to analyse.')
    error.code = 'empty'
    throw error
  }
  return mode === 'ai' ? runAi({ file, dataUrl, onStage }) : runLocal({ file, dataUrl, onStage })
}

/* ------------------------------- engines ------------------------------- */

async function runLocal({ file, dataUrl, onStage }) {
  onStage('scan')
  const dimensions = await safeDimensions(dataUrl)

  onStage('metadata')
  const local = await runLocalScan(file, dataUrl)

  onStage('sensitive')
  onStage('risk')

  const findings = withIds(sortFindings(local.findings))
  onStage('report')

  return assemble({
    engine: 'local',
    findings,
    summary: buildLocalSummary(local, findings),
    imageKind: 'unknown',
    extractedText: '',
    metadata: local.metadata,
    capabilities: local.capabilities,
    notes: local.notes,
    image: imageInfo(file, dataUrl, dimensions),
  })
}

async function runAi({ file, dataUrl, onStage }) {
  onStage('scan')
  const dimensions = await safeDimensions(dataUrl)
  const payloadUrl = await downscaleDataUrl(dataUrl)

  onStage('metadata')
  // Deterministic checks run in parallel with the model call.
  const localPromise = runLocalScan(file, dataUrl).catch(() => ({
    findings: [],
    metadata: { format: 'unknown', tags: {}, gps: null, hasExif: false, notes: [] },
    notes: ['On-device metadata scan failed for this file.'],
    capabilities: { text: false, metadata: false, codes: false },
  }))

  onStage('text')
  const aiPayload = await requestAiAnalysis({ dataUrl: payloadUrl, fileName: file.name })
  const local = await localPromise

  onStage('sensitive')
  const aiFindings = (aiPayload.report.findings || []).map((f) => ({
    detectorId: `ai-${slug(f.type)}`,
    category: f.category,
    type: f.type,
    severity: f.severity,
    confidence: f.confidence,
    description: f.description || 'The AI engine flagged this region as potentially sensitive.',
    evidence: f.evidence,
    recommendation: recommendationFor(f),
    locationHint: f.locationHint || (f.box ? 'Highlighted on the image' : 'Location not reported by the model'),
    box: f.box || null,
    source: 'ai',
  }))

  // Rule-based pass over the text the model read back — catches formats the
  // model described loosely, and gives exact, explainable matches.
  const patternFindings = scanText(aiPayload.report.extractedText || '', { source: 'pattern' })
    .map((hit) =>
      toFinding(hit, {
        locationHint: 'Matched in text read from the image',
        confidence: 0.85,
      }),
    )
    .map((f) => ({ ...f, detectorId: `pattern-${f.detectorId}` }))

  onStage('risk')
  const merged = dedupe([...aiFindings, ...local.findings, ...patternFindings])
  const findings = withIds(sortFindings(merged))

  onStage('report')
  return assemble({
    engine: 'ai',
    model: aiPayload.model,
    findings,
    summary: aiPayload.report.summary || buildLocalSummary(local, findings),
    imageKind: aiPayload.report.imageKind || 'unknown',
    extractedText: aiPayload.report.extractedText || '',
    metadata: local.metadata,
    capabilities: { text: true, metadata: local.capabilities.metadata, codes: true },
    notes: local.notes,
    image: imageInfo(file, dataUrl, dimensions),
  })
}

async function runDemo(onStage) {
  for (const stage of STAGES) {
    onStage(stage.id)
    await delay(260)
  }

  const findings = withIds(sortFindings(DEMO_FINDINGS))
  return assemble({
    engine: 'demo',
    findings,
    summary: DEMO_SUMMARY,
    imageKind: 'screenshot',
    extractedText: DEMO_EXTRACTED_TEXT,
    metadata: DEMO_METADATA,
    capabilities: { text: true, metadata: true, codes: true },
    notes: [],
    image: { ...DEMO_IMAGE },
  })
}

/* ------------------------------- helpers ------------------------------- */

function assemble({
  engine,
  model = null,
  findings,
  summary,
  imageKind,
  extractedText,
  metadata,
  capabilities,
  notes,
  image,
}) {
  const risk = computeRiskScore(findings)
  return {
    id: `td-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    engine,
    engineLabel: ENGINES[engine].label,
    model,
    image,
    summary,
    imageKind,
    extractedText,
    metadata,
    capabilities,
    notes,
    findings,
    risk,
    checklist: buildChecklist(findings, capabilities),
  }
}

function imageInfo(file, dataUrl, dimensions) {
  return {
    dataUrl,
    name: file.name,
    size: file.size,
    type: file.type,
    width: dimensions.width,
    height: dimensions.height,
  }
}

async function safeDimensions(dataUrl) {
  try {
    const img = await loadImageElement(dataUrl)
    return { width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return { width: 0, height: 0 }
  }
}

function withIds(findings) {
  return findings.map((f, index) => ({ ...f, id: `f${index + 1}`, index: index + 1 }))
}

/** Same type reported twice (model + rule) keeps the richer entry. */
function dedupe(findings) {
  const map = new Map()
  for (const finding of findings) {
    const key = `${finding.category}:${normaliseType(finding.type)}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, finding)
      continue
    }
    const keepNew =
      (finding.box && !existing.box) ||
      (!!finding.evidence && !existing.evidence) ||
      (finding.source === 'metadata' && existing.source === 'pattern')
    if (keepNew) {
      map.set(key, { ...finding, description: longer(finding.description, existing.description) })
    } else {
      map.set(key, { ...existing, description: longer(existing.description, finding.description) })
    }
  }
  return [...map.values()]
}

const NOISE_WORDS = new Set(['detected', 'visible', 'in', 'the', 'image', 'a', 'an', 'of'])

/**
 * "Confidential Marking" (model wording) and "Confidentiality Marking"
 * (rule wording) describe the same thing. Light stemming lets the merge
 * happen without collapsing genuinely different types such as
 * "Internal System URL" vs "Internal IP Address".
 */
function normaliseType(type) {
  return String(type || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word))
    .map((word) => word.replace(/(ities|ity|ings|ing|ies|es|s)$/, ''))
    .sort()
    .join('-')
}

function longer(a, b) {
  return (a || '').length >= (b || '').length ? a : b
}

const RECOMMENDATION_BY_CATEGORY = {
  credential: 'Treat this as leaked: rotate or revoke it, then remove it from the image.',
  identifier: 'Mask the number before sharing — identifiers like this enable impersonation.',
  contact: 'Blur or crop the contact details before sharing.',
  location: 'Remove the location details so the image cannot place you.',
  'personal-information': 'Consider removing this if the audience does not already know who this is.',
  workplace: 'Check your company policy before sharing this outside the organisation.',
  code: 'Confirm what the code contains, and cover it if it resolves to something private.',
  metadata: 'Strip the file metadata by re-exporting or screenshotting the image.',
  other: 'Review this region and remove it if it is not meant to be public.',
}

function recommendationFor(finding) {
  return RECOMMENDATION_BY_CATEGORY[finding.category] || RECOMMENDATION_BY_CATEGORY.other
}

function buildLocalSummary(local, findings) {
  const format = local.metadata?.format && local.metadata.format !== 'unknown' ? local.metadata.format : 'image'
  if (!findings.length) {
    return `No embedded metadata, scannable codes or sensitive strings were found in this ${format} file. Text printed inside the picture was not read by this engine.`
  }
  const parts = []
  if (findings.some((f) => f.category === 'metadata')) parts.push('embedded file metadata')
  if (findings.some((f) => f.category === 'code')) parts.push('scannable codes')
  if (findings.some((f) => f.source === 'filename')) parts.push('sensitive text in the file name')
  const list = parts.length ? parts.join(', ') : 'potentially sensitive content'
  return `On-device scan of this ${format} file found ${findings.length} item${
    findings.length === 1 ? '' : 's'
  } to review, covering ${list}.`
}

function slug(value) {
  return String(value || 'finding')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
