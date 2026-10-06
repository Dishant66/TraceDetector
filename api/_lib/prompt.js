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
- Bounding boxes are NORMALISED floats from 0 to 1 relative to the full image: x and y are the top-left corner, w and h the size. Only include a box when you can genuinely localise the item; otherwise set "box" to null.
- Be concise, conservative and practical. The user is deciding whether it is safe to hit "share".
- Respond only with the JSON described below — no prose, no markdown fence, no commentary.`

export const RESPONSE_SCHEMA_HINT = `Respond with ONLY valid JSON (no markdown fence) matching:

{
  "summary": "one or two sentences describing what the image shows and the overall privacy situation",
  "imageKind": "screenshot | photo | document | id-card | chat | code | dashboard | other",
  "extractedText": "all legible text you can read in the image, redacted where it is a secret. Empty string if none.",
  "findings": [
    {
      "category": "personal-information | contact | location | identifier | credential | code | workplace | metadata | other",
      "type": "short label, e.g. Email Address",
      "severity": "critical | high | medium | low",
      "confidence": 0.0,
      "description": "what was found and why it is a risk, one or two sentences",
      "evidence": "short redacted excerpt, or empty string",
      "locationHint": "human readable location, e.g. top-right corner of the screenshot",
      "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }
    }
  ]
}`

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
    summary: { type: Type.STRING },
    imageKind: stringEnum(['screenshot', 'photo', 'document', 'id-card', 'chat', 'code', 'dashboard', 'other']),
    extractedText: { type: Type.STRING },
    findings: {
      type: Type.ARRAY,
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
          type: { type: Type.STRING },
          severity: stringEnum(['critical', 'high', 'medium', 'low']),
          confidence: { type: Type.NUMBER },
          description: { type: Type.STRING },
          evidence: { type: Type.STRING },
          locationHint: { type: Type.STRING },
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
