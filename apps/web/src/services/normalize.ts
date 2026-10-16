// Types for public (no-login) API payloads, plus adapters from the wire format.
// Pure: no fetch. The adapters exist because the server sends `feature_name` and
// `detail`/`payload` while the UI works with `name`, `details`, `phone`, `script`, `message`.

import type { EvidenceState } from './evidence.ts'
import { isEvidenceState } from './evidence.ts'
import type { RequirementLike } from './requirements.ts'

export type StepStatus = 'verified' | 'reported' | 'temporary_barrier' | 'barrier' | 'unknown'
export type VerdictStatus = 'confirmed' | 'not_confirmed'

export interface PlaceEvidenceSummary {
  state: EvidenceState
  feature_count: number
  features_with_current_evidence: number
  current_observation_count: number
  verified_count: number
  reported_count: number
  barrier_count: number
  expired_count: number
  last_observed_at: string | null
  next_expiry_at: string | null
}

export interface PlaceSummary {
  id: string
  name: string
  type: string
  address: string
  department?: string
  phone?: string
  hours?: string
  latitude: number
  longitude: number
  distance_m?: number
  evidence?: PlaceEvidenceSummary
}

export interface NextActionItem {
  action_type: string
  title: string
  details: string
  phone?: string
  script?: string
  message?: string
}

export interface Requirement extends RequirementLike {
  critical: boolean
  custom: boolean
}

export interface EvaluationMeta {
  evaluated_at?: string
  requirements: Requirement[]
  unevaluated_needs: string[]
  ignored_thresholds: string[]
}

export interface FeatureCard {
  feature_id: string
  feature_type: string
  name: string
  floor_level: number
  status: StepStatus
  /** False when no rule for the selected needs applies to this feature. */
  applicable: boolean
  label?: string
  source?: string
  observed_at?: string
  age_days?: number
  expires_at?: string
  reason: string
  next_actions: NextActionItem[]
}

export interface ReadinessCardResponse extends EvaluationMeta {
  place_id: string
  name: string
  place_type: string
  address: string
  phone?: string
  latitude: number
  longitude: number
  overall_status: VerdictStatus
  confidence_score: number
  summary_text: string
  limits_notice: string
  active_needs: string[]
  features: FeatureCard[]
}

export interface JourneyStep {
  step_id: string
  feature_id: string
  feature_type: string
  description: string
  floor_level: number
  is_critical: boolean
  applicable: boolean
  status: StepStatus
  label?: string
  source?: string
  observed_at?: string
  age_days?: number
  expires_at?: string
  reason: string
  next_actions: NextActionItem[]
}

export interface JourneyPlanResponse extends EvaluationMeta {
  destination_name: string
  destination_address: string
  destination_phone?: string
  total_distance_m: number
  overall_status: VerdictStatus
  confidence_score: number
  summary_text: string
  limits_notice: string
  active_needs: string[]
  route_kind: 'pedestrian_network' | 'straight_line'
  route_geometry: { type: string; coordinates: number[][] }
  steps: JourneyStep[]
  next_actions: NextActionItem[]
}

type Json = Record<string, unknown>

