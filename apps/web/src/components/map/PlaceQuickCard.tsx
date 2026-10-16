import React from 'react'
import { Building2, Compass, Hospital, Bus, Navigation, Search, ShieldCheck, Train, X } from 'lucide-react'
import type { PlaceSummary } from '../../services/api'
import { describeEvidenceCoverage, describeFreshness } from '../../services/evidence'
import { EvidenceBadge } from '../common/EvidenceBadge'

const TYPE_ICON: Record<string, React.ReactNode> = {
  hospital: <Hospital size={18} aria-hidden="true" />,
  bus_stop: <Bus size={18} aria-hidden="true" />,
  transport_hub: <Train size={18} aria-hidden="true" />,
  court: <Compass size={18} aria-hidden="true" />,
  aadhaar_centre: <ShieldCheck size={18} aria-hidden="true" />
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`
}

interface PlaceQuickCardProps {
  place: PlaceSummary
  onClose: () => void
  onInspect: () => void
  onPlanJourney: () => void
}

/** The floating card that appears over the map when a marker (or a list row) is selected — the "clicking a marker opens a polished place card" surface. */
export const PlaceQuickCard: React.FC<PlaceQuickCardProps> = ({ place, onClose, onInspect, onPlanJourney }) => {
  return (
    <div className="map-quick-card" role="region" aria-label={`Selected place: ${place.name}`}>
      <div className="map-quick-card-top">
        <span className="map-quick-card-icon">{TYPE_ICON[place.type] ?? <Building2 size={18} aria-hidden="true" />}</span>
        <div className="map-quick-card-title">
          <span className="eyebrow">{place.type.replace(/_/g, ' ')}</span>
          <h3>{place.name}</h3>
          <p className="text-secondary text-sm">{place.address}</p>
        </div>
        <button type="button" className="map-quick-card-close" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="place-card-evidence">
        {place.evidence ? <EvidenceBadge state={place.evidence.state} /> : <span className="tag">Evidence details unavailable</span>}
        <span className="text-muted text-sm">{describeFreshness(place.evidence)}</span>
      </div>
      <p className="text-secondary text-sm">
        {describeEvidenceCoverage(place.evidence)}
        {place.distance_m !== undefined ? ` · ${formatDistance(place.distance_m)}` : ''}
      </p>

      <div className="map-quick-card-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onInspect} aria-label={`View full details for ${place.name}`}>
          <Search size={14} aria-hidden="true" />
          <span>View details</span>
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onPlanJourney} aria-label={`Plan a journey to ${place.name}`}>
          <Navigation size={14} aria-hidden="true" />
          <span>Plan journey</span>
        </button>
      </div>
    </div>
  )
}
