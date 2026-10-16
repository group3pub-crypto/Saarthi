import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Mic,
  MicOff,
  MapPin,
  Building2,
  Hospital,
  Bus,
  Compass,
  Navigation,
  X,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { searchPlaces, getPlaceReadinessCard, type PlaceSummary, type ReadinessCardResponse } from '../services/api'
import { MapLibreView } from '../components/map/MapLibreView'
import { ServiceReadinessCard } from '../components/readiness/ServiceReadinessCard'
import { ReportIssueModal } from '../components/report/ReportIssueModal'
import { SpeechService } from '../services/speech'
import { useAccessProfile } from '../context/AccessProfileContext'

const CATEGORIES = [
  { key: '', label: 'All Places' },
  { key: 'hospital', label: 'Hospitals', icon: <Hospital size={15} aria-hidden="true" /> },
  { key: 'transport_hub', label: 'Transit Hubs', icon: <Navigation size={15} aria-hidden="true" /> },
  { key: 'bus_stop', label: 'Bus Stops', icon: <Bus size={15} aria-hidden="true" /> },
  { key: 'municipal_office', label: 'Govt Offices', icon: <Building2 size={15} aria-hidden="true" /> },
  { key: 'court', label: 'Courts', icon: <Compass size={15} aria-hidden="true" /> }
]

