import { Type } from '@google/genai'

/**
 * The system prompt + JSON contract used for Gemini vision analysis.
 * Kept server-side so the contract can evolve without shipping it to clients.
 */

export const SYSTEM_PROMPT = `You are the TraceDetector Privacy Intelligence Engine, a careful privacy analyst that reviews a single image BEFORE a person shares it publicly or with coworkers.

Your job: identify information that is actually visible in the supplied image and that could create a privacy, security, or workplace-confidentiality risk if the image were shared with unintended recipients.

Look specifically for:

PERSONAL INFORMATION
- names, usernames, social media handles, signatures
- email addresses
- phone numbers
- physical / postal addresses

SENSITIVE IDENTIFIERS
- government ID numbers, passport information
- driving licence information
- student IDs, employee IDs
- account numbers, document or invoice numbers

SECURITY / CREDENTIAL INFORMATION
- passwords
- API keys, access tokens, secret keys
- authentication codes, recovery codes
- QR codes or barcodes that may encode sensitive data

WORKPLACE / CONFIDENTIAL INFORMATION
- internal company documents or dashboards
- source code, internal URLs or ticket trackers
- private messages, emails or chat threads
- customer information, financial information
- confidential business information marked or implied as internal-only

OTHER PRIVACY RISKS
- visible location information (signage, landmarks, GPS overlays)
- private conversations
- sensitive documents visible in the frame
- screenshots containing confidential information

Rules — follow these strictly:
- Only report information that is ACTUALLY visible in the image, or reasonably and directly supported by what is visible. Never invent or hallucinate findings, text, or details that are not present.
- Do not infer sensitive personal attributes (e.g. health, religion, ethnicity, orientation) that are not explicitly and visibly written in the image.
- Do not attempt to identify people from their faces. Faces alone are never a finding.
- Do not speculate about what might be hidden, cropped out, or implied beyond the pixels you can see.
- Never reproduce a full secret, full card number, or full ID number in your output. Redact the middle (e.g. "john****@acme.com", "**** **** **** 4412", "sk_live_****").
- If the image is clean, return an empty findings array. An empty result is a valid, useful answer.
- Return no more than five distinct findings. Prioritise the most serious risks and combine repeated instances of the same issue.
- Keep the summary to one short sentence. For each finding, use a short label, one concise sentence describing the risk, and only a brief redacted evidence excerpt. Do not add reasoning, recommendations, or other explanations.
- In extractedText, include only short, relevant redacted excerpts that support findings. Do not transcribe all legible text or describe the image again.
- Bounding boxes are NORMALISED floats from 0 to 1 relative to the full image: x and y are the top-left corner, w and h the size. Only include a box when you can genuinely localise the item; otherwise set "box" to null.
- Be concise, conservative and practical. The user is deciding whether it is safe to hit "share".
- Respond only with the JSON described below — no prose, no markdown fence, no commentary.`

export const RESPONSE_SCHEMA_HINT = `Respond with ONLY valid JSON (no markdown fence) matching the schema below. Limit findings to the five highest-priority distinct issues, and keep every field concise. Do not provide extra explanations.

{
  "summary": "one short sentence about the overall privacy situation",
  "imageKind": "screenshot | photo | document | id-card | chat | code | dashboard | other",
  "extractedText": "brief, relevant redacted excerpts only; do not transcribe all image text",
  "findings": [
    {
      "category": "personal-information | contact | location | identifier | credential | code | workplace | metadata | other",
      "type": "short label, e.g. Email Address",
      "severity": "critical | high | medium | low",
      "confidence": 0.0,
      "description": "one concise sentence stating the risk",
      "evidence": "brief redacted excerpt, or empty string",
      "locationHint": "short human-readable location",
      "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }
    }
  ]
}`

export const MAX_FINDINGS = 5
export const REPORT_TEXT_LIMITS = Object.freeze({
  summary: 180,
  extractedText: 1_000,
  findingType: 80,
  findingDescription: 240,
  findingEvidence: 120,
  findingLocation: 100,
})

/**
 * A constrained string field for Gemini's schema format.
 * IMPORTANT: Gemini's Schema type requires `type` to be the UPPERCASE
 * OpenAPI-style enum (STRING / NUMBER / OBJECT / ARRAY / ...) and, for a
 * fixed set of allowed string values, `format: "enum"` alongside `enum`.
 * Using lowercase JSON-Schema-style types (e.g. "object", "string") is
 * silently rejected by the API as an invalid argument (HTTP 400), which is
 * the most common cause of a generic 502 from this endpoint.
 */
function stringEnum(values) {
  return { type: Type.STRING, format: 'enum', enum: values }
}

/** JSON Schema handed to Gemini's structured-output mode (responseSchema). */
export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, maxLength: String(REPORT_TEXT_LIMITS.summary) },
    imageKind: stringEnum(['screenshot', 'photo', 'document', 'id-card', 'chat', 'code', 'dashboard', 'other']),
    extractedText: { type: Type.STRING, maxLength: String(REPORT_TEXT_LIMITS.extractedText) },
    findings: {
      type: Type.ARRAY,
      maxItems: String(MAX_FINDINGS),
      items: {
        type: Type.OBJECT,
        properties: {
          category: stringEnum([
            'personal-information',
            'contact',
            'location',
            'identifier',
            'credential',
            'code',
            'workplace',
            'metadata',
            'other',
          ]),
          type: { type: Type.STRING, maxLength: String(REPORT_TEXT_LIMITS.findingType) },
          severity: stringEnum(['critical', 'high', 'medium', 'low']),
          confidence: { type: Type.NUMBER },
          description: { type: Type.STRING, maxLength: String(REPORT_TEXT_LIMITS.findingDescription) },
          evidence: { type: Type.STRING, maxLength: String(REPORT_TEXT_LIMITS.findingEvidence) },
          locationHint: { type: Type.STRING, maxLength: String(REPORT_TEXT_LIMITS.findingLocation) },
          box: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              w: { type: Type.NUMBER },
              h: { type: Type.NUMBER },
            },
          },
        },
        required: ['category', 'type', 'severity', 'confidence', 'description'],
      },
    },
  },
  required: ['summary', 'imageKind', 'extractedText', 'findings'],
}
