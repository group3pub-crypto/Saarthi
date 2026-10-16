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
  overall_status?: string
}

export interface ReadinessCardResponse {
  place_id: string
  name: string
  place_type: string
  address: string
  phone?: string
  latitude: number
  longitude: number
  overall_status: 'confirmed' | 'not_confirmed'
  confidence_score: number
  summary_text: string
  features: Array<{
    feature_id: string
    feature_type: string
    name: string
    status: 'verified' | 'reported' | 'temporary_barrier' | 'barrier' | 'unknown'
    label?: string
    source?: string
    observed_at?: string
    age_days?: number
    expires_at?: string
    reason: string
    limits: string
    next_actions: Array<{
      action_type: string
      title: string
      details: string
      phone?: string
    }>
  }>
}

export interface JourneyPlanResponse {
  destination_name: string
  destination_address: string
  destination_phone?: string
  total_distance_m: number
  overall_status: 'confirmed' | 'not_confirmed'
  confidence_score: number
  summary_text: string
  limits_notice: string
  active_needs: string[]
  route_geometry: {
    type: string
    coordinates: number[][]
  }
  steps: Array<{
    step_id: string
    feature_id: string
    feature_type: string
    description: string
    floor_level: number
    is_critical: boolean
    status: 'verified' | 'reported' | 'temporary_barrier' | 'barrier' | 'unknown'
    label?: string
    source?: string
    observed_at?: string
    age_days?: number
    expires_at?: string
    reason: string
    next_actions: Array<{
      action_type: string
      title: string
      details: string
      phone?: string
    }>
  }>
  next_actions: Array<{
    action_type: string
    title: string
    details: string
    phone?: string
  }>
}

const API_BASE = '/api/v1'

export async function searchPlaces(params: {
  q?: string
  type?: string
  near?: string
  limit?: number
}): Promise<PlaceSummary[]> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.type) query.set('type', params.type)
  if (params.near) query.set('near', params.near)
  if (params.limit) query.set('limit', String(params.limit))

  const res = await fetch(`${API_BASE}/places?${query.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to search places: ${res.statusText}`)
  }
  return res.json()
}

export async function getPlaceReadinessCard(placeId: string, needs: string[]): Promise<ReadinessCardResponse> {
  const needsParam = needs.join(',') || 'step_free'
  const res = await fetch(`${API_BASE}/places/${placeId}/readiness-card?needs=${encodeURIComponent(needsParam)}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch readiness card: ${res.statusText}`)
  }
  return res.json()
}

export async function planJourney(payload: {
  origin: { latitude: number; longitude: number }
  destination_place_id: string
  needs: string[]
}): Promise<JourneyPlanResponse> {
  const res = await fetch(`${API_BASE}/journeys/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Failed to plan journey: ${res.statusText}`)
  }
  return res.json()
}

export async function submitUserReport(formData: FormData): Promise<{ report_id: string; message: string }> {
  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to submit report: ${res.statusText}`)
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

