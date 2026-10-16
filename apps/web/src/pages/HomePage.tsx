import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Bus,
  ClipboardCheck,
  Compass,
  Hospital,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Train,
  UserCheck,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getPlaceReadinessCard, searchPlaces, type PlaceSummary, type ReadinessCardResponse } from '../services/api'
import {
  EVIDENCE_STATE_INFO,
  EVIDENCE_STATES,
  FRESHNESS_OPTIONS,
  describeEvidenceCoverage,
  describeFreshness,
  describeMissingInformation,
  type EvidenceState
} from '../services/evidence'
import { needLabel } from '../services/requirements'
import { MapLibreView } from '../components/map/MapLibreView'
import { ServiceReadinessCard } from '../components/readiness/ServiceReadinessCard'
import { EvidenceBadge } from '../components/common/EvidenceBadge'
import { ReportIssueModal } from '../components/report/ReportIssueModal'
import { SpeechService } from '../services/speech'
import { useAccessProfile } from '../context/AccessProfileContext'
import { useProfileModal } from '../context/ProfileModalContext'

const CATEGORIES: Array<{ key: string; label: string; icon?: React.ReactNode }> = [
  { key: '', label: 'All places' },
  { key: 'hospital', label: 'Hospitals', icon: <Hospital size={15} aria-hidden="true" /> },
  { key: 'municipal_office', label: 'Offices', icon: <Building2 size={15} aria-hidden="true" /> },
  { key: 'court', label: 'Courts', icon: <Compass size={15} aria-hidden="true" /> },
  { key: 'bus_stop', label: 'Bus stops', icon: <Bus size={15} aria-hidden="true" /> },
  { key: 'transport_hub', label: 'Transport hubs', icon: <Train size={15} aria-hidden="true" /> },
  { key: 'aadhaar_centre', label: 'Aadhaar & services', icon: <ShieldCheck size={15} aria-hidden="true" /> },
  { key: 'ration_centre', label: 'Ration centres', icon: <Building2 size={15} aria-hidden="true" /> }
]

const TYPE_ICON: Record<string, React.ReactNode> = {
  hospital: <Hospital size={18} aria-hidden="true" />,
  bus_stop: <Bus size={18} aria-hidden="true" />,
  transport_hub: <Train size={18} aria-hidden="true" />,
  court: <Compass size={18} aria-hidden="true" />
}

// Only used as the first view of the map before any place is chosen.
const DEFAULT_MAP_CENTER: [number, number] = [73.8567, 18.5204]