export const HomePage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAccessProfile()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [places, setPlaces] = useState<PlaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  // Selected place and readiness card
  const [selectedPlace, setSelectedPlace] = useState<PlaceSummary | null>(null)
  const [readinessCard, setReadinessCard] = useState<ReadinessCardResponse | null>(null)
  const [isCardLoading, setIsCardLoading] = useState(false)

  // Report Issue Modal
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportFeatureId, setReportFeatureId] = useState<string | undefined>(undefined)

  // Fetch places on search or category change
  useEffect(() => {
    let active = true
    setIsLoading(true)
    setFetchError(null)

    const nearParam = userLocation ? `${userLocation.lat},${userLocation.lng}` : undefined

    searchPlaces({
      q: searchQuery || undefined,
      type: selectedCategory || undefined,
      near: nearParam,
      limit: 30
    })
      .then(res => {
        if (active) {
          setPlaces(res)
          setIsLoading(false)
        }
      })
      .catch((err: any) => {
        if (active) {
          setFetchError(err.message || 'Failed to query database')
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [searchQuery, selectedCategory, userLocation, retryKey])

  // Fetch Readiness Card when a place is selected
  useEffect(() => {
    if (!selectedPlace) {
      setReadinessCard(null)
      return
    }

    setIsCardLoading(true)
    getPlaceReadinessCard(selectedPlace.id, profile.activeNeedCodes)
      .then(card => {
        setReadinessCard(card)
        setIsCardLoading(false)
      })
      .catch(() => setIsCardLoading(false))
  }, [selectedPlace, profile.activeNeedCodes])

  const handleVoiceSearch = () => {
    if (isListening) {
      SpeechService.stopListening()
      setIsListening(false)
    } else {
      setIsListening(true)
      SpeechService.startListening(
        transcript => {
          setSearchQuery(transcript)
          setIsListening(false)
        },
        () => setIsListening(false)
      )
    }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        })
      },
      () => {
        // Fallback to Pune central coordinates
        setUserLocation({ lat: 18.5204, lng: 73.8567 })
      }
    )
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('')
  }

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'hospital':
        return <Hospital size={16} aria-hidden="true" style={{ color: 'var(--accent-primary)' }} />
      case 'bus_stop':
        return <Bus size={16} aria-hidden="true" style={{ color: 'var(--accent-primary)' }} />
      case 'transport_hub':
        return <Navigation size={16} aria-hidden="true" style={{ color: 'var(--accent-primary)' }} />
      case 'court':
        return <Compass size={16} aria-hidden="true" style={{ color: 'var(--accent-primary)' }} />
      case 'municipal_office':
      default:
        return <Building2 size={16} aria-hidden="true" style={{ color: 'var(--accent-primary)' }} />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Search Header Banner */}
      <section
        className="saarthi-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          backgroundColor: 'var(--bg-surface)'
        }}
        aria-label="Search and discover accessible public services in Pune"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              {t('app.title')}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', marginTop: '0.15rem' }}>
              {t('app.tagline')}
            </p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleUseMyLocation}
            aria-label="Find public services near current location"
            style={{ fontSize: '0.85rem' }}
          >
            <MapPin size={16} aria-hidden="true" />
            <span>{userLocation ? 'Near GPS Location' : 'Near Pune Central'}</span>
          </button>
        </div>

        {/* Search Input Bar with Speech Recognition and Clear Button */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Search
              size={18}
              style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}
              aria-hidden="true"
            />
            <input
              type="text"
              id="places-search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search hospitals, transit hubs, courts, government offices..."
              style={{
                width: '100%',
                padding: '0.75rem 2.5rem 0.75rem 2.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1.5px solid var(--border-medium)',
                fontSize: '0.95rem'
              }}
              aria-label="Search places by name or department"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search text"
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  padding: '4px',
                  color: 'var(--text-muted)'
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleVoiceSearch}
            className={isListening ? 'btn-danger' : 'btn-secondary'}
            aria-label={isListening ? 'Listening... click to stop' : 'Voice search: click and speak place name'}
            title="Search using voice"
            style={{ padding: '0 0.85rem' }}
          >
            {isListening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          </button>
        </div>

        {/* Service Category Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div
            role="group"
            aria-label="Filter by public service type"
            style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}
          >
            {CATEGORIES.map(cat => {
              const isSelected = selectedCategory === cat.key
              return (
                <button
                  key={cat.key}
                  type="button"
                  className={isSelected ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setSelectedCategory(cat.key)}
                  style={{
                    fontSize: '0.825rem',
                    padding: '0.4rem 0.8rem',
                    whiteSpace: 'nowrap',
                    borderRadius: 'var(--radius-pill)',
                    minHeight: '36px'
                  }}
                  aria-pressed={isSelected}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              )
            })}
          </div>

          {(searchQuery || selectedCategory) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={handleClearFilters}
              style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', minHeight: '32px', padding: '0.25rem 0.5rem' }}
              title="Reset search query and category filters"
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </section>

      {/* Main Two-Column View: Map & Results / Details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', minHeight: '540px' }}>
        {/* Left / Top: Interactive MapLibre */}
        <div style={{ height: '540px', position: 'sticky', top: '4.5rem' }}>
          <MapLibreView
            center={selectedPlace ? [selectedPlace.longitude, selectedPlace.latitude] : [73.8567, 18.5204]}
            zoom={selectedPlace ? 15 : 13}
            places={places}
            selectedPlaceId={selectedPlace?.id}
            onSelectPlace={p => setSelectedPlace(p)}
          />
        </div>

        {/* Right / Bottom: Selected Place Readiness Card OR Results List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {selectedPlace ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedPlace(null)}
                  style={{ fontSize: '0.85rem' }}
                >
                  ← Back to Places ({places.length})
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`/plan?dest=${selectedPlace.id}`)}
                  style={{ fontSize: '0.85rem' }}
                >
                  Plan Journey Here →
                </button>
              </div>

              {isCardLoading || !readinessCard ? (
                <div className="saarthi-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--border-medium)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
                  <p>Evaluating verified accessibility evidence for <strong>{selectedPlace.name}</strong>...</p>
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
            <div className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.65rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  Public Destinations ({places.length})
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  <span>Profile: <strong>{profile.presets.length > 0 ? profile.presets.join(', ') : 'Default'}</strong></span>
                </div>
              </div>

              {isLoading ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--border-medium)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
                  <p>Searching open civic registry...</p>
                </div>
              ) : fetchError ? (
                <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <div style={{ background: 'var(--status-unknown-bg)', border: '1px solid var(--status-unknown-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', maxWidth: '440px', margin: '0 auto' }}>
                    <Navigation size={32} color="var(--status-unknown-border)" style={{ margin: '0 auto 0.5rem' }} aria-hidden="true" />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--status-unknown-text)' }}>Civic Database Service Offline</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                      Could not query public destinations. If running locally, please start the Postgres/PostGIS service via <code>run.bat</code> or Docker on port 5433.
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      Strict Rule 1: No fabricated dummy places will be shown.
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setRetryKey(k => k + 1)}
                      style={{ marginTop: '1rem', fontSize: '0.85rem' }}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      <span>Retry Connection</span>
                    </button>
                  </div>
                </div>
              ) : places.length === 0 ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Navigation size={36} color="var(--border-strong)" style={{ margin: '0 auto 0.75rem' }} aria-hidden="true" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>No public places match this search</h3>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.35rem', maxWidth: '380px', marginInline: 'auto' }}>
                    {searchQuery ? `No records found for "${searchQuery}".` : 'No places available in this category.'} Try clearing filters or searching for Pune hospitals, bus stops, or municipal offices.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleClearFilters}
                    style={{ marginTop: '1.25rem', fontSize: '0.875rem' }}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    <span>Clear All Filters</span>
                  </button>
                </div>
              ) : (
                <ul className="places-list" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {places.map(place => (
                    <li key={place.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPlace(place)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.85rem 1rem',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        className="place-list-item"
                        aria-label={`Select ${place.name}, ${place.type.replace('_', ' ')}, address: ${place.address}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                          <div style={{ marginTop: '3px', background: 'var(--bg-card)', padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                            {getCategoryIcon(place.type)}
                          </div>
                          <div>
                            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
                              {place.type.replace('_', ' ')}
                            </span>
                            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>{place.name}</h3>
                            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{place.address}</p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {place.distance_m !== undefined && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', background: 'var(--bg-card)', padding: '2px 7px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                              {Math.round(place.distance_m)} m
                            </span>
                          )}
                          <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Report Issue Modal */}
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
