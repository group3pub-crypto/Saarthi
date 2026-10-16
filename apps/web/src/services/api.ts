import type { ThresholdPreferences } from './profile.ts'
import type { EvidenceState } from './evidence.ts'
import {
  normalizeJourneyPlan,
  normalizePlace,
  normalizeReadinessCard,
  normalizeRequirements,
  type JourneyPlanResponse,
  type PlaceSummary,
  type ReadinessCardResponse,
  type RequirementsResponse
} from './normalize.ts'

export type {
  FeatureCard,
  JourneyPlanResponse,
  JourneyStep,
  NextActionItem,
  PlaceEvidenceSummary,
  PlaceSummary,
  ReadinessCardResponse,
  Requirement,
  RequirementsResponse,
  StepStatus,
  VerdictStatus
} from './normalize.ts'

const API_BASE = '/api/v1'

/** FastAPI sends `detail` as a string, or as a list of validation problems. */
export function errorMessage(body: unknown, fallback: string): string {
  const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : undefined
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined
    if (first && typeof first.msg === 'string') return first.msg
  }
  return fallback
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}))
}

export async function searchPlaces(params: {
  q?: string
  type?: string
  near?: string
  limit?: number
  evidence_state?: EvidenceState
  fresh_days?: number
}, signal?: AbortSignal): Promise<PlaceSummary[]> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.type) query.set('type', params.type)
  if (params.near) query.set('near', params.near)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.evidence_state) query.set('evidence_state', params.evidence_state)
  if (params.fresh_days) query.set('fresh_days', String(params.fresh_days))

  const res = await fetch(`${API_BASE}/places?${query.toString()}`, { signal })
  if (!res.ok) {
    throw new Error(errorMessage(await readJson(res), `Failed to search places (${res.status})`))
  }
  const body = await res.json()
  return Array.isArray(body) ? body.map(normalizePlace) : []
}

export async function getPlace(placeId: string, signal?: AbortSignal): Promise<PlaceSummary> {
  const res = await fetch(`${API_BASE}/places/${encodeURIComponent(placeId)}`, { signal })
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'That place was not found.' : errorMessage(await readJson(res), `Failed to load place (${res.status})`))
  }
  return normalizePlace(await res.json())
}

function thresholdQuery(query: URLSearchParams, thresholds?: ThresholdPreferences) {
  if (!thresholds) return
  for (const [key, value] of Object.entries(thresholds)) {
    if (typeof value === 'number') query.set(key, String(value))
  }
}

export async function getPlaceReadinessCard(
  placeId: string,
  needs: string[],
  thresholds?: ThresholdPreferences
): Promise<ReadinessCardResponse> {
  const query = new URLSearchParams()
  query.set('needs', needs.join(','))
  thresholdQuery(query, thresholds)
  const res = await fetch(`${API_BASE}/places/${encodeURIComponent(placeId)}/readiness-card?${query.toString()}`)
  if (!res.ok) {
    throw new Error(errorMessage(await readJson(res), `Failed to fetch readiness card (${res.status})`))
  }
  return normalizeReadinessCard(await res.json())
}

export async function getRequirements(
  needs: string[],
  thresholds?: ThresholdPreferences,
  signal?: AbortSignal
): Promise<RequirementsResponse> {
  const query = new URLSearchParams()
  query.set('needs', needs.join(','))
  thresholdQuery(query, thresholds)
  const res = await fetch(`${API_BASE}/needs/requirements?${query.toString()}`, { signal })
  if (!res.ok) {
    throw new Error(errorMessage(await readJson(res), `Failed to load requirements (${res.status})`))
  }
  return normalizeRequirements(await res.json())
}

