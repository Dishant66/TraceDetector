/**
 * Deterministic detectors for sensitive strings.
 *
 * These run over text that TraceDetector already has: text read out of the
 * image by the AI engine, embedded metadata values, and the file name.
 * They are rule-based (no model involved), so their matches are exact.
 */

export const DETECTORS = [
  {
    id: 'private-key',
    type: 'Private Key Block',
    category: 'credential',
    severity: 'critical',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    description: 'A private key block is visible. Anyone with this key can impersonate you or decrypt your data.',
    recommendation: 'Never share this image. Rotate the key immediately and revoke the old one.',
  },
  {
    id: 'aws-key',
    type: 'AWS Access Key ID',
    category: 'credential',
    severity: 'critical',
    regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    description: 'An AWS access key ID is exposed. Keys like this are actively scraped from public images.',
    recommendation: 'Deactivate the key in IAM now, then remove it from the image.',
  },
  {
    id: 'openai-key',
    type: 'API Secret Key',
    category: 'credential',
    severity: 'critical',
    regex: /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/g,
    description: 'A provider secret key (sk-…) is visible and could be used to run charges on your account.',
    recommendation: 'Revoke the key with your provider and blur it before sharing.',
  },
  {
    id: 'github-token',
    type: 'GitHub Token',
    category: 'credential',
    severity: 'critical',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g,
    description: 'A GitHub token is visible. It can grant read or write access to your repositories.',
    recommendation: 'Revoke the token in GitHub settings and remove it from the image.',
  },
  {
    id: 'google-key',
    type: 'Google API Key',
    category: 'credential',
    severity: 'critical',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    description: 'A Google API key is visible and can be abused against your quota and billing.',
    recommendation: 'Restrict or regenerate the key, then crop it out of the image.',
  },
  {
    id: 'slack-token',
    type: 'Slack Token',
    category: 'credential',
    severity: 'critical',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    description: 'A Slack token is visible, which can expose workspace messages and files.',
    recommendation: 'Revoke the token in your Slack admin settings before sharing.',
  },
  {
    id: 'jwt',
    type: 'Session Token (JWT)',
    category: 'credential',
    severity: 'high',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    description: 'A JSON Web Token is visible. Until it expires it can be replayed to act as the signed-in user.',
    recommendation: 'Sign out to invalidate the session and blur the token.',
  },
  {
    id: 'password-literal',
    type: 'Password in Plain Text',
    category: 'credential',
    severity: 'critical',
    regex: /\b(?:password|passwd|pwd|passphrase|secret)\s*[:=]\s*["']?([^\s"'<>,;]{4,64})/gi,
    description: 'A password appears in readable text next to its label.',
    recommendation: 'Change the password and remove this region from the image.',
  },
  {
    id: 'env-secret',
    type: 'Environment Secret',
    category: 'credential',
    severity: 'high',
    regex: /\b[A-Z][A-Z0-9_]{3,40}(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)\s*=\s*\S{6,}/g,
    description: 'An environment variable containing a secret value is readable.',
    recommendation: 'Rotate the value and keep .env contents out of screenshots.',
  },
  {
    id: 'credit-card',
    type: 'Payment Card Number',
    category: 'identifier',
    severity: 'critical',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: luhn,
    description: 'A sequence matching a payment card number (and passing the Luhn check) is visible.',
    recommendation: 'Mask all but the last four digits, or remove the image entirely.',
  },
  {
    id: 'iban',
    type: 'Bank Account (IBAN)',
    category: 'identifier',
    severity: 'high',
    regex: /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b/g,
    description: 'An IBAN-shaped bank account number is visible.',
    recommendation: 'Redact the account number before sharing.',
  },
  {
    id: 'ssn',
    type: 'National ID (SSN format)',
    category: 'identifier',
    severity: 'critical',
    regex: /\b(?!000|666|9\d\d)\d{3}-\d{2}-\d{4}\b/g,
    description: 'A number formatted like a Social Security Number is visible.',
    recommendation: 'Government ID numbers should never appear in shared images — redact it.',
  },
  {
    id: 'aadhaar',
    type: 'National ID (12-digit)',
    category: 'identifier',
    severity: 'critical',
    regex: /(?<![\d\s])\b[2-9]\d{3}\s\d{4}\s\d{4}\b(?!\s*\d)/g,
    description: 'A 12-digit national identity number (Aadhaar format) is visible.',
    recommendation: 'Mask the first eight digits or remove the document from the image.',
  },
  {
    id: 'passport',
    type: 'Passport / Document Number',
    category: 'identifier',
    severity: 'high',
    regex: /\b(?:passport|document|licen[cs]e|dl)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Z0-9]{6,12})\b/gi,
    description: 'A labelled passport or licence number is visible.',
    recommendation: 'Cover the document number before sharing this image.',
  },
  {
    id: 'email',
    type: 'Email Address',
    category: 'contact',
    severity: 'medium',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    description: 'An email address is visible in the image.',
    recommendation: 'Blur or remove it before sharing to avoid spam, phishing and account-recovery attacks.',
  },
  {
    id: 'phone',
    type: 'Phone Number',
    category: 'contact',
    severity: 'medium',
    regex: /(?:\+\d{1,3}[ -]?)?(?:\(\d{2,4}\)[ -]?)?\d{3,5}[ -]\d{3,4}(?:[ -]\d{3,4})?\b/g,
    validate: (value) => (value.replace(/\D/g, '').length >= 8 && value.replace(/\D/g, '').length <= 15),
    description: 'A phone number is visible in the image.',
    recommendation: 'Hide the number unless you intend it to be public.',
  },
  {
    id: 'address',
    type: 'Postal Address',
    category: 'location',
    severity: 'high',
    regex: /\b\d{1,5}[ ,]+[A-Z][A-Za-z.'-]+(?:[ ][A-Z][A-Za-z.'-]+){0,3}[ ](?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Nagar|Marg|Colony|Sector|Block|Apartment|Apt|Suite)\b/g,
    description: 'Text matching a street address is visible, which can reveal where you live or work.',
    recommendation: 'Remove the address — it is one of the strongest identifiers in an image.',
  },
  {
    id: 'postcode-uk',
    type: 'Postal Code',
    category: 'location',
    severity: 'medium',
    regex: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g,
    description: 'A postal code is visible, which narrows your location to a small area.',
    recommendation: 'Crop or blur the postal code.',
  },
  {
    id: 'ip',
    type: 'Internal IP Address',
    category: 'workplace',
    severity: 'medium',
    regex: /\b(?:10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    description: 'A private network IP address is visible, exposing part of your internal infrastructure.',
    recommendation: 'Remove internal network details from anything shared outside your team.',
  },
  {
    id: 'internal-url',
    type: 'Internal System URL',
    category: 'workplace',
    severity: 'medium',
    regex: /\bhttps?:\/\/(?:[a-z0-9-]+\.)*(?:internal|intranet|corp|staging|dev|admin|vpn)[a-z0-9.-]*(?:\/\S*)?/gi,
    description: 'An internal or non-public system URL is visible.',
    recommendation: 'Hide internal hostnames so they cannot be probed from outside.',
  },
  {
    id: 'confidential-marking',
    type: 'Confidentiality Marking',
    category: 'workplace',
    severity: 'high',
    regex: /\b(?:strictly\s+confidential|confidential(?:ity)?|internal\s+use\s+only|do\s+not\s+distribute|proprietary|nda|restricted)\b/gi,
    description: 'The image carries a confidentiality marking, so the content is not cleared for sharing.',
    recommendation: 'Get approval from the document owner before sharing this anywhere.',
  },
  {
    id: 'dob',
    type: 'Date of Birth',
    category: 'personal-information',
    severity: 'medium',
    regex: /\b(?:dob|date\s+of\s+birth|born)\s*[:-]?\s*(\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4})/gi,
    description: 'A date of birth is visible, a key field for identity verification and fraud.',
    recommendation: 'Redact the date of birth.',
  },
]

