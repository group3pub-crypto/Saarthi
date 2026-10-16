import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createDefaultProfile,
  createProfile,
  deriveNeedCodes,
  informationalPresets,
  normalizeProfile,
  normalizeThresholds,
  parseImportedProfile,
  serializeProfile,
  thresholdPreferences
} from '../../src/services/profile.ts'

test('default profile is not a saved choice', () => {
  const p = createDefaultProfile()
  assert.equal(p.savedByUser, false)
  assert.deepEqual(p.activeNeedCodes, ['wheelchair'])
})

test('presets map to need codes the server evaluates, combined without duplicates', () => {
  assert.deepEqual(deriveNeedCodes(['wheelchair', 'elderly', 'caregiver'], {}), ['wheelchair', 'step_free', 'low_stamina'])
  assert.deepEqual(deriveNeedCodes(['low_vision'], {}), ['tactile', 'audio_assisted'])
})

test('cognitive preset is informational and produces no evaluable need', () => {
  assert.deepEqual(deriveNeedCodes(['cognitive'], {}), [])
  assert.deepEqual(informationalPresets(['cognitive', 'wheelchair']), ['cognitive'])
})

test('toggles add their need codes', () => {
  assert.deepEqual(deriveNeedCodes([], { requireTactile: true, requireAudioSignal: true, requireLift: true }), [
    'tactile',
    'audio_assisted',
    'step_free'
  ])
})

test('thresholds equal to the standard are dropped; others are clamped', () => {
  assert.deepEqual(normalizeThresholds({ maxRampSlopePct: 8, minDoorWidthCm: 90 }), {})
  assert.deepEqual(normalizeThresholds({ maxRampSlopePct: 99, minDoorWidthCm: 10 }), { maxRampSlopePct: 15, minDoorWidthCm: 70 })
  assert.deepEqual(normalizeThresholds({ maxKerbHeightCm: 3 }), { maxKerbHeightCm: 3 })
  assert.deepEqual(normalizeThresholds({ maxRampSlopePct: 'x', minDoorWidthCm: NaN }), {})
})

test('only changed numbers are sent to the server', () => {
  assert.deepEqual(thresholdPreferences({}), {})
  assert.deepEqual(thresholdPreferences({ maxRampSlopePct: 6, maxKerbHeightCm: 4 }), {
    max_ramp_slope_pct: 6,
    max_kerb_height_cm: 4
  })
})

test('version 1 default is migrated as not saved, with the hidden requireLift default removed', () => {
  const v1 = {
    id: 'current_user_profile',
    presets: ['wheelchair'],
    customThresholds: { maxRampSlopePct: 8, minDoorWidthCm: 90, maxStepCount: 0, requireLift: true },
    activeNeedCodes: ['step_free'],
    updatedAt: '2025-01-01T00:00:00Z'
  }
  const p = normalizeProfile(v1)
  assert.equal(p.savedByUser, false)
  assert.equal(p.customThresholds.requireLift, undefined)
  assert.deepEqual(p.activeNeedCodes, ['wheelchair'])
})

test('version 1 profile the person changed counts as saved', () => {
  const p = normalizeProfile({ presets: ['hearing'], customThresholds: {} })
  assert.equal(p.savedByUser, true)
  assert.deepEqual(p.activeNeedCodes, ['hearing'])
})

test('garbage storage falls back to the default', () => {
  assert.equal(normalizeProfile(null).savedByUser, false)
  assert.equal(normalizeProfile('x').presets[0], 'wheelchair')
})

test('export then import round-trips choices', () => {
  const original = createProfile(['wheelchair', 'low_stamina'], { maxRampSlopePct: 6, requireTactile: true }, true)
  const result = parseImportedProfile(serializeProfile(original))
  assert.ok(result.ok)
  if (result.ok) {
    assert.deepEqual(result.profile.presets, original.presets)
    assert.deepEqual(result.profile.customThresholds, original.customThresholds)
    assert.equal(result.profile.savedByUser, true)
  }
})

test('import rejects bad input and skips unknown needs', () => {
  assert.equal(parseImportedProfile('not json').ok, false)
  assert.equal(parseImportedProfile('{"hello":1}').ok, false)
  assert.equal(parseImportedProfile('x'.repeat(30000)).ok, false)
  const r = parseImportedProfile('{"presets":["wheelchair","bogus"],"customThresholds":{}}')
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.profile.presets, ['wheelchair'])
    assert.equal(r.warnings.length, 1)
  }
})
