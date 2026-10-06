import { SEVERITY, SEVERITY_ORDER, riskLevelFor } from '../data/taxonomy.js'

/**
 * Turns a list of findings into a 0–100 privacy risk score.
 *
 * Weighted by severity with diminishing returns, so ten medium findings never
 * outrank one leaked private key, and the score stays readable.
 */
export function computeRiskScore(findings = []) {
  const counts = countBySeverity(findings)

  let raw = 0
  for (const severity of SEVERITY_ORDER) {
    const n = counts[severity]
    if (!n) continue
    const weight = SEVERITY[severity].weight
    // first occurrence counts fully, each extra one contributes less
    raw += weight * (1 + Math.log2(n + 1) - 1)
  }

  // Confidence dampening: low-confidence findings move the needle less.
  const avgConfidence = findings.length
    ? findings.reduce((sum, f) => sum + (Number.isFinite(f.confidence) ? f.confidence : 0.8), 0) /
      findings.length
    : 1

  const adjusted = raw * (0.65 + 0.35 * avgConfidence)

  // Soft saturation: the scale approaches but never reaches 100, so "worse
  // than terrible" still reads as a believable number.
  const saturated = 100 * (1 - Math.exp(-adjusted / 60))

  // A single severe finding must never present as a low score.
  const floor = findings.length ? SEVERITY_FLOOR[worstSeverity(findings)] || 0 : 0

  const score = findings.length ? Math.min(99, Math.round(Math.max(saturated, floor))) : 0
  const level = riskLevelFor(score)

  return {
    score,
    level: level.id,
    label: level.label,
    headline: level.headline,
    detail: level.detail,
    counts,
    total: findings.length,
  }
}

const SEVERITY_FLOOR = { critical: 80, high: 58, medium: 32, low: 12 }

function worstSeverity(findings) {
  for (const severity of SEVERITY_ORDER) {
    if (findings.some((f) => f.severity === severity)) return severity
  }
  return 'low'
}

export function countBySeverity(findings = []) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const finding of findings) {
    if (counts[finding.severity] !== undefined) counts[finding.severity] += 1
  }
  return counts
}

export function sortFindings(findings = []) {
  return [...findings].sort((a, b) => {
    const rank = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    if (rank !== 0) return rank
    return (b.confidence || 0) - (a.confidence || 0)
  })
}
