// Pure evidence vocabulary: what each state means, and how fresh evidence is.
// No React or network. Nothing here says a place "is accessible".

export type EvidenceState = 'known_barrier' | 'verified' | 'reported' | 'unknown'

export const EVIDENCE_STATES: readonly EvidenceState[] = ['verified', 'reported', 'unknown', 'known_barrier']

export interface EvidenceStateInfo {
  label: string
  /** One sentence a person can read without knowing our vocabulary. */
  explanation: string
  /** Distinct non-colour cue. */
  glyph: string
}

export const EVIDENCE_STATE_INFO: Record<EvidenceState, EvidenceStateInfo> = {
  verified: {
    label: 'Verified',
    explanation: 'A trained auditor confirmed this on site and the record has not expired.',
    glyph: '✓'
  },
  reported: {
    label: 'Reported',
    explanation: 'Someone reported this, but no auditor has verified it yet.',
    glyph: '•'
  },
  unknown: {
    label: 'Unknown',
    explanation: 'There is no current evidence. Unknown is never treated as accessible.',
    glyph: '?'
  },
  known_barrier: {
    label: 'Known barrier',
    explanation: 'Current evidence shows at least one barrier at this place.',
    glyph: '!'
  }
}

export interface EvidenceSummaryLike {
  state: EvidenceState
  feature_count: number
  features_with_current_evidence: number
  expired_count: number
  barrier_count: number
  last_observed_at?: string | null
  next_expiry_at?: string | null
}

export const FRESHNESS_OPTIONS = [
  { value: 0, label: 'Any age' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' }
] as const

const DAY_MS = 86_400_000

export function isEvidenceState(value: unknown): value is EvidenceState {
  return value === 'known_barrier' || value === 'verified' || value === 'reported' || value === 'unknown'
}

export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS))
}

/** "today", "3 days ago", "2 months ago" - or null when there is no date. */
export function describeAge(iso: string | null | undefined, now: Date = new Date()): string | null {
  const days = ageInDays(iso, now)
  if (days === null) return null
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 45) return `${days} days ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} months ago`
  const years = Math.round(days / 365)
  return years === 1 ? 'about a year ago' : `about ${years} years ago`
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return new Date(time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Days until the soonest current record expires; negative is not possible (expired rows are excluded). */
export function daysUntilExpiry(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return Math.ceil((time - now.getTime()) / DAY_MS)
}

export interface MissingInfo {
  text: string
  tone: 'neutral' | 'warning'
}

/** Honest statements about what the record does not cover. Empty only when everything is current. */
export function describeMissingInformation(summary: EvidenceSummaryLike | undefined | null): MissingInfo[] {
  if (!summary) return [{ text: 'Evidence details could not be loaded.', tone: 'neutral' }]

  const items: MissingInfo[] = []
  const { feature_count: total, features_with_current_evidence: current } = summary

  if (total === 0) {
    items.push({ text: 'No features (entrance, ramp, lift, toilet…) have been recorded yet.', tone: 'warning' })
  } else if (current === 0) {
    items.push({ text: `None of the ${total} recorded feature${total === 1 ? '' : 's'} has current evidence.`, tone: 'warning' })
  } else if (current < total) {
    const missing = total - current
    items.push({
      text: `${missing} of ${total} recorded feature${total === 1 ? '' : 's'} ${missing === 1 ? 'has' : 'have'} no current evidence.`,
      tone: 'warning'
    })
  }

  if (summary.expired_count > 0) {
    items.push({
      text: `${summary.expired_count} earlier observation${summary.expired_count === 1 ? ' has' : 's have'} expired and no longer count.`,
      tone: 'warning'
    })
  }
  return items
}

/** One line for a card: what is on file and when it was last observed. */
export function describeFreshness(summary: EvidenceSummaryLike | undefined | null, now: Date = new Date()): string {
  if (!summary) return 'Evidence details unavailable'
  const age = describeAge(summary.last_observed_at, now)
  if (!age) return 'Never audited'
  return `Last observed ${age}`
}

export function describeEvidenceCoverage(summary: EvidenceSummaryLike | undefined | null): string {
  if (!summary) return 'Evidence details unavailable'
  if (summary.feature_count === 0) return 'No features recorded'
  return `${summary.features_with_current_evidence} of ${summary.feature_count} features have current evidence`
}
