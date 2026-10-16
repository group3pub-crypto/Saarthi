// Turns the server's requirement rows into plain sentences. Pure: no React or network.

export interface RequirementLike {
  need_code: string
  feature_type: string
  attribute_key: string
  operator: string
  threshold?: unknown
  standard_threshold?: unknown
  critical?: boolean
  custom?: boolean
}

export const NEED_LABELS: Record<string, string> = {
  step_free: 'Step-free access',
  wheelchair: 'Wheelchair access',
  tactile: 'Tactile guidance',
  audio_assisted: 'Audio assistance',
  hearing: 'Hearing support',
  low_stamina: 'Low stamina',
  custom_threshold: 'Your own limits'
}

const FEATURE_LABELS: Record<string, string> = {
  entrance: 'Entrance',
  ramp: 'Ramp',
  lift: 'Lift',
  toilet: 'Accessible toilet',
  kerb: 'Kerb',
  crossing: 'Crossing',
  stairs: 'Stairs',
  footpath: 'Footpath',
  tactile_path: 'Tactile path',
  seating: 'Seating'
}

const UNITS: Record<string, string> = {
  door_width_cm: 'cm',
  slope_pct: '%',
  kerb_height_cm: 'cm',
  width_cm: 'cm',
  step_count: 'steps'
}

function titleCase(key: string): string {
  const text = key.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function needLabel(code: string): string {
  return NEED_LABELS[code] ?? titleCase(code)
}

export function featureLabel(type: string): string {
  return FEATURE_LABELS[type] ?? titleCase(type)
}

function formatThreshold(attribute: string, value: unknown): string {
  const unit = UNITS[attribute]
  if (typeof value === 'number') return unit ? `${value} ${unit}` : String(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (value === null || value === undefined) return ''
  return String(value)
}

/** e.g. "Ramp: slope at most 8 %". */
export function describeRequirement(req: RequirementLike): string {
  const subject = `${featureLabel(req.feature_type)}: ${req.attribute_key.replace(/_(cm|pct)$/, '').replace(/_/g, ' ')}`
  const value = formatThreshold(req.attribute_key, req.threshold)

  switch (req.operator) {
    case 'gte':
      return `${subject} at least ${value}`
    case 'lte':
      return `${subject} at most ${value}`
    case 'eq':
      return typeof req.threshold === 'boolean'
        ? `${subject}: ${req.threshold ? 'present' : 'absent'}`
        : `${subject} equal to ${value}`
    case 'in':
      return `${subject} one of ${value}`
    default:
      return `${subject} ${req.operator} ${value}`.trim()
  }
}

/** True when this row differs from the published standard because the person asked for it. */
export function isCustomised(req: RequirementLike): boolean {
  return req.custom === true
}

export interface RequirementGroup {
  needCode: string
  label: string
  rows: Array<{ text: string; customised: boolean; standard: string | null }>
}

/** Group by need so a person sees "Wheelchair access → these rules". */
export function groupRequirements(reqs: readonly RequirementLike[]): RequirementGroup[] {
  const groups = new Map<string, RequirementGroup>()
  for (const req of reqs) {
    let group = groups.get(req.need_code)
    if (!group) {
      group = { needCode: req.need_code, label: needLabel(req.need_code), rows: [] }
      groups.set(req.need_code, group)
    }
    const customised = isCustomised(req)
    const standard =
      customised && req.standard_threshold !== null && req.standard_threshold !== undefined
        ? formatThreshold(req.attribute_key, req.standard_threshold)
        : null
    group.rows.push({ text: describeRequirement(req), customised, standard })
  }
  return Array.from(groups.values())
}

const IGNORED_LABELS: Record<string, string> = {
  min_door_width_cm: 'minimum door width',
  max_ramp_slope_pct: 'maximum ramp slope',
  max_kerb_height_cm: 'maximum kerb height'
}

/** Thresholds the server could not apply, in words. */
export function describeIgnoredThresholds(keys: readonly string[]): string[] {
  return keys.map(k => IGNORED_LABELS[k] ?? k.replace(/_/g, ' '))
}
