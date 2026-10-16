// Pure access-profile logic: no React, no storage, no network.
// Kept free of external imports so it can be unit-tested directly with Node
// (modules in this folder import each other with explicit .ts extensions for that reason).

export const PROFILE_ID = 'current_user_profile'
export const PROFILE_VERSION = 2

export const PRESET_KEYS = [
  'wheelchair',
  'low_vision',
  'hearing',
  'cognitive',
  'elderly',
  'pregnant',
  'low_stamina',
  'caregiver'
] as const

export type PresetKey = (typeof PRESET_KEYS)[number]

/** Need codes the server has evaluation rules for (see scripts/seed_base_definitions.py). */
export const PRESET_NEED_CODES: Record<PresetKey, string[]> = {
  wheelchair: ['wheelchair'],
  low_vision: ['tactile', 'audio_assisted'],
  hearing: ['hearing'],
  // Support needs without a measurable physical rule: shown to the person, never "evaluated".
  cognitive: [],
  elderly: ['step_free', 'low_stamina'],
  pregnant: ['step_free', 'low_stamina'],
  low_stamina: ['low_stamina'],
  caregiver: ['step_free']
}

/** The published values used when a person has not set their own. */
export const STANDARD_THRESHOLDS = {
  maxRampSlopePct: 8,
  minDoorWidthCm: 90
} as const

/** Ranges offered in the UI (the server accepts wider ones). */
export const THRESHOLD_LIMITS = {
  maxRampSlopePct: { min: 4, max: 15, step: 0.5, unit: '%' },
  minDoorWidthCm: { min: 70, max: 120, step: 1, unit: 'cm' },
  maxKerbHeightCm: { min: 0, max: 15, step: 0.5, unit: 'cm' }
} as const

export interface CustomThresholds {
  /** undefined = use the published value (8 %). */
  maxRampSlopePct?: number
  /** undefined = use the published value (90 cm). */
  minDoorWidthCm?: number
  /** undefined = kerb height is not part of the evaluation. */
  maxKerbHeightCm?: number
  /** 0 = step-free entrances only. */
  maxStepCount?: number
  requireLift?: boolean
  requireTactile?: boolean
  requireAudioSignal?: boolean
}

export interface AccessProfile {
  id: string
  version: number
  presets: string[]
  customThresholds: CustomThresholds
  activeNeedCodes: string[]
  updatedAt: string
  /** False until the person saves once: the starting profile is a default, not their choice. */
  savedByUser: boolean
}

/** The only profile-derived data that is ever sent to the server: plain numbers. */
export interface ThresholdPreferences {
  min_door_width_cm?: number
  max_ramp_slope_pct?: number
  max_kerb_height_cm?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, step: number): number {
  const inverse = 1 / step
  return Math.round(value * inverse) / inverse
}

export function isPresetKey(value: unknown): value is PresetKey {
  return typeof value === 'string' && (PRESET_KEYS as readonly string[]).includes(value)
}

export function deriveNeedCodes(presets: readonly string[], thresholds: CustomThresholds): string[] {
  const codes: string[] = []
  const add = (code: string) => {
    if (!codes.includes(code)) codes.push(code)
  }

  for (const preset of presets) {
    if (isPresetKey(preset)) PRESET_NEED_CODES[preset].forEach(add)
  }
  if (thresholds.requireTactile) add('tactile')
  if (thresholds.requireAudioSignal) add('audio_assisted')
  if (thresholds.requireLift || thresholds.maxStepCount === 0) add('step_free')
  return codes
}

/**
 * Keep only values that differ from the published standard, clamped to the supported range.
 * Thresholds equal to the standard are dropped so they never act as a hidden custom requirement.
 */
export function normalizeThresholds(raw: unknown, version = PROFILE_VERSION): CustomThresholds {
  const out: CustomThresholds = {}
  if (!isRecord(raw)) return out

  const ramp = THRESHOLD_LIMITS.maxRampSlopePct
  if (isFiniteNumber(raw.maxRampSlopePct)) {
    const value = round(clamp(raw.maxRampSlopePct, ramp.min, ramp.max), ramp.step)
    if (value !== STANDARD_THRESHOLDS.maxRampSlopePct) out.maxRampSlopePct = value
  }

  const door = THRESHOLD_LIMITS.minDoorWidthCm
  if (isFiniteNumber(raw.minDoorWidthCm)) {
    const value = round(clamp(raw.minDoorWidthCm, door.min, door.max), door.step)
    if (value !== STANDARD_THRESHOLDS.minDoorWidthCm) out.minDoorWidthCm = value
  }

  const kerb = THRESHOLD_LIMITS.maxKerbHeightCm
  if (isFiniteNumber(raw.maxKerbHeightCm)) {
    out.maxKerbHeightCm = round(clamp(raw.maxKerbHeightCm, kerb.min, kerb.max), kerb.step)
  }

  // Version 1 also stored maxStepCount 0 as an always-on default, so it only counts from version 2.
  if (version >= 2 && raw.maxStepCount === 0) out.maxStepCount = 0
  if (raw.requireTactile === true) out.requireTactile = true
  if (raw.requireAudioSignal === true) out.requireAudioSignal = true
  // Profiles before version 2 stored "require lift" as an always-on default that had no effect of its own.
  if (version >= 2 && raw.requireLift === true) out.requireLift = true

  return out
}