export async function planJourney(payload: {
  origin: { latitude: number; longitude: number }
  destination_place_id: string
  needs: string[]
  thresholds?: ThresholdPreferences
}): Promise<JourneyPlanResponse> {
  const res = await fetch(`${API_BASE}/journeys/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    throw new Error(errorMessage(await readJson(res), `Failed to plan journey (${res.status})`))
  }
  return normalizeJourneyPlan(await res.json())
}

export async function submitUserReport(formData: FormData): Promise<{ report_id: string; message: string }> {
  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) {
    if (res.status === 404 || res.status === 405) {
      throw new Error('Public reporting is not available on this server yet, so nothing was sent.')
    }
    throw new Error(errorMessage(await readJson(res), `Failed to submit report (${res.status})`))
  }
  return res.json()
}

// ==========================================
// Auditor & Staff Verification API Methods
// ==========================================

export interface StaffLoginResponse {
  access_token: string
  token_type: string
  user_id: string
  email: string
  role: string
}

export interface StaffUser {
  id: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export interface AttributeDefinition {
  id: string
  feature_type: string
  key: string
  value_type: 'number' | 'boolean' | 'string' | 'enum'
  unit?: string
  description: string
}

export interface AuditAssignment {
  place_id: string
  place_name: string
  place_type: string
  address: string
  department?: string
  ward_name?: string
  latitude: number
  longitude: number
  total_features: number
  unverified_features: number
  priority_score: number
}

export interface EvidenceQueueItem {
  id: string
  feature_id: string
  feature_name?: string
  feature_type?: string
  place_name?: string
  attribute_key: string
  value: any
  label: string
  source: string
  observer_id?: string
  observer_email?: string
  verifier_id?: string
  verifier_email?: string
  observed_at: string
  expires_at: string
  photo_ids: string[]
  note?: string
  status: string
  created_at: string
}

export interface ReauditQueueItem {
  feature_id: string
  feature_name: string
  feature_type: string
  place_id?: string
  place_name?: string
  attribute_key: string
  current_label: string
  expired_at?: string
  days_since_expiry: number
  impact_score: number
  reason: string
}

export async function loginStaff(email: string, password: string): Promise<StaffLoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Login failed')
  }
  return res.json()
}

export async function getCurrentStaffUser(token: string): Promise<StaffUser> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    throw new Error('Failed to fetch user profile')
  }
  return res.json()
}

export async function getAttributeDefinitions(featureType?: string): Promise<AttributeDefinition[]> {
  const query = featureType ? `?feature_type=${encodeURIComponent(featureType)}` : ''
  const res = await fetch(`${API_BASE}/attribute-defs${query}`)
  if (!res.ok) {
    throw new Error('Failed to fetch attribute definitions')
  }
  return res.json()
}

export async function getAuditAssignments(token: string, placeType?: string): Promise<AuditAssignment[]> {
  const query = placeType ? `?place_type=${encodeURIComponent(placeType)}` : ''
  const res = await fetch(`${API_BASE}/audits/assignments${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    throw new Error('Failed to fetch audit assignments')
  }
  return res.json()
}

export async function syncAuditsBatch(
  token: string,
  items: Array<{
    feature_id: string
    attribute_key: string
    value: any
    note?: string
    photo_ids?: string[]
  }>
): Promise<{ synced_count: number; evidence_ids: string[]; rejected_count: number; errors: string[] }> {
  const res = await fetch(`${API_BASE}/audits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ items })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to sync audits')
  }
  return res.json()
}

export async function getVerificationQueue(token: string): Promise<EvidenceQueueItem[]> {
  const res = await fetch(`${API_BASE}/audits/verification-queue`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    throw new Error('Failed to fetch verification queue')
  }
  return res.json()
}

export async function approveEvidence(token: string, evidenceId: string, note?: string): Promise<EvidenceQueueItem> {
  const res = await fetch(`${API_BASE}/evidence/${evidenceId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ note })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to approve evidence')
  }
  return res.json()
}

export async function rejectEvidence(token: string, evidenceId: string, note?: string): Promise<EvidenceQueueItem> {
  const res = await fetch(`${API_BASE}/evidence/${evidenceId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ note })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to reject evidence')
  }
  return res.json()
}

export async function getReauditQueue(token: string): Promise<ReauditQueueItem[]> {
  const res = await fetch(`${API_BASE}/audits/reaudit-queue`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    throw new Error('Failed to fetch reaudit queue')
  }
  return res.json()
}

