import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeAge, describeMissingInformation, describeFreshness } from '../../src/services/evidence.ts'
import { normalizeAction, normalizeJourneyPlan, normalizePlace, normalizeReadinessCard } from '../../src/services/normalize.ts'
import { describeRequirement, groupRequirements } from '../../src/services/requirements.ts'

const now = new Date('2026-10-16T12:00:00Z')

test('age wording', () => {
  assert.equal(describeAge('2026-10-16T01:00:00Z', now), 'today')
  assert.equal(describeAge('2026-10-13T12:00:00Z', now), '3 days ago')
  assert.equal(describeAge('2026-06-16T12:00:00Z', now), '4 months ago')
  assert.equal(describeAge(null, now), null)
  assert.equal(describeAge('garbage', now), null)
})

test('missing information is stated, never hidden', () => {
  const none = describeMissingInformation({ state: 'unknown', feature_count: 0, features_with_current_evidence: 0, expired_count: 0, barrier_count: 0 })
  assert.match(none[0].text, /No features/)
  const partial = describeMissingInformation({ state: 'verified', feature_count: 4, features_with_current_evidence: 1, expired_count: 2, barrier_count: 0 })
  assert.equal(partial.length, 2)
  assert.deepEqual(describeMissingInformation({ state: 'verified', feature_count: 2, features_with_current_evidence: 2, expired_count: 0, barrier_count: 0 }), [])
  assert.equal(describeMissingInformation(undefined).length, 1)
  assert.equal(describeFreshness({ state: 'unknown', feature_count: 1, features_with_current_evidence: 0, expired_count: 0, barrier_count: 0, last_observed_at: null }, now), 'Never audited')
})

test('action adapter reads wire format', () => {
  const a = normalizeAction({ action_type: 'call_helpdesk', title: 'Call', detail: 'Ring them', payload: { phone: '020 1' } })
  assert.equal(a.details, 'Ring them')
  assert.equal(a.phone, '020 1')
  assert.equal(normalizeAction({ action_type: 'x', title: 'y', payload: { script: 'hi' } }).script, 'hi')
})

test('unknown statuses never become accessible', () => {
  const card = normalizeReadinessCard({ features: [{ feature_name: 'Main door', status: 'surprise' }], overall_status: 'weird' })
  assert.equal(card.features[0].name, 'Main door')
  assert.equal(card.features[0].status, 'unknown')
  assert.equal(card.overall_status, 'not_confirmed')
})

test('journey adapter keeps applicability and route kind', () => {
  const plan = normalizeJourneyPlan({
    overall_status: 'confirmed',
    steps: [{ step_id: 'a', applicable: false, status: 'unknown' }],
    route_geometry: { coordinates: [[1, 2]] }
  })
  assert.equal(plan.steps[0].applicable, false)
  assert.equal(plan.route_kind, 'straight_line')
})

test('place adapter drops an invalid evidence summary', () => {
  assert.equal(normalizePlace({ id: '1', evidence: { state: 'accessible' } }).evidence, undefined)
  assert.equal(normalizePlace({ id: '1', evidence: { state: 'verified', feature_count: 2 } }).evidence?.feature_count, 2)
})

test('requirement wording and grouping', () => {
  const ramp = { need_code: 'wheelchair', feature_type: 'ramp', attribute_key: 'slope_pct', operator: 'lte', threshold: 6, standard_threshold: 8, custom: true }
  assert.equal(describeRequirement(ramp), 'Ramp: slope at most 6 %')
  const groups = groupRequirements([ramp])
  assert.equal(groups[0].label, 'Wheelchair access')
  assert.equal(groups[0].rows[0].customised, true)
  assert.equal(groups[0].rows[0].standard, '8 %')
})

import { buildShareSummary, countSteps, splitSteps } from '../../src/services/passport.ts'

test('passport counts ignore steps with no applicable requirement', () => {
  const plan = normalizeJourneyPlan({
    overall_status: 'not_confirmed',
    summary_text: 'Journey NOT CONFIRMED',
    limits_notice: 'Decision support only.',
    active_needs: ['wheelchair'],
    steps: [
      { step_id: '1', feature_type: 'entrance', description: 'Main door', status: 'verified', is_critical: true },
      { step_id: '2', feature_type: 'kerb', description: 'Kerb at gate', status: 'unknown', is_critical: true },
      { step_id: '3', feature_type: 'toilet', description: 'Toilet', status: 'unknown', applicable: false }
    ]
  })
  const counts = countSteps(plan.steps)
  assert.equal(counts.applicable, 2)
  assert.equal(counts.notApplicable, 1)
  assert.equal(counts.unknown, 1)
  const groups = splitSteps(plan.steps)
  assert.equal(groups.route.length, 1)
  assert.equal(groups.destination.length, 2)
  const text = buildShareSummary(plan, now)
  assert.match(text, /NOT confirmed/)
  assert.match(text, /1 of 2 applicable steps/)
  assert.match(text, /Kerb at gate: Unknown/)
  assert.doesNotMatch(text, /Toilet/)
})

import { parsePassportFile, serializePassport } from '../../src/services/passport.ts'

test('passport file round-trips and rejects other files', () => {
  const plan = normalizeJourneyPlan({ destination_name: 'Sassoon', overall_status: 'not_confirmed', steps: [] })
  const back = parsePassportFile(serializePassport(plan))
  assert.ok(back.ok)
  if (back.ok) assert.equal(back.plan.destination_name, 'Sassoon')
  assert.equal(parsePassportFile('{"a":1}').ok, false)
  assert.equal(parsePassportFile('nope').ok, false)
})