type LocationState = { status: 'off' } | { status: 'locating' } | { status: 'on'; lat: number; lng: number } | { status: 'denied'; reason: string }

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`
}

function typeLabel(type: string): string {
  return CATEGORIES.find(c => c.key === type)?.label ?? type.replace(/_/g, ' ')
}

export const HomePage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile, thresholds, hasSavedProfile } = useAccessProfile()
  const { openProfileModal } = useProfileModal()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState('')
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceState | ''>('')
  const [freshDays, setFreshDays] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [location, setLocation] = useState<LocationState>({ status: 'off' })

  const [places, setPlaces] = useState<PlaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)

  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')

  const [selectedPlace, setSelectedPlace] = useState<PlaceSummary | null>(null)
  const [readinessCard, setReadinessCard] = useState<ReadinessCardResponse | null>(null)
  const [isCardLoading, setIsCardLoading] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [cardRetry, setCardRetry] = useState(0)

  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportFeatureId, setReportFeatureId] = useState<string | undefined>(undefined)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const nearParam = location.status === 'on' ? `${location.lat},${location.lng}` : undefined

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setFetchError(null)

    searchPlaces(
      {
        q: debouncedQuery || undefined,
        type: category || undefined,
        near: nearParam,
        evidence_state: evidenceFilter || undefined,
        fresh_days: freshDays || undefined,
        limit: 30
      },
      controller.signal
    )
      .then(res => {
        setPlaces(res)
        setHasSearched(true)
        setIsLoading(false)
      })
      .catch((err: Error) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setFetchError(err.message || 'The place search failed.')
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [debouncedQuery, category, nearParam, evidenceFilter, freshDays, retryKey])

  // The readiness card is evaluated against the saved needs and any numeric limits the person changed.
  const needsKey = profile.activeNeedCodes.join(',')
  const thresholdKey = JSON.stringify(thresholds)
  useEffect(() => {
    if (!selectedPlace) {
      setReadinessCard(null)
      setCardError(null)
      return
    }
    if (profile.activeNeedCodes.length === 0) {
      setReadinessCard(null)
      setCardError(null)
      setIsCardLoading(false)
      return
    }

    const controller = { cancelled: false }
    setIsCardLoading(true)
    setCardError(null)
    getPlaceReadinessCard(selectedPlace.id, profile.activeNeedCodes, thresholds)
      .then(card => {
        if (controller.cancelled) return
        setReadinessCard(card)
        setIsCardLoading(false)
      })
      .catch((err: Error) => {
        if (controller.cancelled) return
        setCardError(err.message || 'The readiness check failed.')
        setIsCardLoading(false)
      })
    return () => {
      controller.cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace, needsKey, thresholdKey, cardRetry])

  const filtersActive = Boolean(debouncedQuery || category || evidenceFilter || freshDays)
  const advancedFilterCount = (evidenceFilter ? 1 : 0) + (freshDays ? 1 : 0)

  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setDebouncedQuery('')
    setCategory('')
    setEvidenceFilter('')
    setFreshDays(0)
  }, [])

  const handleSearchAgain = () => {
    setRetryKey(k => k + 1)
    searchRef.current?.focus()
  }

  const handleVoiceSearch = () => {
    setVoiceError(null)
    if (isListening) {
      SpeechService.stopListening()
      setIsListening(false)
      return
    }
    setIsListening(true)
    SpeechService.startListening(
      transcript => {
        setSearchQuery(transcript)
        setIsListening(false)
      },
      () => {
        setIsListening(false)
        setVoiceError('Voice search is not available or was not allowed in this browser.')
      }
    )
  }

  const handleUseMyLocation = () => {
    if (location.status === 'on') {
      setLocation({ status: 'off' })
      return
    }
    if (!navigator.geolocation) {
      setLocation({ status: 'denied', reason: 'This browser cannot share a location.' })
      return
    }
    setLocation({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      pos => setLocation({ status: 'on', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocation({ status: 'denied', reason: 'Location was not shared, so results are not sorted by distance.' }),
      { timeout: 10000 }
    )
  }

  const selectPlace = (place: PlaceSummary) => {
    setSelectedPlace(place)
    setMobileView('list')
  }

  const mapCenter = useMemo<[number, number]>(() => {
    if (selectedPlace) return [selectedPlace.longitude, selectedPlace.latitude]
    if (location.status === 'on') return [location.lng, location.lat]
    return DEFAULT_MAP_CENTER
  }, [selectedPlace, location])

  const needChips = profile.activeNeedCodes

  return (
    <div className="page explore-page">
      <section className="hero" aria-labelledby="explore-heading">
        <p className="eyebrow">Public journey accessibility</p>
        <h1 id="explore-heading" className="hero-title">
          Know before you go.
        </h1>
        <p className="hero-lead">
          A pin on a map does not mean a place is accessible. SAARTHI looks at the evidence for the whole journey, the way in, the route and the
          facilities, checks how recent it is, and says plainly what is still unknown.
        </p>
        <ul className="hero-points">
          <li>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Unknown is never treated as accessible</span>
          </li>
          <li>
            <ClipboardCheck size={16} aria-hidden="true" />
            <span>Evidence expires and is shown with its age</span>
          </li>
          <li>
            <UserCheck size={16} aria-hidden="true" />
            <span>Your needs stay on your device</span>
          </li>
        </ul>
      </section>

      <section className="search-panel" aria-label="Search public places">
        <form
          role="search"
          className="search-row"
          onSubmit={e => {
            e.preventDefault()
            setDebouncedQuery(searchQuery.trim())
          }}
        >
          <div className="search-field">
            <Search size={18} className="search-field-icon" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              id="places-search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search hospitals, bus stops, courts, offices…"
              aria-label="Search places by name, department or address"
              autoComplete="off"
            />
            {searchQuery && (
              <button type="button" className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search text">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleVoiceSearch}
            className={`btn ${isListening ? 'btn-danger' : 'btn-secondary'} btn-icon`}
            aria-label={isListening ? 'Listening. Activate to stop.' : 'Search by voice'}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={handleUseMyLocation}
            className={`btn ${location.status === 'on' ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={location.status === 'on'}
            disabled={location.status === 'locating'}
          >
            <LocateFixed size={16} aria-hidden="true" />
            <span>{location.status === 'locating' ? 'Locating…' : location.status === 'on' ? 'Near me: on' : 'Near me'}</span>
          </button>
        </form>

        {location.status === 'denied' && (
          <p className="callout callout-note" role="status">
            <MapPin size={16} aria-hidden="true" />
            <span>{location.reason}</span>
          </p>
        )}
        {voiceError && (
          <p className="callout callout-note" role="status">
            <Mic size={16} aria-hidden="true" />
            <span>{voiceError}</span>
          </p>
        )}

        <div className="chip-row" role="group" aria-label="Type of place">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key || 'all'}
              type="button"
              className={`chip${category === cat.key ? ' is-active' : ''}`}
              aria-pressed={category === cat.key}
              onClick={() => setCategory(cat.key)}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="filter-bar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={filtersOpen}
            aria-controls="evidence-filters"
            onClick={() => setFiltersOpen(o => !o)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span>Evidence filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}</span>
          </button>

          <button type="button" className="needs-strip" onClick={openProfileModal} aria-label="Edit the needs your results are checked against">
            <UserCheck size={15} aria-hidden="true" />
            {needChips.length > 0 ? (
              <>
                <span>Checked for:</span>
                {needChips.map(c => (
                  <span key={c} className="pill pill-neutral">
                    {needLabel(c)}
                  </span>
                ))}
                {!hasSavedProfile && <span className="text-muted">(starting default)</span>}
              </>
            ) : (
              <span>No checkable needs selected. Set up your profile</span>
            )}
          </button>

          {filtersActive && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearFilters}>
              <RotateCcw size={14} aria-hidden="true" />
              <span>Clear filters</span>
            </button>
          )}
        </div>

        {filtersOpen && (
          <div id="evidence-filters" className="filters-panel">
            <fieldset className="filter-group">
              <legend>Evidence on file</legend>
              <div className="segmented">
                <label className={`segment${evidenceFilter === '' ? ' is-active' : ''}`}>
                  <input type="radio" name="evidence" checked={evidenceFilter === ''} onChange={() => setEvidenceFilter('')} />
                  <span>Any</span>
                </label>
                {EVIDENCE_STATES.map(state => (
                  <label key={state} className={`segment segment-${state}${evidenceFilter === state ? ' is-active' : ''}`}>
                    <input type="radio" name="evidence" checked={evidenceFilter === state} onChange={() => setEvidenceFilter(state)} />
                    <span>{EVIDENCE_STATE_INFO[state].label}</span>
                  </label>
                ))}
              </div>
              <p className="text-muted text-sm">
                {evidenceFilter ? EVIDENCE_STATE_INFO[evidenceFilter].explanation : 'Evidence describes what has been recorded. It is not a verdict on accessibility.'}
              </p>
            </fieldset>

            <div className="filter-group">
              <label htmlFor="fresh-days">Freshness</label>
              <select id="fresh-days" className="form-input" value={freshDays} onChange={e => setFreshDays(Number(e.target.value))}>
                {FRESHNESS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-muted text-sm">Only places with at least one current observation made within this time.</p>
            </div>
          </div>
        )}
      </section>

      <div className="view-toggle" role="group" aria-label="Show list or map">
        <button type="button" className={`segment${mobileView === 'list' ? ' is-active' : ''}`} aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}>
          <List size={15} aria-hidden="true" /> List
        </button>
        <button type="button" className={`segment${mobileView === 'map' ? ' is-active' : ''}`} aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}>
          <MapIcon size={15} aria-hidden="true" /> Map
        </button>
      </div>

      <div className={`explore-layout view-${mobileView}`}>
        <div className="results-pane">
          {selectedPlace ? (
            <div className="detail-pane">
              <div className="detail-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedPlace(null)}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  <span>Back to results ({places.length})</span>
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/plan?dest=${selectedPlace.id}`)}>
                  <Navigation size={15} aria-hidden="true" />
                  <span>Plan journey here</span>
                </button>
              </div>

              {profile.activeNeedCodes.length === 0 ? (
                <div className="saarthi-card empty-state">
                  <UserCheck size={32} className="empty-state-icon" aria-hidden="true" />
                  <h2 className="empty-state-title">Choose a need to check this place against</h2>
                  <p className="empty-state-desc">
                    Without at least one need that has measurable rules, SAARTHI cannot assess {selectedPlace.name}. Nothing is assumed.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={openProfileModal}>
                    Open access profile
                  </button>
                </div>
              ) : cardError ? (
                <div className="saarthi-card empty-state empty-state-warn" role="alert">
                  <AlertTriangle size={32} className="empty-state-icon" aria-hidden="true" />
                  <h2 className="empty-state-title">The check for {selectedPlace.name} did not complete</h2>
                  <p className="empty-state-desc">{cardError}</p>
                  <button type="button" className="btn btn-primary" onClick={() => setCardRetry(n => n + 1)}>
                    <RotateCcw size={15} aria-hidden="true" /> Try again
                  </button>
                </div>
              ) : isCardLoading || !readinessCard ? (
                <div className="saarthi-card" aria-busy="true">
                  <p className="text-muted" role="status">
                    Checking the evidence for <strong>{selectedPlace.name}</strong>…
                  </p>
                  <div className="skeleton skeleton-line w-60" />
                  <div className="skeleton skeleton-block" />
                  <div className="skeleton skeleton-block" />
                </div>
              ) : (
                <ServiceReadinessCard
                  card={readinessCard}
                  onReportIssue={featureId => {
                    setReportFeatureId(featureId)
                    setIsReportOpen(true)
                  }}
                />
              )}
            </div>
          ) : (
            <div className="saarthi-card results-card">
              <div className="results-head">
                <h2 className="section-title">
                  {isLoading && !hasSearched ? 'Looking for places…' : `${places.length} ${places.length === 1 ? 'place' : 'places'}`}
                  {filtersActive && !isLoading ? ' match your search' : ''}
                </h2>
                <p className="text-muted text-sm" role="status" aria-live="polite">
                  {isLoading ? 'Updating…' : location.status === 'on' ? 'Nearest first' : ''}
                </p>
              </div>

              {isLoading && places.length === 0 ? (
                <ul className="places-skeleton" aria-busy="true" aria-label="Loading places">
                  {[0, 1, 2, 3].map(i => (
                    <li key={i} className="place-card">
                      <div className="skeleton skeleton-line w-40" />
                      <div className="skeleton skeleton-line w-80" />
                      <div className="skeleton skeleton-line w-60" />
                    </li>
                  ))}
                </ul>
              ) : fetchError ? (
                <div className="empty-state empty-state-warn" role="alert">
                  <AlertTriangle size={32} className="empty-state-icon" aria-hidden="true" />
                  <h3 className="empty-state-title">Places could not be loaded</h3>
                  <p className="empty-state-desc">{fetchError}</p>
                  <p className="text-muted text-sm">No placeholder places are shown. If you run SAARTHI yourself, check that the API and database are running.</p>
                  <button type="button" className="btn btn-primary" onClick={() => setRetryKey(k => k + 1)}>
                    <RotateCcw size={15} aria-hidden="true" /> Try again
                  </button>
                </div>
              ) : places.length === 0 ? (
                <div className="empty-state">
                  <MapPin size={32} className="empty-state-icon" aria-hidden="true" />
                  <h3 className="empty-state-title">{filtersActive ? 'No places match these filters' : 'No places have been added yet'}</h3>
                  <p className="empty-state-desc">
                    {filtersActive
                      ? 'Nothing in the registry matches. Loosen the filters, or search for a different name.'
                      : 'The registry has no places to show. SAARTHI never invents places, so the list stays empty until real ones are added.'}
                  </p>
                  <div className="empty-actions">
                    {filtersActive && (
                      <button type="button" className="btn btn-primary" onClick={handleClearFilters}>
                        <RotateCcw size={15} aria-hidden="true" /> Clear filters
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={handleSearchAgain}>
                      <Search size={15} aria-hidden="true" /> Search again
                    </button>
                    <Link to="/auditor" className="btn btn-secondary">
                      <ClipboardCheck size={15} aria-hidden="true" /> Start an audit
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="places-list" aria-label="Places">
                  {places.map(place => {
                    const missing = describeMissingInformation(place.evidence)
                    const barriers = place.evidence?.barrier_count ?? 0
                    return (
                      <li key={place.id} className="place-card">
                        <div className="place-card-top">
                          <span className="place-card-icon">{TYPE_ICON[place.type] ?? <Building2 size={18} aria-hidden="true" />}</span>
                          <div className="place-card-title">
                            <span className="eyebrow">{typeLabel(place.type)}</span>
                            <h3>{place.name}</h3>
                            <p className="text-secondary text-sm">{place.address}</p>
                          </div>
                          {place.distance_m !== undefined && <span className="tag">{formatDistance(place.distance_m)}</span>}
                        </div>

                        <div className="place-card-evidence">
                          {place.evidence ? <EvidenceBadge state={place.evidence.state} /> : <span className="tag">Evidence details unavailable</span>}
                          <span className="text-muted text-sm">{describeFreshness(place.evidence)}</span>
                        </div>

                        <ul className="fact-list text-sm">
                          <li>{describeEvidenceCoverage(place.evidence)}</li>
                          {barriers > 0 && (
                            <li className="fact-barrier">
                              {barriers} known barrier{barriers === 1 ? '' : 's'} on record
                            </li>
                          )}
                          {missing.map((m, i) => (
                            <li key={i} className="fact-missing">
                              {m.text}
                            </li>
                          ))}
                        </ul>

                        <div className="card-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => selectPlace(place)} aria-label={`Inspect evidence for ${place.name}`}>
                            <Search size={14} aria-hidden="true" />
                            <span>Inspect evidence</span>
                          </button>
                          <Link to={`/plan?dest=${place.id}`} className="btn btn-primary btn-sm" aria-label={`Plan a journey to ${place.name}`}>
                            <Navigation size={14} aria-hidden="true" />
                            <span>Plan journey</span>
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="map-pane">
          <MapLibreView
            center={mapCenter}
            zoom={selectedPlace ? 15 : 13}
            places={places}
            selectedPlaceId={selectedPlace?.id}
            onSelectPlace={selectPlace}
          />
          <div className="map-legend" aria-label="Map key: marker colour and symbol show the evidence on file, not accessibility">
            {EVIDENCE_STATES.map(state => (
              <span key={state} className={`legend-item state-${state}`}>
                <span className="legend-dot" aria-hidden="true">
                  {EVIDENCE_STATE_INFO[state].glyph}
                </span>
                {EVIDENCE_STATE_INFO[state].label}
              </span>
            ))}
          </div>
          <p className="text-muted text-sm">{t('app.attribution').split('|')[0]}</p>
        </div>
      </div>

      <ReportIssueModal
        isOpen={isReportOpen}
        onClose={() => {
          setIsReportOpen(false)
          setReportFeatureId(undefined)
        }}
        placeId={selectedPlace?.id}
        placeName={selectedPlace?.name}
        featureId={reportFeatureId}
      />
    </div>
  )
}
