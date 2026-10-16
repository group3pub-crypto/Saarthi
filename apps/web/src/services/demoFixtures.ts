// DEMO MODE ONLY. These are invented sample records for Pune, used purely so the UI can be
// demonstrated with a realistic, populated map before a real deployment has its own data.
// They are kept in this one file, isolated from services/api.ts's real network calls, and are
// only ever read when services/demoMode.ts reports demo mode on (which in turn can only happen
// in a dev build or one explicitly built with VITE_ENABLE_DEMO_MODE=true). Every screen that
// shows them also shows a persistent "Demo mode" banner. None of this is real evidence, and
// none of it is ever merged with results from the real API.

import type { JourneyPlanResponse, PlaceSummary, ReadinessCardResponse, Requirement, RequirementsResponse } from './normalize.ts'

const now = () => new Date()
const daysAgo = (n: number) => new Date(now().getTime() - n * 86_400_000).toISOString()
const daysFromNow = (n: number) => new Date(now().getTime() + n * 86_400_000).toISOString()

interface DemoPlace extends PlaceSummary {}

/** Ten sample places across the categories the spec asks for, with deliberately varied evidence states. */
export const DEMO_PLACES: DemoPlace[] = [
  {
    id: 'demo-ssh-hospital',
    name: 'Sassoon General Hospital',
    type: 'hospital',
    address: 'Sassoon Rd, Pune, Maharashtra 411001',
    department: 'Public Health Department',
    phone: '020-2612-8000',
    hours: '24 hours',
    latitude: 18.5236,
    longitude: 73.8737,
    evidence: {
      state: 'verified',
      feature_count: 6,
      features_with_current_evidence: 6,
      current_observation_count: 6,
      verified_count: 5,
      reported_count: 1,
      barrier_count: 0,
      expired_count: 0,
      last_observed_at: daysAgo(12),
      next_expiry_at: daysFromNow(170)
    }
  },
  {
    id: 'demo-sancheti-hospital',
    name: 'Sancheti Hospital',
    type: 'hospital',
    address: '16, Shivajinagar, Pune, Maharashtra 411005',
    phone: '020-6728-6000',
    hours: '24 hours',
    latitude: 18.5304,
    longitude: 73.8513,
    evidence: {
      state: 'known_barrier',
      feature_count: 7,
      features_with_current_evidence: 5,
      current_observation_count: 5,
      verified_count: 3,
      reported_count: 1,
      barrier_count: 1,
      expired_count: 1,
      last_observed_at: daysAgo(40),
      next_expiry_at: daysFromNow(60)
    }
  },
  {
    id: 'demo-pmc-main-office',
    name: 'Pune Municipal Corporation - Main Office',
    type: 'municipal_office',
    address: 'Shivajinagar, Pune, Maharashtra 411005',
    department: 'Pune Municipal Corporation',
    hours: 'Mon-Sat 10:00-17:45',
    latitude: 18.5286,
    longitude: 73.8747,
    evidence: {
      state: 'reported',
      feature_count: 5,
      features_with_current_evidence: 2,
      current_observation_count: 2,
      verified_count: 0,
      reported_count: 2,
      barrier_count: 0,
      expired_count: 0,
      last_observed_at: daysAgo(55),
      next_expiry_at: daysFromNow(130)
    }
  },
  {
    id: 'demo-aadhaar-camp-kothrud',
    name: 'Aadhaar Seva Kendra, Kothrud',
    type: 'aadhaar_centre',
    address: 'Kothrud Depot Rd, Kothrud, Pune 411038',
    hours: 'Mon-Fri 09:30-17:00',
    latitude: 18.5074,
    longitude: 73.8077,
    evidence: {
      state: 'unknown',
      feature_count: 0,
      features_with_current_evidence: 0,
      current_observation_count: 0,
      verified_count: 0,
      reported_count: 0,
      barrier_count: 0,
      expired_count: 0,
      last_observed_at: null,
      next_expiry_at: null
    }
  },
  {
    id: 'demo-district-court',
    name: 'Pune District and Sessions Court',
    type: 'court',
    address: '2, Shivajinagar, Pune, Maharashtra 411005',
    department: 'Maharashtra Judiciary',
    hours: 'Mon-Fri 11:00-17:00',
    latitude: 18.5309,
    longitude: 73.8559,
    evidence: {
      state: 'verified',
      feature_count: 8,
      features_with_current_evidence: 7,
      current_observation_count: 7,
      verified_count: 6,
      reported_count: 1,
      barrier_count: 0,
      expired_count: 1,
      last_observed_at: daysAgo(28),
      next_expiry_at: daysFromNow(150)
    }
  },
  {
    id: 'demo-swargate-bus-stand',
    name: 'Swargate PMPML Bus Stand',
    type: 'bus_stop',
    address: 'Swargate, Pune, Maharashtra 411042',
    hours: '24 hours',
    latitude: 18.5008,
    longitude: 73.8578,
    evidence: {
      state: 'reported',
      feature_count: 4,
      features_with_current_evidence: 3,
      current_observation_count: 3,
      verified_count: 1,
      reported_count: 2,
      barrier_count: 0,
      expired_count: 0,
      last_observed_at: daysAgo(6),
      next_expiry_at: daysFromNow(180)
    }
  },
  {
    id: 'demo-shivajinagar-busstop',
    name: 'Shivajinagar Bus Stop (Platform 2)',
    type: 'bus_stop',
    address: 'Senapati Bapat Rd, Shivajinagar, Pune 411005',
    hours: '24 hours',
    latitude: 18.5319,
    longitude: 73.8486,
    evidence: {
      state: 'known_barrier',
      feature_count: 3,
      features_with_current_evidence: 2,
      current_observation_count: 2,
      verified_count: 0,
      reported_count: 1,
      barrier_count: 1,
      expired_count: 0,
      last_observed_at: daysAgo(3),
      next_expiry_at: daysFromNow(177)
    }
  },
  {
    id: 'demo-pune-junction',
    name: 'Pune Railway Junction',
    type: 'transport_hub',
    address: 'Station Rd, Pune, Maharashtra 411001',
    hours: '24 hours',
    latitude: 18.5284,
    longitude: 73.8744,
    evidence: {
      state: 'verified',
      feature_count: 10,
      features_with_current_evidence: 9,
      current_observation_count: 9,
      verified_count: 8,
      reported_count: 1,
      barrier_count: 0,
      expired_count: 1,
      last_observed_at: daysAgo(9),
      next_expiry_at: daysFromNow(171)
    }
  },
  {
    id: 'demo-ration-shop-camp',
    name: 'Fair Price Shop, Camp Ward',
    type: 'ration_centre',
    address: 'East St, Camp, Pune 411001',
    hours: 'Mon-Sat 10:00-18:00',
    latitude: 18.5122,
    longitude: 73.8793,
    evidence: {
      state: 'unknown',
      feature_count: 2,
      features_with_current_evidence: 0,
      current_observation_count: 0,
      verified_count: 0,
      reported_count: 0,
      barrier_count: 0,
      expired_count: 2,
      last_observed_at: daysAgo(400),
      next_expiry_at: null
    }
  },
  {
    id: 'demo-hinjewadi-office',
    name: 'Passport Seva Kendra, Chinchwad',
    type: 'municipal_office',
    department: 'Ministry of External Affairs',
    address: 'Thermax Chowk, Chinchwad, Pune 411019',
    hours: 'Mon-Sat 09:00-17:00',
    latitude: 18.6482,
    longitude: 73.7725,
    evidence: {
      state: 'reported',
      feature_count: 6,
      features_with_current_evidence: 4,
      current_observation_count: 4,
      verified_count: 1,
      reported_count: 3,
      barrier_count: 0,
      expired_count: 2,
      last_observed_at: daysAgo(65),
      next_expiry_at: daysFromNow(115)
    }
  }
]

