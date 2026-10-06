export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

export const SEVERITY = {
  critical: {
    id: 'critical',
    label: 'Critical',
    weight: 40,
    blurb: 'Do not share until this is removed.',
  },
  high: {
    id: 'high',
    label: 'High',
    weight: 22,
    blurb: 'Strongly recommended to remove.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    weight: 10,
    blurb: 'Consider removing depending on audience.',
  },
  low: {
    id: 'low',
    label: 'Low',
    weight: 4,
    blurb: 'Minor exposure, usually acceptable.',
  },
  safe: {
    id: 'safe',
    label: 'Safe',
    weight: 0,
    blurb: 'No action needed.',
  },
}

export const CATEGORY = {
  'personal-information': { label: 'Personal Information', icon: 'user' },
  contact: { label: 'Contact Details', icon: 'mail' },
  location: { label: 'Location', icon: 'pin' },
  identifier: { label: 'IDs & Documents', icon: 'id' },
  credential: { label: 'Credentials & Secrets', icon: 'key' },
  code: { label: 'Codes & Barcodes', icon: 'qr' },
  workplace: { label: 'Workplace Confidential', icon: 'building' },
  metadata: { label: 'File Metadata', icon: 'layers' },
  other: { label: 'Other', icon: 'alert' },
}

export function severityMeta(id) {
  return SEVERITY[id] || SEVERITY.medium
}

export function categoryMeta(id) {
  return CATEGORY[id] || CATEGORY.other
}

/** Risk bands used by the score gauge and summary copy. */
export const RISK_LEVELS = [
  {
    id: 'critical',
    label: 'Critical Risk',
    min: 80,
    headline: 'Do not share this image yet.',
    detail: 'TraceDetector found information that can be used to impersonate you or breach an account.',
  },
  {
    id: 'high',
    label: 'High Risk',
    min: 55,
    headline: 'Clean this image before sharing.',
    detail: 'Identifying or confidential details are visible and should be removed first.',
  },
  {
    id: 'medium',
    label: 'Medium Risk',
    min: 30,
    headline: 'Review before you share.',
    detail: 'Some details are exposed. Whether that matters depends on who will see this image.',
  },
  {
    id: 'low',
    label: 'Low Risk',
    min: 10,
    headline: 'Looks mostly safe to share.',
    detail: 'Only minor exposure was found. Give the findings a quick read and you are good to go.',
  },
  {
    id: 'safe',
    label: 'Safe',
    min: 0,
    headline: 'Nothing sensitive detected.',
    detail: 'No exposed information was found by this analysis. Always use your own judgement too.',
  },
]

export function riskLevelFor(score) {
  return RISK_LEVELS.find((level) => score >= level.min) || RISK_LEVELS[RISK_LEVELS.length - 1]
}
