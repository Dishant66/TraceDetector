import demoImage from '../assets/demo-screenshot.svg'

/**
 * Demo Analysis dataset.
 *
 * These findings are AUTHORED, not produced by a model — the UI labels them as
 * "Demo Analysis" everywhere so they can never be mistaken for a real result.
 * The bounding boxes are measured against the bundled mock screenshot, so the
 * overlay behaviour you see in the demo is exactly what a real analysis shows.
 */

export const DEMO_IMAGE = {
  dataUrl: demoImage,
  name: 'acme-onboarding-screenshot.png',
  size: 486_912,
  type: 'image/png',
  width: 1280,
  height: 800,
}

export const DEMO_SUMMARY =
  'A screenshot of an internal HR record with a terminal window, a visitor-pass QR code and a sticky note in frame. It exposes a full employee identity, live production credentials and confidential company material.'

export const DEMO_FINDINGS = [
  {
    detectorId: 'demo-stripe',
    category: 'credential',
    type: 'Live API Secret Keys',
    severity: 'critical',
    confidence: 0.98,
    description:
      'Two production secrets are readable in the terminal window: a payment provider live key and a cloud access key ID. Keys exposed in screenshots are harvested by automated scrapers within minutes.',
    evidence: 'sk_l••••••••••••, AKIA••••••••••••',
    recommendation: 'Rotate both keys with the provider now, then crop the terminal out of the image entirely.',
    locationHint: 'Terminal window, top right',
    box: { x: 0.5703, y: 0.26, w: 0.3125, h: 0.0625 },
    source: 'demo',
  },
  {
    detectorId: 'demo-dbpassword',
    category: 'credential',
    type: 'Database Password',
    severity: 'critical',
    confidence: 0.97,
    description:
      'A production database password is printed in plain text next to its variable name, giving anyone who reads it direct access to the data store.',
    evidence: 'Acme••••••••••',
    recommendation: 'Change the password immediately and never render .env files on a shared screen.',
    locationHint: 'Terminal window, fourth line',
    box: { x: 0.5703, y: 0.3225, w: 0.2031, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-iban',
    category: 'identifier',
    type: 'Bank Account (IBAN)',
    severity: 'critical',
    confidence: 0.93,
    description:
      'A full bank account number is visible on the employee record. Combined with the name and date of birth on the same screen, this is enough for payment fraud.',
    evidence: 'GB29 •••• •••• •••• 6819',
    recommendation: 'Redact the account number before this screenshot leaves the HR system.',
    locationHint: 'Employee record, bottom field',
    box: { x: 0.0688, y: 0.7575, w: 0.2266, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-wifi',
    category: 'credential',
    type: 'Wi-Fi Password on Sticky Note',
    severity: 'high',
    confidence: 0.91,
    description:
      'A physical sticky note in frame shows the guest network name and its password, plus a desk and badge number that place the person in the building.',
    evidence: 'SSID AcmeGuest-5G · password Welc•••••••',
    recommendation: 'Crop the note out and ask IT to rotate the guest network password.',
    locationHint: 'Yellow sticky note, right side',
    box: { x: 0.7516, y: 0.49, w: 0.1906, h: 0.2325 },
    source: 'demo',
  },
  {
    detectorId: 'demo-address',
    category: 'location',
    type: 'Home Address',
    severity: 'high',
    confidence: 0.94,
    description:
      'A full residential address including the postal code is visible. Together with the name on the same record it identifies exactly where this person lives.',
    evidence: '42 Brigade Road, Bengaluru ••••25',
    recommendation: 'Remove the address — it is the single strongest identifier on this screen.',
    locationHint: 'Employee record, "Home address" field',
    box: { x: 0.0688, y: 0.6075, w: 0.2578, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-confidential',
    category: 'workplace',
    type: 'Confidentiality Marking',
    severity: 'high',
    confidence: 0.99,
    description:
      'The page is explicitly marked "Strictly Confidential — Internal Use Only". Sharing it outside the company may breach both policy and data-protection law.',
    evidence: 'STRICTLY CONFIDENTIAL — INTERNAL USE ONLY',
    recommendation: 'Do not share externally without written approval from the document owner.',
    locationHint: 'Red notice, bottom right',
    box: { x: 0.5594, y: 0.7975, w: 0.3781, h: 0.1275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-email',
    category: 'contact',
    type: 'Email Address',
    severity: 'medium',
    confidence: 0.96,
    description:
      'A work email address is visible in the record, and the same address appears again in the footer line. Published addresses attract phishing aimed at this exact employee.',
    evidence: 'pr••••••••••@acme-robotics.io',
    recommendation: 'Blur or remove it before sharing.',
    locationHint: 'Employee record, "Work email" field',
    box: { x: 0.0688, y: 0.3825, w: 0.1875, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-phone',
    category: 'contact',
    type: 'Phone Number',
    severity: 'medium',
    confidence: 0.95,
    description: 'A personal mobile number is visible and can be used for SIM-swap or smishing attempts.',
    evidence: '•••••••43210',
    recommendation: 'Hide the number unless the recipient genuinely needs it.',
    locationHint: 'Employee record, "Mobile" field',
    box: { x: 0.0688, y: 0.4575, w: 0.1172, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-qr',
    category: 'code',
    type: 'QR Code Detected',
    severity: 'medium',
    confidence: 1,
    description:
      'A visitor-pass QR code is in frame. Anyone can scan it from the image, and the caption shows it resolves to a pass URL containing the employee ID.',
    evidence: 'acme-robotics.io/pass/ACM-••••-••83',
    recommendation: 'Cover the code — a screenshot of a pass is as usable as the pass itself.',
    locationHint: 'White card, centre right',
    box: { x: 0.5766, y: 0.5225, w: 0.1461, h: 0.2338 },
    source: 'demo',
  },
  {
    detectorId: 'demo-empid',
    category: 'identifier',
    type: 'Employee ID Number',
    severity: 'medium',
    confidence: 0.92,
    description:
      'An internal employee identifier is visible. It is often the username for internal systems and the key used by help-desk social engineering.',
    evidence: 'ACM-••••-••83',
    recommendation: 'Mask the identifier before sharing outside the team.',
    locationHint: 'Employee record, "Employee ID" field',
    box: { x: 0.0688, y: 0.5325, w: 0.1094, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-dob',
    category: 'personal-information',
    type: 'Date of Birth',
    severity: 'medium',
    confidence: 0.9,
    description: 'A date of birth is visible. It is a standard identity-verification question at banks and support desks.',
    evidence: '••/••/1997',
    recommendation: 'Redact the date of birth.',
    locationHint: 'Employee record, "Date of birth" field',
    box: { x: 0.0688, y: 0.6825, w: 0.1172, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'demo-internal-url',
    category: 'workplace',
    type: 'Internal System URL',
    severity: 'medium',
    confidence: 0.94,
    description:
      'The address bar exposes an internal hostname and the record path. It tells an outsider exactly which private systems exist and how they are addressed.',
    evidence: 'people.internal.acme-robotics.io/employee/…',
    recommendation: 'Crop the browser chrome, or use a clean window when capturing screenshots.',
    locationHint: 'Browser address bar, top of window',
    box: { x: 0.1016, y: 0.105, w: 0.4375, h: 0.04 },
    source: 'demo',
  },
  {
    detectorId: 'demo-ip',
    category: 'workplace',
    type: 'Internal IP Address',
    severity: 'medium',
    confidence: 0.93,
    description: 'A private network address for a mail and deploy host is readable, mapping part of the internal network.',
    evidence: '10.••.•.17',
    recommendation: 'Remove internal infrastructure details from anything shared outside the company.',
    locationHint: 'Terminal window, fifth line',
    box: { x: 0.5703, y: 0.3538, w: 0.2031, h: 0.0275 },
    source: 'demo',
  },
  {
    detectorId: 'exif-device',
    category: 'metadata',
    type: 'Device & Author Metadata',
    severity: 'low',
    confidence: 1,
    description:
      'The file itself records the capture software, the exact capture time and the account name that took the screenshot. None of it is visible on screen, but all of it travels with the file.',
    evidence: 'Author: p.sharma · macOS Screenshot 15.2 · 2026-01-14 09:41',
    recommendation: 'Re-export or re-screenshot the image to strip the metadata before sharing it externally.',
    locationHint: 'Embedded metadata (not visible in the picture)',
    box: null,
    source: 'demo',
  },
  {
    detectorId: 'demo-name',
    category: 'personal-information',
    type: 'Full Name',
    severity: 'low',
    confidence: 0.97,
    description:
      'A full name is visible. On its own this is low risk, but it links every other finding on this screen to a real identifiable person.',
    evidence: 'Priya S••••',
    recommendation: 'Keep it only if the recipient already knows who this record belongs to.',
    locationHint: 'Employee record, "Full name" field',
    box: { x: 0.0688, y: 0.3075, w: 0.1016, h: 0.0275 },
    source: 'demo',
  },
]

export const DEMO_METADATA = {
  format: 'PNG',
  hasExif: true,
  gps: null,
  notes: [],
  tags: {
    Software: 'macOS Screenshot 15.2',
    'Creation Time': '2026-01-14T09:41:06+05:30',
    Author: 'p.sharma',
  },
}

export const DEMO_EXTRACTED_TEXT = `Acme Robotics — People Hub
https://people.internal.acme-robotics.io/employee/ACM-2044-1183
Employee Record · Onboarding · Verified 12 Jan 2026 · ACTIVE
FULL NAME  Priya Sharma
WORK EMAIL  priya.sharma@acme-robotics.io
MOBILE  +91 98765 43210
EMPLOYEE ID  ACM-2044-1183
HOME ADDRESS  42 Brigade Road, Bengaluru 560025
DATE OF BIRTH  DOB: 14/03/1997
BANK ACCOUNT  IBAN GB29 NWBK 6016 1331 9268 19
Last updated by p.sharma@acme-robotics.io · internal use only
$ cat .env.production
STRIPE_SECRET_KEY=sk_live_••••••••••••
AWS_ACCESS_KEY_ID=AKIA••••••••••••
DB_PASSWORD=Acme••••••••
SMTP_HOST=10.42.8.17
VISITOR PASS  acme-robotics.io/pass/ACM-2044-1183
Guest Wi-Fi  SSID: AcmeGuest-5G  password: Welc•••••••  desk 4B · badge 2044
STRICTLY CONFIDENTIAL — INTERNAL USE ONLY`