function featureRow(
  id: string,
  type: string,
  name: string,
  status: ReadinessCardResponse['features'][number]['status'],
  applicable: boolean,
  observedDaysAgo: number | null,
  reason: string
): ReadinessCardResponse['features'][number] {
  return {
    feature_id: id,
    feature_type: type,
    name,
    floor_level: 0,
    status,
    applicable,
    label: status === 'verified' ? 'Confirmed on site' : status === 'reported' ? 'Reported, not yet verified' : status === 'barrier' ? 'Known barrier' : undefined,
    source: status === 'unknown' ? undefined : status === 'verified' ? 'auditor' : 'public_report',
    observed_at: observedDaysAgo === null ? undefined : daysAgo(observedDaysAgo),
    age_days: observedDaysAgo ?? undefined,
    expires_at: observedDaysAgo === null ? undefined : daysFromNow(180 - observedDaysAgo),
    reason,
    next_actions: []
  }
}

const DEMO_REQUIREMENTS: Requirement[] = [
  { need_code: 'wheelchair', feature_type: 'ramp', attribute_key: 'slope_pct', operator: 'lte', threshold: 8, standard_threshold: 8, critical: true, custom: false },
  { need_code: 'wheelchair', feature_type: 'entrance', attribute_key: 'door_width_cm', operator: 'gte', threshold: 90, standard_threshold: 90, critical: true, custom: false },
  { need_code: 'step_free', feature_type: 'kerb', attribute_key: 'kerb_height_cm', operator: 'lte', threshold: 2.5, standard_threshold: 2.5, critical: false, custom: false }
]

