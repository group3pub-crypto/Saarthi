import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Flag, ImageOff, Navigation, RotateCcw, UserCheck } from 'lucide-react'
import { getPlace, getPlaceReadinessCard, type PlaceSummary, type ReadinessCardResponse } from '../services/api'
import { MapLibreView } from '../components/map/MapLibreView'
import { ServiceReadinessCard } from '../components/readiness/ServiceReadinessCard'
import { ReportIssueModal } from '../components/report/ReportIssueModal'
import { useAccessProfile } from '../context/AccessProfileContext'
import { useProfileModal } from '../context/ProfileModalContext'

/** The dedicated facility page: name, category, address, evidence, features, freshness, photos (when real ones exist), and the two primary CTAs. */
export const PlaceDetailPage: React.FC = () => {
  const { placeId } = useParams<{ placeId: string }>()
  const navigate = useNavigate()
  const { profile, thresholds } = useAccessProfile()
  const { openProfileModal } = useProfileModal()

  const [place, setPlace] = useState<PlaceSummary | null>(null)
  const [placeError, setPlaceError] = useState('')
  const [isLoadingPlace, setIsLoadingPlace] = useState(true)

  const [card, setCard] = useState<ReadinessCardResponse | null>(null)
  const [cardError, setCardError] = useState('')
  const [isCardLoading, setIsCardLoading] = useState(false)
  const [retry, setRetry] = useState(0)

  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportFeatureId, setReportFeatureId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!placeId) return
    const controller = new AbortController()
    setIsLoadingPlace(true)
    setPlaceError('')
    getPlace(placeId, controller.signal)
      .then(p => {
        setPlace(p)
        setIsLoadingPlace(false)
      })
      .catch((err: Error) => {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setPlaceError(err.message || 'That place could not be loaded.')
        setIsLoadingPlace(false)
      })
    return () => controller.abort()
  }, [placeId])

  const needsKey = profile.activeNeedCodes.join(',')
  const thresholdKey = JSON.stringify(thresholds)
  useEffect(() => {
    if (!placeId || profile.activeNeedCodes.length === 0) {
      setCard(null)
      setCardError('')
      return
    }
    const controller = { cancelled: false }
    setIsCardLoading(true)
    setCardError('')
    getPlaceReadinessCard(placeId, profile.activeNeedCodes, thresholds)
      .then(res => {
        if (controller.cancelled) return
        setCard(res)
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
  }, [placeId, needsKey, thresholdKey, retry])

  if (isLoadingPlace) {
    return (
      <div className="page narrow">
        <div className="saarthi-card" aria-busy="true">
          <div className="skeleton skeleton-line w-40" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block" />
        </div>
      </div>
    )
  }

  if (placeError || !place) {
    return (
      <div className="page narrow">
        <div className="saarthi-card empty-state empty-state-warn" role="alert">
          <AlertTriangle size={32} className="empty-state-icon" aria-hidden="true" />
          <h2 className="empty-state-title">This place could not be loaded</h2>
          <p className="empty-state-desc">{placeError || 'It may have been removed, or the link is wrong.'}</p>
          <Link to="/" className="btn btn-primary">
            <ArrowLeft size={15} aria-hidden="true" /> Back to Explore
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page facility-page">
      <div className="detail-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Back</span>
        </button>
        <div className="facility-cta-group">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setReportFeatureId(undefined)
              setIsReportOpen(true)
            }}
          >
            <Flag size={15} aria-hidden="true" />
            <span>Report a barrier</span>
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/plan?dest=${place.id}`)}>
            <Navigation size={15} aria-hidden="true" />
            <span>Plan journey here</span>
          </button>
        </div>
      </div>

      <div className="facility-layout">
        <div className="facility-map-pane">
          <MapLibreView center={[place.longitude, place.latitude]} zoom={16} places={[place]} selectedPlaceId={place.id} disableClustering />
        </div>

        <div className="facility-content-pane">
          {/* Photos: SAARTHI never invents audit photos. Shown honestly, whether or not any exist yet. */}
          <section className="saarthi-card facility-photos" aria-label="Photo evidence">
            <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
              <ImageOff size={28} className="empty-state-icon" aria-hidden="true" />
              <p className="empty-state-desc" style={{ margin: 0 }}>
                No audit photos have been attached to this place yet. SAARTHI never invents photo evidence.
              </p>
            </div>
          </section>

          {profile.activeNeedCodes.length === 0 ? (
            <div className="saarthi-card empty-state">
              <UserCheck size={32} className="empty-state-icon" aria-hidden="true" />
              <h2 className="empty-state-title">Choose a need to check this place against</h2>
              <p className="empty-state-desc">Without at least one need that has measurable rules, SAARTHI cannot assess {place.name}. Nothing is assumed.</p>
              <button type="button" className="btn btn-primary" onClick={openProfileModal}>
                Open access profile
              </button>
            </div>
          ) : cardError ? (
            <div className="saarthi-card empty-state empty-state-warn" role="alert">
              <AlertTriangle size={32} className="empty-state-icon" aria-hidden="true" />
              <h2 className="empty-state-title">The check for {place.name} did not complete</h2>
              <p className="empty-state-desc">{cardError}</p>
              <button type="button" className="btn btn-primary" onClick={() => setRetry(n => n + 1)}>
                <RotateCcw size={15} aria-hidden="true" /> Try again
              </button>
            </div>
          ) : isCardLoading || !card ? (
            <div className="saarthi-card" aria-busy="true">
              <p className="text-muted" role="status">
                Checking the evidence for <strong>{place.name}</strong>…
              </p>
              <div className="skeleton skeleton-line w-60" />
              <div className="skeleton skeleton-block" />
              <div className="skeleton skeleton-block" />
            </div>
          ) : (
            <ServiceReadinessCard
              card={card}
              onReportIssue={featureId => {
                setReportFeatureId(featureId)
                setIsReportOpen(true)
              }}
            />
          )}
        </div>
      </div>

      <ReportIssueModal
        isOpen={isReportOpen}
        onClose={() => {
          setIsReportOpen(false)
          setReportFeatureId(undefined)
        }}
        placeId={place.id}
        placeName={place.name}
        featureId={reportFeatureId}
      />
    </div>
  )
}
