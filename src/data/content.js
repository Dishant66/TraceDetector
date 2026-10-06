export const STEPS = [
  {
    id: 'upload',
    number: '01',
    icon: 'upload',
    title: 'Upload',
    text: 'Drag in the screenshot or photo you are about to send. It stays in your browser — nothing is saved to a database.',
  },
  {
    id: 'analyse',
    number: '02',
    icon: 'sparkle',
    title: 'AI Analysis',
    text: 'TraceDetector reads what is visible in the image, checks the hidden file data, and matches everything against known patterns for secrets and IDs.',
  },
  {
    id: 'report',
    number: '03',
    icon: 'shield',
    title: 'Privacy Report',
    text: 'You get a risk score, every exposed item explained in plain language, and a short checklist to clear before you hit share.',
  },
]

export const DETECTION_GROUPS = [
  {
    id: 'identity',
    icon: 'user',
    title: 'Personal information',
    text: 'Names, usernames, signatures and anything that ties the image to a real person.',
    items: ['Full names', 'Usernames & handles', 'Dates of birth', 'Profile photos in frame'],
  },
  {
    id: 'contact',
    icon: 'mail',
    title: 'Contact details',
    text: 'Addresses people can use to reach, spam or impersonate you.',
    items: ['Email addresses', 'Phone numbers', 'Social handles'],
  },
  {
    id: 'location',
    icon: 'pin',
    title: 'Location & addresses',
    text: 'Street addresses on screen plus GPS coordinates hidden inside the file.',
    items: ['Postal addresses', 'Postal codes', 'EXIF GPS coordinates', 'Visible location signage'],
  },
  {
    id: 'ids',
    icon: 'id',
    title: 'IDs & document numbers',
    text: 'The identifiers that unlock accounts and verify identity.',
    items: ['Government ID numbers', 'Payment cards (Luhn-checked)', 'Bank accounts & IBANs', 'Employee & student IDs'],
  },
  {
    id: 'secrets',
    icon: 'key',
    title: 'Passwords & secrets',
    text: 'The costliest thing to leak in a screenshot, and the easiest to miss.',
    items: ['Passwords in plain text', 'API keys & access tokens', '.env values', 'Private key blocks'],
  },
  {
    id: 'codes',
    icon: 'qr',
    title: 'QR codes & barcodes',
    text: 'Codes are unreadable to you but perfectly readable to any phone camera.',
    items: ['QR codes', 'Barcodes & ticket codes', 'Links encoded in codes'],
  },
  {
    id: 'workplace',
    icon: 'building',
    title: 'Workplace confidential',
    text: 'The material that turns a casual screenshot into a policy incident.',
    items: ['Confidentiality markings', 'Internal URLs & hostnames', 'Private IP addresses', 'Client and revenue data'],
  },
  {
    id: 'metadata',
    icon: 'layers',
    title: 'Hidden file metadata',
    text: 'Data that travels with the file even though it is invisible on screen.',
    items: ['EXIF camera & device', 'Author and software tags', 'Capture timestamps', 'Camera serial numbers'],
  },
]

export const WHY_IT_MATTERS = [
  {
    id: 'employees',
    icon: 'users',
    stat: 'Every standup',
    title: 'Employees share screenshots constantly',
    text: 'Bug reports, Slack threads, dashboards, "quick look at this". Each one can carry a customer name, an internal URL or a token that was never meant to leave the team.',
  },
  {
    id: 'remote',
    icon: 'globe',
    stat: 'Remote by default',
    title: 'Distributed teams move faster than review',
    text: 'Work now flows through chat apps and public communities. There is rarely a second pair of eyes between capturing a screen and posting it.',
  },
  {
    id: 'students',
    icon: 'file',
    stat: 'Portfolios & applications',
    title: 'Students share documents publicly',
    text: 'Résumés, ID cards, marksheets and project demos get uploaded to job boards and group chats with phone numbers and roll numbers still visible.',
  },
  {
    id: 'secrets',
    icon: 'key',
    stat: 'Minutes to abuse',
    title: 'Leaked keys are found automatically',
    text: 'Credentials posted in public images are scraped and tried quickly. A single visible key in a demo video can become a billing incident.',
  },
  {
    id: 'accidents',
    icon: 'alert',
    stat: 'No undo button',
    title: 'Accidental exposure is permanent',
    text: 'Once an image is sent it is copied, cached and forwarded. Deleting the original does not delete what people already saw.',
  },
  {
    id: 'automation',
    icon: 'bolt',
    stat: 'Seconds, not meetings',
    title: 'Automation makes the safe path the easy path',
    text: 'An AI-assisted check before sharing turns a policy nobody reads into a two-second habit that actually gets followed.',
  },
]

export const TRUST_POINTS = [
  { icon: 'lock', label: 'Images are never stored on a server' },
  { icon: 'cpu', label: 'Metadata & barcode scanning runs on-device' },
  { icon: 'shield', label: 'API keys stay server-side, never in the browser' },
]

export const FAQS = [
  {
    q: 'Is my image uploaded anywhere?',
    a: 'On-Device Scan never sends the image anywhere — metadata, barcode and file-name checks run entirely in your browser. AI Analysis sends the image to the configured vision provider for a single request and keeps no copy. TraceDetector itself has no database.',
  },
  {
    q: 'What happens if no AI provider is configured?',
    a: 'The app stays fully usable. On-Device Scan still produces real findings from file metadata, QR codes and the file name, and Demo Analysis walks through a complete sample report. Demo results are labelled as sample data everywhere they appear.',
  },
  {
    q: 'How accurate is the analysis?',
    a: 'Pattern checks (keys, cards, IBANs, GPS tags) are exact rule-based matches. The AI layer is a judgement call and can both miss things and over-report. TraceDetector shows a confidence level on every finding and is designed as a second pair of eyes, not a guarantee.',
  },
  {
    q: 'Can it blur or redact the image for me?',
    a: 'Not in this version. TraceDetector tells you exactly what to remove and where it is, then you redact it in your usual editor. Automated redaction is the natural next step for the project.',
  },
]