/** Keyed by DEMO_PLACES id. Deliberately ignores the needs/thresholds actually requested — demo cards are canned. */
export const DEMO_READINESS_CARDS: Record<string, ReadinessCardResponse> = {
  'demo-ssh-hospital': {
    place_id: 'demo-ssh-hospital',
    name: 'Sassoon General Hospital',
    place_type: 'hospital',
    address: 'Sassoon Rd, Pune, Maharashtra 411001',
    phone: '020-2612-8000',
    latitude: 18.5236,
    longitude: 73.8737,
    overall_status: 'confirmed',
    confidence_score: 0.92,
    summary_text: 'Confirmed: the main entrance, ramp and an accessible toilet were verified by an auditor within the last 90 days.',
    limits_notice: '',
    active_needs: ['wheelchair'],
    evaluated_at: daysAgo(12),
    requirements: DEMO_REQUIREMENTS,
    unevaluated_needs: [],
    ignored_thresholds: [],
    features: [
      featureRow('demo-f1', 'ramp', 'Main entrance ramp', 'verified', true, 12, 'Ramp slope measured at 6%, within your limit of 8%.'),
      featureRow('demo-f2', 'entrance', 'Main entrance door', 'verified', true, 12, 'Door width measured at 102 cm, at or above the 90 cm limit.'),
      featureRow('demo-f3', 'lift', 'Ward block lift', 'verified', true, 20, 'Lift present and operational at last check.'),
      featureRow('demo-f4', 'toilet', 'Ground floor accessible toilet', 'reported', true, 35, 'Reported accessible by a visitor; not yet confirmed by an auditor.'),
      featureRow('demo-f5', 'kerb', 'Drop-off kerb', 'verified', false, 12, 'No rule for your selected needs applies to this feature.'),
      featureRow('demo-f6', 'seating', 'OPD waiting area seating', 'verified', false, 12, 'No rule for your selected needs applies to this feature.')
    ]
  },
  'demo-sancheti-hospital': {
    place_id: 'demo-sancheti-hospital',
    name: 'Sancheti Hospital',
    place_type: 'hospital',
    address: '16, Shivajinagar, Pune, Maharashtra 411005',
    phone: '020-6728-6000',
    latitude: 18.5304,
    longitude: 73.8513,
    overall_status: 'not_confirmed',
    confidence_score: 0.38,
    summary_text: 'Not confirmed: a known barrier was recorded at the main entrance ramp, and one record has expired.',
    limits_notice: '',
    active_needs: ['wheelchair'],
    evaluated_at: daysAgo(40),
    requirements: DEMO_REQUIREMENTS,
    unevaluated_needs: [],
    ignored_thresholds: [],
    features: [
      featureRow('demo-f7', 'ramp', 'Main entrance ramp', 'barrier', true, 40, 'Ramp slope measured at 14%, steeper than your 8% limit.'),
      featureRow('demo-f8', 'entrance', 'Side entrance door', 'verified', true, 40, 'Door width measured at 94 cm.'),
      featureRow('demo-f9', 'lift', 'Main block lift', 'reported', true, 10, 'Reported working by a visitor; not yet verified.'),
      featureRow('demo-f10', 'toilet', 'First floor toilet', 'unknown', true, null, 'No current evidence has been recorded for this feature.')
    ]
  }
}

const DEMO_STEP_WALK = [73.858, 18.5018]

function journeyStep(
  id: string,
  type: string,
  description: string,
  status: ReadinessCardResponse['features'][number]['status'],
  applicable: boolean,
  critical: boolean,
  observedDaysAgo: number | null,
  reason: string
): JourneyPlanResponse['steps'][number] {
  return {
    step_id: id,
    feature_id: id,
    feature_type: type,
    description,
    floor_level: 0,
    is_critical: critical,
    applicable,
    status,
    source: status === 'unknown' ? undefined : status === 'verified' ? 'auditor' : 'public_report',
    observed_at: observedDaysAgo === null ? undefined : daysAgo(observedDaysAgo),
    age_days: observedDaysAgo ?? undefined,
    expires_at: observedDaysAgo === null ? undefined : daysFromNow(180 - observedDaysAgo),
    reason,
    next_actions: []
  }
}

