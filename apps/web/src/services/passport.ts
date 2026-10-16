// Pure helpers for the Journey Readiness Passport: grouping, counts and share text.

import { describeAge, formatDate } from './evidence.ts'
import { normalizeJourneyPlan, type JourneyPlanResponse, type JourneyStep } from './normalize.ts'
import { describeRequirement, needLabel } from './requirements.ts'

/** Feature types that belong to the walk itself rather than to the destination building. */
const ROUTE_FEATURES = new Set(['kerb', 'crossing', 'footpath', 'tactile_path', 'pavement', 'slope'])

export interface StepGroups {
  route: JourneyStep[]
  destination: JourneyStep[]
}

export function splitSteps(steps: readonly JourneyStep[]): StepGroups {
  const route: JourneyStep[] = []
  const destination: JourneyStep[] = []
  for (const step of steps) {
    ;(ROUTE_FEATURES.has(step.feature_type) ? route : destination).push(step)
  }
  return { route, destination }
}

export interface StepCounts {
  applicable: number
  notApplicable: number
  verified: number
  reported: number
  unknown: number
  barrier: number
}

export function countSteps(steps: readonly JourneyStep[]): StepCounts {
  const counts: StepCounts = { applicable: 0, notApplicable: 0, verified: 0, reported: 0, unknown: 0, barrier: 0 }
  for (const step of steps) {
    if (!step.applicable) {
      counts.notApplicable += 1
      continue
    }
    counts.applicable += 1
    if (step.status === 'verified') counts.verified += 1
    else if (step.status === 'reported') counts.reported += 1
    else if (step.status === 'barrier' || step.status === 'temporary_barrier') counts.barrier += 1
    else counts.unknown += 1
  }
  return counts
}

const STATUS_WORDS: Record<string, string> = {
  verified: 'Verified',
  reported: 'Reported (not yet verified)',
  unknown: 'Unknown',
  barrier: 'Known barrier',
  temporary_barrier: 'Temporary barrier'
}

/** Plain-text summary a person can paste into a message. Contains no profile data. */
export function buildShareSummary(plan: JourneyPlanResponse, now: Date = new Date()): string {
  const counts = countSteps(plan.steps)
  const lines: string[] = []
  lines.push(`SAARTHI journey readiness: ${plan.destination_name}`)
  if (plan.destination_address) lines.push(plan.destination_address)
  lines.push('')
  lines.push(`Result: ${plan.overall_status === 'confirmed' ? 'Confirmed for the needs checked' : 'NOT confirmed'}`)
  lines.push(plan.summary_text)
  lines.push(
    `Evidence coverage: ${counts.verified + counts.reported} of ${counts.applicable} applicable steps have current evidence ` +
      `(${counts.verified} verified, ${counts.reported} reported, ${counts.unknown} unknown, ${counts.barrier} barrier).`
  )
  if (plan.active_needs.length > 0) lines.push(`Checked for: ${plan.active_needs.map(needLabel).join(', ')}`)
  const customised = plan.requirements.filter(r => r.custom).map(describeRequirement)
  if (customised.length > 0) lines.push(`Personal limits applied: ${customised.join('; ')}`)
  if (plan.route_kind === 'straight_line') lines.push('Note: no mapped walking route was found, so the distance is a straight line and is not a route.')

  const problems = plan.steps.filter(s => s.applicable && s.status !== 'verified' && s.status !== 'reported')
  if (problems.length > 0) {
    lines.push('')
    lines.push('Needs attention:')
    for (const step of problems) lines.push(`- ${step.description}: ${STATUS_WORDS[step.status] ?? step.status}`)
  }

  lines.push('')
  const when = formatDate(plan.evaluated_at) ?? formatDate(now.toISOString())
  lines.push(`Checked on ${when}. Evidence expires; check again before travelling.`)
  if (plan.destination_phone) lines.push(`Facility phone: ${plan.destination_phone}`)
  lines.push(plan.limits_notice)
  return lines.join('\n')
}

/** The exported file: the evaluated result only. */
export function serializePassport(plan: JourneyPlanResponse): string {
  return JSON.stringify({ app: 'SAARTHI Access', kind: 'journey-readiness-passport', exportedAt: new Date().toISOString(), passport: plan }, null, 2)
}

export function describeStepEvidence(step: JourneyStep, now: Date = new Date()): string | null {
  const age = describeAge(step.observed_at, now)
  return age ? `Observed ${age}` : null
}

export type PassportImport = { ok: true; plan: JourneyPlanResponse } | { ok: false; error: string }

/** Read a passport file exported from SAARTHI. Anything else is rejected. */
export function parsePassportFile(text: string): PassportImport {
  if (text.length > 2_000_000) return { ok: false, error: 'This file is too large to be a SAARTHI passport.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }
  const file = raw as { kind?: unknown; passport?: unknown } | null
  if (!file || file.kind !== 'journey-readiness-passport' || typeof file.passport !== 'object' || file.passport === null) {
    return { ok: false, error: 'This is not a SAARTHI journey passport file.' }
  }
  return { ok: true, plan: normalizeJourneyPlan(file.passport) }
}