function rec(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

const STEP_STATUSES: readonly StepStatus[] = ['verified', 'reported', 'temporary_barrier', 'barrier', 'unknown']

function stepStatus(value: unknown): StepStatus {
  // Anything unrecognised is treated as unknown, never as accessible.
  return STEP_STATUSES.includes(value as StepStatus) ? (value as StepStatus) : 'unknown'
}

function verdict(value: unknown): VerdictStatus {
  return value === 'confirmed' ? 'confirmed' : 'not_confirmed'
}

export function normalizeAction(raw: unknown): NextActionItem {
  const a = rec(raw)
  const payload = rec(a.payload)
  return {
    action_type: str(a.action_type) ?? 'info',
    title: str(a.title) ?? 'Next step',
    details: str(a.details) ?? str(a.detail) ?? '',
    phone: str(a.phone) ?? str(payload.phone),
    script: str(a.script) ?? str(payload.script),
    message: str(a.message) ?? str(payload.message)
  }
}

function normalizeActions(raw: unknown): NextActionItem[] {
  return Array.isArray(raw) ? raw.map(normalizeAction) : []
}

export function normalizeRequirement(raw: unknown): Requirement {
  const r = rec(raw)
  return {
    need_code: str(r.need_code) ?? 'unknown',
    feature_type: str(r.feature_type) ?? 'feature',
    attribute_key: str(r.attribute_key) ?? '',
    operator: str(r.operator) ?? 'eq',
    threshold: r.threshold,
    standard_threshold: r.standard_threshold,
    critical: r.critical !== false,
    custom: r.custom === true
  }
}

function normalizeMeta(r: Json): EvaluationMeta {
  return {
    evaluated_at: str(r.evaluated_at),
    requirements: Array.isArray(r.requirements) ? r.requirements.map(normalizeRequirement) : [],
    unevaluated_needs: strArray(r.unevaluated_needs),
    ignored_thresholds: strArray(r.ignored_thresholds)
  }
}

export function normalizeEvidenceSummary(raw: unknown): PlaceEvidenceSummary | undefined {
  const e = rec(raw)
  if (!isEvidenceState(e.state)) return undefined
  return {
    state: e.state,
    feature_count: num(e.feature_count),
    features_with_current_evidence: num(e.features_with_current_evidence),
    current_observation_count: num(e.current_observation_count),
    verified_count: num(e.verified_count),
    reported_count: num(e.reported_count),
    barrier_count: num(e.barrier_count),
    expired_count: num(e.expired_count),
    last_observed_at: str(e.last_observed_at) ?? null,
    next_expiry_at: str(e.next_expiry_at) ?? null
  }
}

export function normalizePlace(raw: unknown): PlaceSummary {
  const p = rec(raw)
  return {
    id: str(p.id) ?? '',
    name: str(p.name) ?? 'Unnamed place',
    type: str(p.type) ?? 'other',
    address: str(p.address) ?? '',
    department: str(p.department),
    phone: str(p.phone),
    hours: str(p.hours),
    latitude: num(p.latitude),
    longitude: num(p.longitude),
    distance_m: typeof p.distance_m === 'number' ? p.distance_m : undefined,
    evidence: normalizeEvidenceSummary(p.evidence)
  }
}

export function normalizeReadinessCard(raw: unknown): ReadinessCardResponse {
  const r = rec(raw)
  return {
    place_id: str(r.place_id) ?? '',
    name: str(r.name) ?? 'Unnamed place',
    place_type: str(r.type) ?? str(r.place_type) ?? 'other',
    address: str(r.address) ?? '',
    phone: str(r.phone),
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    overall_status: verdict(r.overall_status),
    confidence_score: num(r.confidence_score),
    summary_text: str(r.summary_text) ?? '',
    limits_notice: str(r.limits_notice) ?? '',
    active_needs: strArray(r.active_needs),
    features: (Array.isArray(r.features) ? r.features : []).map(f => {
      const x = rec(f)
      return {
        feature_id: str(x.feature_id) ?? '',
        feature_type: str(x.feature_type) ?? 'feature',
        name: str(x.feature_name) ?? str(x.name) ?? str(x.feature_type) ?? 'Feature',
        floor_level: num(x.floor_level),
        status: stepStatus(x.status),
        applicable: x.applicable !== false,
        label: str(x.label),
        source: str(x.source),
        observed_at: str(x.observed_at),
        age_days: typeof x.age_days === 'number' ? x.age_days : undefined,
        expires_at: str(x.expires_at),
        reason: str(x.reason) ?? '',
        next_actions: normalizeActions(x.next_actions)
      }
    }),
    ...normalizeMeta(r)
  }
}

export function normalizeJourneyPlan(raw: unknown): JourneyPlanResponse {
  const r = rec(raw)
  const geometry = rec(r.route_geometry)
  return {
    destination_name: str(r.destination_name) ?? 'Destination',
    destination_address: str(r.destination_address) ?? '',
    destination_phone: str(r.destination_phone),
    total_distance_m: num(r.total_distance_m),
    overall_status: verdict(r.overall_status),
    confidence_score: num(r.confidence_score),
    summary_text: str(r.summary_text) ?? '',
    limits_notice: str(r.limits_notice) ?? '',
    active_needs: strArray(r.active_needs),
    route_kind: r.route_kind === 'pedestrian_network' ? 'pedestrian_network' : 'straight_line',
    route_geometry: {
      type: str(geometry.type) ?? 'LineString',
      coordinates: Array.isArray(geometry.coordinates) ? (geometry.coordinates as number[][]) : []
    },
    steps: (Array.isArray(r.steps) ? r.steps : []).map(s => {
      const x = rec(s)
      return {
        step_id: str(x.step_id) ?? '',
        feature_id: str(x.feature_id) ?? '',
        feature_type: str(x.feature_type) ?? 'feature',
        description: str(x.description) ?? '',
        floor_level: num(x.floor_level),
        is_critical: x.is_critical !== false,
        applicable: x.applicable !== false,
        status: stepStatus(x.status),
        label: str(x.label),
        source: str(x.source),
        observed_at: str(x.observed_at),
        age_days: typeof x.age_days === 'number' ? x.age_days : undefined,
        expires_at: str(x.expires_at),
        reason: str(x.reason) ?? '',
        next_actions: normalizeActions(x.next_actions)
      }
    }),
    next_actions: normalizeActions(r.next_actions),
    ...normalizeMeta(r)
  }
}

export interface RequirementsResponse {
  active_needs: string[]
  requirements: Requirement[]
  unevaluated_needs: string[]
  ignored_thresholds: string[]
}

export function normalizeRequirements(raw: unknown): RequirementsResponse {
  const r = rec(raw)
  return {
    active_needs: strArray(r.active_needs),
    requirements: Array.isArray(r.requirements) ? r.requirements.map(normalizeRequirement) : [],
    unevaluated_needs: strArray(r.unevaluated_needs),
    ignored_thresholds: strArray(r.ignored_thresholds)
  }
}
