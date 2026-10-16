import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, LocateFixed, MapPin, Navigation, RotateCcw, UserCheck } from 'lucide-react'
import { getPlace, planJourney, type JourneyPlanResponse, type PlaceSummary } from '../services/api'
import { needLabel } from '../services/requirements'
import { MapLibreView } from '../components/map/MapLibreView'
import { PlaceCombobox } from '../components/common/PlaceCombobox'
import { JourneyPassportCard } from '../components/passport/JourneyPassportCard'
import { GuidedNavigationHUD } from '../components/navigation/GuidedNavigationHUD'
import { ReportIssueModal } from '../components/report/ReportIssueModal'
import { useAccessProfile } from '../context/AccessProfileContext'
import { useProfileModal } from '../context/ProfileModalContext'

type Point = { latitude: number; longitude: number }
type OriginMode = 'default' | 'gps' | 'place'

/** Used only when the person has not chosen a start. It is labelled as such and can be replaced. */
const DEFAULT_START: Point = { latitude: 18.5018, longitude: 73.858 }
const DEFAULT_START_LABEL = 'Swargate, Pune (default start)'

export const JourneyPlanPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const { profile, thresholds } = useAccessProfile()
  const { openProfileModal } = useProfileModal()

  const destParam = searchParams.get('dest')

  const [originMode, setOriginMode] = useState<OriginMode>('default')
  const [gpsPoint, setGpsPoint] = useState<Point | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'failed'>('idle')
  const [gpsMessage, setGpsMessage] = useState('')
  const [originPlace, setOriginPlace] = useState<PlaceSummary | null>(null)

  const [destination, setDestination] = useState<PlaceSummary | null>(null)
  const [destLoadError, setDestLoadError] = useState('')

  const [plan, setPlan] = useState<JourneyPlanResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [isNavigating, setIsNavigating] = useState(false)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportCommentDefault, setReportCommentDefault] = useState('')

  useEffect(() => {
    if (!destParam) return
    const controller = new AbortController()
    setDestLoadError('')
    getPlace(destParam, controller.signal)
      .then(setDestination)
      .catch((err: Error) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setDestLoadError(err.message)
      })
    return () => controller.abort()
  }, [destParam])

  const origin: Point = useMemo(() => {
    if (originMode === 'gps' && gpsPoint) return gpsPoint
    if (originMode === 'place' && originPlace) return { latitude: originPlace.latitude, longitude: originPlace.longitude }
    return DEFAULT_START
  }, [originMode, gpsPoint, originPlace])

  const originLabel =
    originMode === 'gps' && gpsPoint
      ? 'Your current location'
      : originMode === 'place' && originPlace
        ? originPlace.name
        : DEFAULT_START_LABEL

  // Any change to the inputs makes an earlier result stale.
  const needsKey = profile.activeNeedCodes.join(',')
  const thresholdKey = JSON.stringify(thresholds)
  useEffect(() => {
    setPlan(null)
    setIsNavigating(false)
  }, [origin.latitude, origin.longitude, destination?.id, needsKey, thresholdKey])

  const hasNeeds = profile.activeNeedCodes.length > 0
  const canEvaluate = Boolean(destination) && hasNeeds && !isLoading

  const useGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('failed')
      setGpsMessage('This browser cannot share a location.')
      return
    }
    setGpsStatus('locating')
    setGpsMessage('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsPoint({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setOriginMode('gps')
        setGpsStatus('idle')
      },
      () => {
        setGpsStatus('failed')
        setGpsMessage('Location was not shared. Search for a starting place instead, or keep the default start.')
      },
      { timeout: 10000 }
    )
  }

  const handlePlanJourney = async () => {
    if (!destination) {
      setErrorMsg('Choose a destination first.')
      return
    }
    if (!hasNeeds) {
      setErrorMsg('Choose at least one need in your access profile first.')
      return
    }

    setIsLoading(true)
    setErrorMsg('')
    try {
      const res = await planJourney({
        origin,
        destination_place_id: destination.id,
        needs: profile.activeNeedCodes,
        thresholds
      })
      setPlan(res)
    } catch (err) {
      setPlan(null)
      setErrorMsg((err as Error).message || 'The journey could not be checked.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHitBarrier = (stepDesc: string) => {
    setReportCommentDefault(`Barrier met during journey on: ${stepDesc}`)
    setIsReportOpen(true)
  }

  return (
    <div className="page plan-page">
      <header className="page-head">
        <p className="eyebrow">Journey planner</p>
        <h1 id="plan-journey-heading" className="page-title">
          Plan Accessible Journey
        </h1>
        <p className="text-secondary">
          Check the evidence for each step between your start and the destination. Anything without current evidence is shown as unknown, never as accessible.
        </p>
      </header>

      <section className="saarthi-card plan-form" aria-labelledby="plan-journey-heading">
        <ol className="plan-steps">
          <li className="plan-step">
            <span className="plan-step-number" aria-hidden="true">1</span>
            <div className="plan-step-body">
              <h2 className="plan-step-title">Where are you starting?</h2>
              <p className="text-sm" id="origin-summary">
                <MapPin size={14} aria-hidden="true" /> <strong>{originLabel}</strong>
                {originMode === 'default' && <span className="text-muted"> · change it below</span>}
              </p>
              <div className="origin-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={useGps} disabled={gpsStatus === 'locating'}>
                  <LocateFixed size={15} aria-hidden="true" />
                  <span>{gpsStatus === 'locating' ? 'Locating…' : 'Use my location'}</span>
                </button>
                {originMode !== 'default' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setOriginMode('default')
                      setOriginPlace(null)
                    }}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    <span>Use default start</span>
                  </button>
                )}
              </div>
              {gpsStatus === 'failed' && (
                <p className="callout callout-note" role="status">
                  <MapPin size={16} aria-hidden="true" />
                  <span>{gpsMessage}</span>
                </p>
              )}
              <PlaceCombobox
                id="origin-search"
                label="Or start from a place"
                placeholder="Search a stop, station or building…"
                selected={originPlace}
                onSelect={p => {
                  setOriginPlace(p)
                  setOriginMode(p ? 'place' : 'default')
                }}
              />
            </div>
          </li>

          <li className="plan-step">
            <span className="plan-step-number" aria-hidden="true">2</span>
            <div className="plan-step-body">
              <h2 className="plan-step-title">Where do you need to go?</h2>
              <PlaceCombobox
                id="destination-search"
                label="Destination"
                hint="Hospital, court, office, bus stop or other public service"
                placeholder="Search for the place you are going to…"
                selected={destination}
                onSelect={setDestination}
              />
              {destLoadError && (
                <p className="callout callout-warn" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{destLoadError} Search for the place instead.</span>
                </p>
              )}
            </div>
          </li>

          <li className="plan-step">
            <span className="plan-step-number" aria-hidden="true">3</span>
            <div className="plan-step-body">
              <h2 className="plan-step-title">What does the journey need to work for?</h2>
              {hasNeeds ? (
                <p className="text-sm needs-line">
                  {profile.activeNeedCodes.map(code => (
                    <span key={code} className="pill pill-neutral">
                      {needLabel(code)}
                    </span>
                  ))}
                  {Object.keys(thresholds).length > 0 && <span className="pill pill-brand">your own limits</span>}
                  {!profile.savedByUser && <span className="text-muted">(starting default, not saved)</span>}
                </p>
              ) : (
                <p className="callout callout-warn">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>No need with measurable rules is selected, so there is nothing SAARTHI can check.</span>
                </p>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={openProfileModal}>
                <UserCheck size={15} aria-hidden="true" />
                <span>{hasNeeds ? 'Edit access profile' : 'Set up access profile'}</span>
              </button>
              <p className="text-muted text-sm">Your profile stays on this device. Only the need codes and any limits you changed are sent.</p>
            </div>
          </li>
        </ol>

        <div className="plan-submit">
          <button type="button" className="btn btn-primary btn-lg" onClick={handlePlanJourney} disabled={!canEvaluate}>
            {isLoading ? 'Checking evidence…' : 'Check journey readiness'}
          </button>
          {!destination && <span className="text-muted text-sm">Choose a destination to continue.</span>}
        </div>

        {errorMsg && (
          <p role="alert" className="callout callout-danger">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{errorMsg}</span>
          </p>
        )}
      </section>

      <div className="explore-layout plan-layout">
        <div className="map-pane">
          <MapLibreView
            center={destination ? [destination.longitude, destination.latitude] : [origin.longitude, origin.latitude]}
            zoom={15}
            origin={origin}
            destination={destination ? { latitude: destination.latitude, longitude: destination.longitude, name: destination.name } : undefined}
            routeGeometry={plan?.route_geometry}
            routeKind={plan?.route_kind}
          />
          {plan && (
            <p className="text-muted text-sm">
              {plan.route_kind === 'pedestrian_network'
                ? 'The purple line follows mapped walking paths.'
                : 'The dashed line is a straight line between the points. It is not a walkable route.'}
            </p>
          )}
        </div>

        <div className="results-pane" aria-live="polite" aria-busy={isLoading}>
          {isLoading ? (
            <div className="saarthi-card" aria-label="Checking the journey">
              <div className="skeleton skeleton-line w-60" />
              <div className="skeleton skeleton-block" />
              <div className="skeleton skeleton-block" />
              <div className="skeleton skeleton-block" />
            </div>
          ) : plan ? (
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
            <div className="saarthi-card empty-state">
              <Navigation size={36} className="empty-state-icon" aria-hidden="true" />
              <h2 className="empty-state-title">Your readiness passport appears here</h2>
              <p className="empty-state-desc">
                It lists each step of the journey with its evidence, how recent it is, and what is still unknown. Choose a destination and check readiness to
                see it.
              </p>
              <p className="callout callout-success">
                <Check size={16} aria-hidden="true" />
                <span>Nothing is assumed: a step with no current evidence is shown as unknown.</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {isNavigating && plan && <GuidedNavigationHUD plan={plan} onClose={() => setIsNavigating(false)} onHitBarrier={handleHitBarrier} />}

      <ReportIssueModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        placeId={destination?.id}
        placeName={destination?.name}
        initialComment={reportCommentDefault}
      />
    </div>
  )
}
