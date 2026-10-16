import React from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Route as RouteIcon } from 'lucide-react'
import type { JourneyPlanResponse } from '../../services/api'
import { countSteps } from '../../services/passport'
import { describeIgnoredThresholds, needLabel } from '../../services/requirements'

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

/** Average adult walking speed (~4.5 km/h), used only to label an estimate — never shown as a measured time. */
function estimateWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 75))
}

interface RouteSummaryCardProps {
  plan: JourneyPlanResponse
}

/**
 * The single route SAARTHI's engine computes for this journey, presented the way a Maps app
 * presents a route option: distance, an estimated walking time, how much of it has current
 * evidence, and which accessibility constraints applied. SAARTHI does not offer alternate
 * routes today, so this card is intentionally singular rather than a row of invented choices.
 */
export const RouteSummaryCard: React.FC<RouteSummaryCardProps> = ({ plan }) => {
  const counts = countSteps(plan.steps)
  const confirmed = counts.verified + counts.reported
  const ignored = describeIgnoredThresholds(plan.ignored_thresholds)

  return (
    <section className="route-card" aria-label="Route">
      <div className="route-card-head">
        <span className="route-card-icon">
          <RouteIcon size={18} aria-hidden="true" />
        </span>
        <div className="route-card-stats">
          <span className="route-card-stat">
            <strong>{formatDistance(plan.total_distance_m)}</strong>
            <span className="text-muted text-sm">distance</span>
          </span>
          <span className="route-card-stat">
            <Clock3 size={14} aria-hidden="true" />
            <strong>~{estimateWalkMinutes(plan.total_distance_m)} min</strong>
            <span className="text-muted text-sm">estimated walk, not measured</span>
          </span>
          <span className="route-card-stat">
            <CheckCircle2 size={14} aria-hidden="true" />
            <strong>
              {confirmed} of {counts.applicable}
            </strong>
            <span className="text-muted text-sm">steps have current evidence</span>
          </span>
        </div>
      </div>

      <p className="text-muted text-sm">
        {plan.route_kind === 'pedestrian_network'
          ? 'This route follows mapped walking paths.'
          : 'No mapped walking path was available, so this is a straight line between the points, shown dashed. It is not a walkable direction.'}
        {' SAARTHI checks one route today; it does not yet offer alternate route options.'}
      </p>

      {(plan.active_needs.length > 0 || ignored.length > 0) && (
        <div className="route-card-constraints">
          {plan.active_needs.length > 0 && (
            <span className="text-sm">
              Checked for: {plan.active_needs.map(n => (
                <span key={n} className="pill pill-neutral">
                  {needLabel(n)}
                </span>
              ))}
            </span>
          )}
          {ignored.length > 0 && (
            <p className="callout callout-note">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>Your {ignored.join(', ')} limit was not applied on this route because no matching rule is active.</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