/** Keyed by destination place id. A straight-line demo route — no routing engine is run for demo data. */
export const DEMO_JOURNEY_PLANS: Record<string, JourneyPlanResponse> = {
  'demo-ssh-hospital': {
    destination_name: 'Sassoon General Hospital',
    destination_address: 'Sassoon Rd, Pune, Maharashtra 411001',
    destination_phone: '020-2612-8000',
    total_distance_m: 2400,
    overall_status: 'confirmed',
    confidence_score: 0.85,
    summary_text: 'Confirmed: the kerb cuts, footpath and the hospital entrance on this route have current, verified evidence.',
    limits_notice: 'This demo route is a straight line for illustration; it is not a walking direction.',
    active_needs: ['wheelchair'],
    evaluated_at: daysAgo(2),
    requirements: DEMO_REQUIREMENTS,
    unevaluated_needs: [],
    ignored_thresholds: [],
    route_kind: 'straight_line',
    route_geometry: { type: 'LineString', coordinates: [DEMO_STEP_WALK, [73.8737, 18.5236]] },
    steps: [
      journeyStep('demo-j1', 'kerb', 'Kerb cut near Swargate stand', 'verified', true, true, 14, 'Kerb height measured at 1.5 cm.'),
      journeyStep('demo-j2', 'footpath', 'Footpath along Sassoon Road', 'reported', true, false, 30, 'Reported clear and walkable by a previous traveller.'),
      journeyStep('demo-j3', 'crossing', 'Signalled crossing at Sassoon Road junction', 'verified', true, true, 14, 'Tactile paving and audible signal confirmed.'),
      journeyStep('demo-j4', 'ramp', 'Hospital main entrance ramp', 'verified', true, true, 12, 'Ramp slope measured at 6%.'),
      journeyStep('demo-j5', 'toilet', 'Ground floor accessible toilet', 'reported', true, false, 35, 'Reported accessible; not yet verified by an auditor.')
    ],
    next_actions: []
  },
  'demo-sancheti-hospital': {
    destination_name: 'Sancheti Hospital',
    destination_address: '16, Shivajinagar, Pune, Maharashtra 411005',
    destination_phone: '020-6728-6000',
    total_distance_m: 5100,
    overall_status: 'not_confirmed',
    confidence_score: 0.3,
    summary_text: 'Not confirmed: a known barrier was recorded at the hospital entrance ramp, and part of the footpath has no current evidence.',
    limits_notice: 'This demo route is a straight line for illustration; it is not a walking direction.',
    active_needs: ['wheelchair'],
    evaluated_at: daysAgo(5),
    requirements: DEMO_REQUIREMENTS,
    unevaluated_needs: [],
    ignored_thresholds: [],
    route_kind: 'straight_line',
    route_geometry: { type: 'LineString', coordinates: [DEMO_STEP_WALK, [73.8513, 18.5304]] },
    steps: [
      journeyStep('demo-j6', 'kerb', 'Kerb cut near Shivajinagar station', 'unknown', true, true, null, 'No current evidence has been recorded for this feature.'),
      journeyStep('demo-j7', 'footpath', 'Footpath along Senapati Bapat Road', 'unknown', true, false, null, 'No current evidence has been recorded for this feature.'),
      journeyStep('demo-j8', 'ramp', 'Hospital main entrance ramp', 'barrier', true, true, 40, 'Ramp slope measured at 14%, steeper than your 8% limit.')
    ],
    next_actions: []
  }
}

export const DEMO_REQUIREMENTS_RESPONSE: RequirementsResponse = {
  active_needs: ['wheelchair'],
  requirements: DEMO_REQUIREMENTS,
  unevaluated_needs: [],
  ignored_thresholds: []
}

function haversineMeters(a: PlaceSummary, lat: number, lng: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat - a.latitude)
  const dLng = toRad(lng - a.longitude)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function demoSearchPlaces(params: { q?: string; type?: string; near?: string; evidence_state?: string; fresh_days?: number; limit?: number }): PlaceSummary[] {
  let results = DEMO_PLACES.slice()
  if (params.q) {
    const q = params.q.toLowerCase()
    results = results.filter(p => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || (p.department ?? '').toLowerCase().includes(q))
  }
  if (params.type) results = results.filter(p => p.type === params.type)
  if (params.evidence_state) results = results.filter(p => p.evidence?.state === params.evidence_state)
  if (params.fresh_days) {
    const cutoff = now().getTime() - params.fresh_days * 86_400_000
    results = results.filter(p => p.evidence?.last_observed_at && Date.parse(p.evidence.last_observed_at) >= cutoff)
  }
  if (params.near) {
    const [latStr, lngStr] = params.near.split(',')
    const lat = Number(latStr)
    const lng = Number(lngStr)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      results = results
        .map(p => ({ ...p, distance_m: Math.round(haversineMeters(p, lat, lng)) }))
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
    }
  }
  return params.limit ? results.slice(0, params.limit) : results
}

export function demoGetPlace(id: string): PlaceSummary | undefined {
  return DEMO_PLACES.find(p => p.id === id)
}

export function demoGetReadinessCard(id: string): ReadinessCardResponse | undefined {
  return DEMO_READINESS_CARDS[id]
}

export function demoGetJourneyPlan(destinationId: string): JourneyPlanResponse | undefined {
  return DEMO_JOURNEY_PLANS[destinationId]
}
