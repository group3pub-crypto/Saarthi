import React, { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Share2,
  Printer,
  Info,
  Layers,
  Check,
  AlertTriangle,
  Clock,
  HelpCircle,
  XCircle,
  CheckCircle2,
  Phone,
  Navigation,
  Calendar
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JourneyPlanResponse } from '../../services/api'
import { StatusChip } from '../common/StatusChip'
import { NextActionButton } from '../common/NextActionButton'

interface JourneyPassportProps {
  plan: JourneyPlanResponse
  onStartNavigation?: () => void
  onRequestAssistance?: () => void
  onReportBarrier?: (stepDesc: string) => void
}

export const JourneyPassportCard: React.FC<JourneyPassportProps> = ({
  plan,
  onStartNavigation,
  onRequestAssistance,
  onReportBarrier
}) => {
  const { t } = useTranslation()
  const [shareCopied, setShareCopied] = useState(false)

  const isConfirmed = plan.overall_status === 'confirmed'

  const verifiedCount = plan.steps.filter(s => s.status === 'verified').length
  const reportedCount = plan.steps.filter(s => s.status === 'reported').length
  const unknownCount = plan.steps.filter(s => s.status === 'unknown').length
  const barrierCount = plan.steps.filter(s => s.status === 'barrier' || s.status === 'temporary_barrier').length

  const handleShare = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 size={18} color="var(--status-verified-text)" aria-hidden="true" />
      case 'reported':
        return <Clock size={18} color="var(--status-reported-text)" aria-hidden="true" />
      case 'temporary_barrier':
        return <AlertTriangle size={18} color="var(--status-temp-barrier-text)" aria-hidden="true" />
      case 'barrier':
        return <XCircle size={18} color="var(--status-barrier-text)" aria-hidden="true" />
      case 'unknown':
      default:
        return <HelpCircle size={18} color="var(--status-unknown-text)" aria-hidden="true" />
    }
  }

  return (
    <article
      className="saarthi-card"
      style={{
        border: `2px solid ${isConfirmed ? 'var(--status-verified-border)' : 'var(--status-barrier-border)'}`,
        backgroundColor: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}
      aria-labelledby="passport-heading"
    >
      {/* Signature Verdict Banner */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: isConfirmed ? 'var(--status-verified-bg)' : 'var(--status-barrier-bg)',
          border: `1.5px solid ${isConfirmed ? 'var(--status-verified-border)' : 'var(--status-barrier-border)'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isConfirmed ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '8px', borderRadius: '50%' }}>
                <ShieldCheck size={36} color="var(--status-verified-text)" aria-hidden="true" />
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '50%' }}>
                <ShieldAlert size={36} color="var(--status-barrier-text)" aria-hidden="true" />
              </div>
            )}
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em', color: isConfirmed ? 'var(--status-verified-text)' : 'var(--status-barrier-text)' }}>
                JOURNEY READINESS PASSPORT
              </span>
              <h2 id="passport-heading" style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.2 }}>
                {isConfirmed ? t('verdict.confirmed') : t('verdict.not_confirmed')}
              </h2>
            </div>
          </div>

          {/* Freshness / Confidence Score Badge */}
          <div
            style={{
              textAlign: 'right',
              background: 'var(--bg-card)',
              padding: '0.5rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
              {t('verdict.confidence')}
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: isConfirmed ? 'var(--status-verified-text)' : 'var(--status-temp-barrier-text)' }}>
              {Math.round(plan.confidence_score * 100)}%
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.925rem', fontWeight: 500, lineHeight: 1.5, color: 'var(--text-primary)' }}>
          {plan.summary_text}
        </p>

        {/* Step Status Summary Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingTop: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--status-verified-bg)', border: '1px solid var(--status-verified-border)', color: 'var(--status-verified-text)', fontWeight: 700 }}>
            ✓ {verifiedCount} Verified Steps
          </span>
          {reportedCount > 0 && (
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--status-reported-bg)', border: '1px solid var(--status-reported-border)', color: 'var(--status-reported-text)', fontWeight: 700 }}>
              ⏱ {reportedCount} Citizen Reported
            </span>
          )}
          {unknownCount > 0 && (
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--status-unknown-bg)', border: '1px solid var(--status-unknown-border)', color: 'var(--status-unknown-text)', fontWeight: 700 }}>
              ? {unknownCount} Unknown
            </span>
          )}
          {barrierCount > 0 && (
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: 'var(--status-barrier-bg)', border: '1px solid var(--status-barrier-border)', color: 'var(--status-barrier-text)', fontWeight: 700 }}>
              ✕ {barrierCount} Known Barrier
            </span>
          )}
        </div>

        {/* Legal Decision Support Notice */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
          <Info size={13} aria-hidden="true" />
          <span>{plan.limits_notice}</span>
        </div>
      </div>

      {/* Destination & Action Quickbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{plan.destination_name}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{plan.destination_address}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Total Pedestrian Distance: {Math.round(plan.total_distance_m)} m
            </span>
            {plan.destination_phone && (
              <a
                href={`tel:${plan.destination_phone}`}
                style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Phone size={13} aria-hidden="true" />
                <span>Call facility: {plan.destination_phone}</span>
              </a>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleShare}
            aria-label="Share Passport link"
            title="Copy shareable passport link"
            style={{ fontSize: '0.85rem' }}
          >
            {shareCopied ? <Check size={15} color="#10b981" aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}
            <span>{shareCopied ? 'Link Copied!' : t('actions.share_passport')}</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePrint}
            aria-label="Print or save as PDF"
            title="Print or export passport"
            style={{ fontSize: '0.85rem' }}
          >
            <Printer size={15} aria-hidden="true" />
            <span>{t('actions.print_passport')}</span>
          </button>
        </div>
      </div>

      {/* Signature Step Timeline */}
      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Layers size={18} color="var(--accent-primary)" aria-hidden="true" />
          <span>Route Timeline Verification ({plan.steps.length} Steps)</span>
        </h3>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {plan.steps.map((step, idx) => {
            const isBarrier = step.status === 'barrier' || step.status === 'temporary_barrier'
            const isUnknown = step.status === 'unknown'

            return (
              <div
                key={step.step_id || idx}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: isBarrier
                    ? '1.5px solid var(--status-barrier-border)'
                    : isUnknown
                    ? '1.5px solid var(--status-unknown-border)'
                    : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* Step Top Bar: Icon, Number, Description, Badges, StatusChip */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', flex: 1, minWidth: '240px' }}>
                    <div style={{ marginTop: '2px', background: 'var(--bg-elevated)', padding: '5px', borderRadius: 'var(--radius-sm)' }}>
                      {getStepStatusIcon(step.status)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--accent-primary)', fontSize: '0.85rem' }}>
                          STEP {idx + 1}
                        </span>
                        {step.is_critical && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-barrier-text)', border: '1px solid var(--status-barrier-border)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                            CRITICAL PATH
                          </span>
                        )}
                        {step.floor_level > 0 && (
                          <span style={{ fontSize: '0.72rem', background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                            Floor {step.floor_level}
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          ({step.feature_type.replace('_', ' ')})
                        </span>
                      </div>
                      <h4 style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.15rem' }}>
                        {step.description}
                      </h4>
                    </div>
                  </div>

                  <StatusChip
                    status={step.status}
                    label={step.label}
                    ageDays={step.age_days}
                    expiresAt={step.expires_at}
                  />
                </div>

                {/* Step details and rationale */}
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginLeft: '2.3rem' }}>
                  {step.reason}
                </p>

                {/* Evidence Metadata: Source, Observed, Expiration */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '2.3rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.4rem' }}>
                  {step.source && (
                    <span>Source: <strong>{step.source.toUpperCase()}</strong></span>
                  )}
                  {step.observed_at && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Calendar size={12} aria-hidden="true" />
                      <span>Observed: {new Date(step.observed_at).toLocaleDateString()}</span>
                    </span>
                  )}
                  {step.expires_at && (
                    <span>Expires: {new Date(step.expires_at).toLocaleDateString()}</span>
                  )}

                  {onReportBarrier && (isBarrier || isUnknown) && (
                    <button
                      type="button"
                      onClick={() => onReportBarrier(step.description)}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        color: 'var(--status-temp-barrier-text)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Report Obstruction Here
                    </button>
                  )}
                </div>

                {/* Step Next Actions */}
                {step.next_actions && step.next_actions.length > 0 && (
                  <div style={{ marginLeft: '2.3rem', marginTop: '0.25rem' }}>
                    {step.next_actions.map((act, aIdx) => (
                      <NextActionButton
                        key={aIdx}
                        action={act}
                        onActionClick={actType => {
                          if (actType === 'request_assistance' && onRequestAssistance) onRequestAssistance()
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Primary Action Button (Start Navigation or Fallback) */}
      <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {onStartNavigation && (
          <button
            type="button"
            className="btn-primary"
            onClick={onStartNavigation}
            style={{ flex: 1, minHeight: '46px', fontSize: '0.95rem' }}
          >
            <Navigation size={18} aria-hidden="true" />
            <span>{t('actions.start_navigation')}</span>
          </button>
        )}

        {/* Global Fallback Actions */}
        {plan.next_actions && plan.next_actions.map((act, i) => (
          <NextActionButton
            key={i}
            action={act}
            onActionClick={actType => {
              if (actType === 'request_assistance' && onRequestAssistance) onRequestAssistance()
            }}
          />
        ))}
      </div>
    </article>
  )
}
