import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Navigation, MapPin, AlertCircle } from 'lucide-react'
import { planJourney, searchPlaces, type JourneyPlanResponse, type PlaceSummary } from '../services/api'
import { MapLibreView } from '../components/map/MapLibreView'
import { JourneyPassportCard } from '../components/passport/JourneyPassportCard'
import { GuidedNavigationHUD } from '../components/navigation/GuidedNavigationHUD'
import { ReportIssueModal } from '../components/report/ReportIssueModal'
import { useAccessProfile } from '../context/AccessProfileContext'

export const JourneyPlanPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const { profile } = useAccessProfile()

  const destParam = searchParams.get('dest')

  // Origin (defaults to Swargate / Pune Station area)
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number }>({
    latitude: 18.5018,
    longitude: 73.8580
  })

  // Destination search & selection
  const [destQuery, setDestQuery] = useState('')
  const [destResults, setDestResults] = useState<PlaceSummary[]>([])
  const [selectedDestination, setSelectedDestination] = useState<PlaceSummary | null>(null)

  // Journey plan result
  const [plan, setPlan] = useState<JourneyPlanResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Guided navigation mode
  const [isNavigating, setIsNavigating] = useState(false)

  // Report modal
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportCommentDefault, setReportCommentDefault] = useState('')

  // Load initial destination if dest query param is present
  useEffect(() => {
    if (destParam) {
      searchPlaces({ limit: 100 })
        .then(places => {
          const found = places.find(p => p.id === destParam)
          if (found) {
            setSelectedDestination(found)
            setDestQuery(found.name)
          }
        })
        .catch(() => {})
    }
  }, [destParam])

  // Destination search query handler
  useEffect(() => {
    if (!destQuery || selectedDestination?.name === destQuery) {
      setDestResults([])
      return
    }

    const timer = setTimeout(() => {
      searchPlaces({ q: destQuery, limit: 5 })
        .then(res => setDestResults(res))
        .catch(() => {})
    }, 300)

    return () => clearTimeout(timer)
  }, [destQuery, selectedDestination])

  const handlePlanJourney = async () => {
    if (!selectedDestination) {
      setErrorMsg('Please select a destination place.')
      return
    }

    setIsLoading(true)
    setErrorMsg('')

    try {
      const res = await planJourney({
        origin: origin,
        destination_place_id: selectedDestination.id,
        needs: profile.activeNeedCodes
      })
      setPlan(res)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to calculate journey plan.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHitBarrier = (stepDesc: string) => {
    setReportCommentDefault(`Unflagged barrier encountered during journey navigation on: ${stepDesc}`)
    setIsReportOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Route Query Formulation Card */}
      <section className="saarthi-card" aria-labelledby="plan-journey-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Navigation size={24} color="var(--accent-primary)" aria-hidden="true" />
          <h1 id="plan-journey-heading" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
            Plan Accessible Journey
          </h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Origin Picker */}
          <div>
            <label htmlFor="origin-location" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
              Origin (Starting Point)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="origin-location"
                type="text"
                value={`Pune Central (${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)})`}
                readOnly
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)'
                }}
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(pos => {
                    setOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
                  })
                }
              }}
              style={{ marginTop: '0.4rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            >
              <MapPin size={14} aria-hidden="true" />
              <span>Use Current GPS Location</span>
            </button>
          </div>

          {/* Destination Selector */}
          <div style={{ position: 'relative' }}>
            <label htmlFor="destination-search" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
              Destination (Hospital, Court, Bus Stop, Office)
            </label>
            <input
              id="destination-search"
              type="text"
              value={destQuery}
              onChange={e => {
                setDestQuery(e.target.value)
                setSelectedDestination(null)
              }}
              placeholder="Type destination name..."
              style={{
                width: '100%',
                padding: '0.65rem 1rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '2px solid var(--border-strong)'
              }}
              aria-autocomplete="list"
            />

            {/* Destination autocomplete results */}
            {destResults.length > 0 && (
              <ul
                role="listbox"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--bg-card)',
                  border: '2px solid var(--accent-primary)',
                  borderRadius: 'var(--radius-md)',
                  zIndex: 200,
                  listStyle: 'none',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  boxShadow: 'var(--shadow-lg)'
                }}
              >
                {destResults.map(p => (
                  <li key={p.id} role="option" aria-selected={selectedDestination?.id === p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDestination(p)
                        setDestQuery(p.name)
                        setDestResults([])
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.65rem',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.address} ({p.type})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Active Needs Info */}
        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Evaluating Constraints:</span>
            {profile.activeNeedCodes.map(code => (
              <span key={code} style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                {code}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={handlePlanJourney}
            disabled={isLoading || !selectedDestination}
            style={{ opacity: !selectedDestination ? 0.6 : 1 }}
          >
            {isLoading ? 'Calculating pgRouting Path...' : 'Evaluate Journey Readiness'}
          </button>
        </div>

        {errorMsg && (
          <div role="alert" style={{ marginTop: '0.75rem', color: 'var(--status-barrier-text)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
            <AlertCircle size={18} aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
      </section>

      {/* Main Map & Journey Passport Display */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Left: Map with Real Pedestrian Route LineString */}
        <div style={{ height: '540px', position: 'sticky', top: '5rem' }}>
          <MapLibreView
            center={selectedDestination ? [selectedDestination.longitude, selectedDestination.latitude] : [origin.longitude, origin.latitude]}
            zoom={15}
            origin={origin}
            destination={selectedDestination ? { latitude: selectedDestination.latitude, longitude: selectedDestination.longitude, name: selectedDestination.name } : undefined}
            routeGeometry={plan?.route_geometry}
          />
        </div>

        {/* Right: Journey Readiness Passport */}
        <div>
          {plan ? (
            <JourneyPassportCard
              plan={plan}
              onStartNavigation={() => setIsNavigating(true)}
              onRequestAssistance={() => {
                setReportCommentDefault(`Assistance request for ${plan.destination_name}`)
                setIsReportOpen(true)
              }}
              onReportBarrier={handleHitBarrier}
            />
          ) : (
            <div
              className="saarthi-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '2rem 1.5rem',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <Navigation size={42} color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem' }} aria-hidden="true" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Journey Readiness Evaluation</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Evaluate every accessibility-critical pedestrian step from your starting point to your public destination.
                </p>
              </div>

              {/* Guided Flow Instructions */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'block' }}>STEP 1</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Set Origin</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Use GPS or Pune Central</p>
                </div>
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'block' }}>STEP 2</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Choose Destination</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Hospital, Court, Transit</p>
                </div>
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'block' }}>STEP 3</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Access Needs</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{profile.presets.length > 0 ? profile.presets.join(', ') : 'Default Needs'}</p>
                </div>
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', display: 'block' }}>STEP 4</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Verdict Passport</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Deterministic audit check</p>
                </div>
              </div>

              <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                💡 Select a destination in the top search box and click <strong>Evaluate Journey Readiness</strong> to view real-world verified pedestrian steps.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Guided Navigation HUD (Overlay) */}
      {isNavigating && plan && (
        <GuidedNavigationHUD
          plan={plan}
          onClose={() => setIsNavigating(false)}
          onHitBarrier={handleHitBarrier}
        />
      )}

      {/* Report Barrier Modal */}
      <ReportIssueModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        placeId={selectedDestination?.id}
        placeName={selectedDestination?.name}
        initialComment={reportCommentDefault}
      />
    </div>
  )
}