/**
 * Runs every detector over a block of text.
 * @returns {Array<{detectorId,type,category,severity,description,recommendation,evidence,count}>}
 */
export function scanText(text, { source = 'text' } = {}) {
  if (typeof text !== 'string' || text.trim().length < 3) return []

  const results = []
  const seen = new Set()

  for (const detector of DETECTORS) {
    const regex = new RegExp(detector.regex.source, detector.regex.flags)
    const matches = []
    let match

    while ((match = regex.exec(text)) !== null) {
      if (match.index === regex.lastIndex) regex.lastIndex += 1
      const value = (match[1] || match[0]).trim()
      if (!value) continue
      if (detector.validate && !detector.validate(value)) continue
      const key = `${detector.id}:${value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      matches.push(value)
      if (matches.length >= 6) break
    }

    if (!matches.length) continue

    results.push({
      detectorId: detector.id,
      type: detector.type,
      category: detector.category,
      severity: detector.severity,
      description: detector.description,
      recommendation: detector.recommendation,
      evidence: matches.map((m) => redact(m, detector.category)).join(', '),
      count: matches.length,
      source,
    })
  }

  return results
}

/** Shows enough to recognise the match, never enough to reuse it. */
export function redact(value, category = 'other') {
  const text = String(value)

  if (category === 'credential') {
    return `${text.slice(0, 4)}${'•'.repeat(Math.min(12, Math.max(4, text.length - 6)))}`
  }

  if (text.includes('@')) {
    const [user, domain] = text.split('@')
    const head = user.slice(0, Math.min(2, user.length))
    return `${head}${'•'.repeat(Math.max(3, user.length - head.length))}@${domain}`
  }

  const digits = text.replace(/\D/g, '')
  if (digits.length >= 6) {
    return `${'•'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-4)}`
  }

  if (text.length <= 6) return text
  return `${text.slice(0, 3)}${'•'.repeat(Math.max(3, text.length - 6))}${text.slice(-2)}`
}

function luhn(value) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}