export function createProfile(presets: string[], thresholds: CustomThresholds, savedByUser: boolean): AccessProfile {
  const cleanPresets = Array.from(new Set(presets.filter(isPresetKey)))
  const cleanThresholds = normalizeThresholds(thresholds)
  return {
    id: PROFILE_ID,
    version: PROFILE_VERSION,
    presets: cleanPresets,
    customThresholds: cleanThresholds,
    activeNeedCodes: deriveNeedCodes(cleanPresets, cleanThresholds),
    updatedAt: new Date().toISOString(),
    savedByUser
  }
}

/** The starting point for someone who has not chosen anything yet. */
export function createDefaultProfile(): AccessProfile {
  return createProfile(['wheelchair'], {}, false)
}

/** Read whatever is in storage (any version) into a valid current profile. */
export function normalizeProfile(raw: unknown): AccessProfile {
  if (!isRecord(raw)) return createDefaultProfile()

  const version = isFiniteNumber(raw.version) ? raw.version : 1
  const presets = Array.isArray(raw.presets) ? raw.presets.filter(isPresetKey) : []
  const thresholds = normalizeThresholds(raw.customThresholds, version)
  const profile = createProfile(presets, thresholds, false)

  if (isFiniteNumber(raw.version) && version >= 2) {
    profile.savedByUser = raw.savedByUser === true
  } else {
    // Version 1 saved the default automatically, so only a changed profile counts as a choice.
    const isStartingDefault =
      presets.length === 1 && presets[0] === 'wheelchair' && Object.keys(thresholds).length === 0
    profile.savedByUser = !isStartingDefault
  }
  if (typeof raw.updatedAt === 'string') profile.updatedAt = raw.updatedAt
  return profile
}

/** Numbers to send for evaluation: only values the person changed, never the profile itself. */
export function thresholdPreferences(thresholds: CustomThresholds): ThresholdPreferences {
  const prefs: ThresholdPreferences = {}
  if (isFiniteNumber(thresholds.minDoorWidthCm)) prefs.min_door_width_cm = thresholds.minDoorWidthCm
  if (isFiniteNumber(thresholds.maxRampSlopePct)) prefs.max_ramp_slope_pct = thresholds.maxRampSlopePct
  if (isFiniteNumber(thresholds.maxKerbHeightCm)) prefs.max_kerb_height_cm = thresholds.maxKerbHeightCm
  return prefs
}

export function hasEvaluableNeeds(profile: Pick<AccessProfile, 'activeNeedCodes'>): boolean {
  return profile.activeNeedCodes.length > 0 || false
}

/** Presets that have no measurable rule yet, so they cannot be evaluated. */
export function informationalPresets(presets: readonly string[]): string[] {
  return presets.filter(p => isPresetKey(p) && PRESET_NEED_CODES[p].length === 0)
}

export interface ThresholdLine {
  key: 'minDoorWidthCm' | 'maxRampSlopePct' | 'maxKerbHeightCm'
  value: number
  unit: string
}

/** Thresholds the person changed, for display. */
export function customThresholdLines(thresholds: CustomThresholds): ThresholdLine[] {
  const lines: ThresholdLine[] = []
  if (isFiniteNumber(thresholds.minDoorWidthCm)) lines.push({ key: 'minDoorWidthCm', value: thresholds.minDoorWidthCm, unit: 'cm' })
  if (isFiniteNumber(thresholds.maxRampSlopePct)) lines.push({ key: 'maxRampSlopePct', value: thresholds.maxRampSlopePct, unit: '%' })
  if (isFiniteNumber(thresholds.maxKerbHeightCm)) lines.push({ key: 'maxKerbHeightCm', value: thresholds.maxKerbHeightCm, unit: 'cm' })
  return lines
}

export function profilesEqual(a: AccessProfile, b: AccessProfile): boolean {
  return (
    JSON.stringify([a.presets, a.customThresholds]) === JSON.stringify([b.presets, b.customThresholds])
  )
}

/** What is written to the exported file: the choices only, derived data is recomputed on import. */
export function serializeProfile(profile: AccessProfile): string {
  return JSON.stringify(
    {
      app: 'SAARTHI Access',
      kind: 'access-profile',
      version: PROFILE_VERSION,
      exportedAt: new Date().toISOString(),
      presets: profile.presets,
      customThresholds: profile.customThresholds
    },
    null,
    2
  )
}

const MAX_IMPORT_CHARS = 20_000

export type ImportResult =
  | { ok: true; profile: AccessProfile; warnings: string[] }
  | { ok: false; error: string }

/** Validate and read an exported profile file. Unknown content is ignored, never trusted. */
export function parseImportedProfile(text: string): ImportResult {
  if (text.length > MAX_IMPORT_CHARS) {
    return { ok: false, error: 'This file is too large to be a SAARTHI profile.' }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }

  if (!isRecord(raw) || (!Array.isArray(raw.presets) && !isRecord(raw.customThresholds))) {
    return { ok: false, error: 'This file does not look like a SAARTHI access profile.' }
  }

  const warnings: string[] = []
  const presets = Array.isArray(raw.presets) ? raw.presets : []
  const unknown = presets.filter(p => !isPresetKey(p))
  if (unknown.length > 0) warnings.push(`${unknown.length} unrecognised need(s) were skipped.`)

  const version = isFiniteNumber(raw.version) ? raw.version : PROFILE_VERSION
  const thresholds = normalizeThresholds(raw.customThresholds, version)
  const profile = createProfile(presets.filter(isPresetKey), thresholds, true)
  return { ok: true, profile, warnings }
}
