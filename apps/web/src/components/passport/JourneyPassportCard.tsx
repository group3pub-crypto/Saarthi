import React, { useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  HelpCircle,
  Info,
  Layers,
  Minus,
  Navigation,
  Phone,
  Printer,
  Share2,
  ShieldAlert,
  ShieldCheck,
  XCircle
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JourneyPlanResponse, JourneyStep } from '../../services/api'
import { describeAge, formatDate } from '../../services/evidence'
import { buildShareSummary, countSteps, serializePassport, splitSteps } from '../../services/passport'
import { describeIgnoredThresholds, featureLabel, groupRequirements, needLabel } from '../../services/requirements'
import { StatusChip } from '../common/StatusChip'
import { NextActionButton } from '../common/NextActionButton'

interface JourneyPassportProps {
  plan: JourneyPlanResponse
  onStartNavigation?: () => void
  onRequestAssistance?: () => void
  onReportBarrier?: (stepDesc: string) => void
  /** Hide actions that only make sense for the person who planned the journey. */
  readOnly?: boolean
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  verified: <CheckCircle2 size={18} aria-hidden="true" />,
  reported: <Clock size={18} aria-hidden="true" />,
  temporary_barrier: <AlertTriangle size={18} aria-hidden="true" />,
  barrier: <XCircle size={18} aria-hidden="true" />,
  unknown: <HelpCircle size={18} aria-hidden="true" />
}

export const JourneyPassportCard: React.FC<JourneyPassportProps> = ({
  plan,
  onStartNavigation,
  onRequestAssistance,
  onReportBarrier,
  readOnly = false
}) => {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<string | null>(null)

  const isConfirmed = plan.overall_status === 'confirmed'
  const counts = countSteps(plan.steps)
  const groups = splitSteps(plan.steps)
  const requirementGroups = groupRequirements(plan.requirements)
  const ignored = describeIgnoredThresholds(plan.ignored_thresholds)
  const evaluatedOn = formatDate(plan.evaluated_at)
  const covered = counts.verified + counts.reported

  const flash = (message: string) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(null), 3500)
  }

  const handleShare = async () => {
    const text = buildShareSummary(plan)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `Journey readiness: ${plan.destination_name}`, text })
        return
      }
      await navigator.clipboard.writeText(text)
      flash('Summary copied. Paste it into a message.')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      flash('Sharing is blocked in this browser. Use Export file instead.')
    }
  }

  const handleExport = () => {
    const blob = new Blob([serializePassport(plan)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'saarthi_journey_passport.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    flash('Passport file downloaded.')
  }

  const renderStep = (step: JourneyStep, index: number) => {
    const needsAttention = step.applicable && step.status !== 'verified' && step.status !== 'reported'
    const isBarrier = step.status === 'barrier' || step.status === 'temporary_barrier'
    const age = describeAge(step.observed_at)
    return (
      <li key={step.step_id || index} className={`step-card${!step.applicable ? ' is-neutral' : isBarrier ? ' is-barrier' : needsAttention ? ' is-unknown' : ''}`}>
        <div className="step-head">
          <div className="step-title">
            <span className={`step-icon ${step.applicable ? step.status : 'neutral'}`}>
              {step.applicable ? STATUS_ICON[step.status] : <Minus size={18} aria-hidden="true" />}
            </span>
            <div>
              <div className="step-tags">
                <span className="tag">{featureLabel(step.feature_type)}</span>
                {step.is_critical && step.applicable && <span className="tag tag-critical">Must pass</span>}
                {step.floor_level > 0 && <span className="tag">Floor {step.floor_level}</span>}
              </div>
              <h4>{step.description}</h4>
            </div>
          </div>
          {step.applicable ? (
            <StatusChip status={step.status} label={step.label} ageDays={step.age_days} expiresAt={step.expires_at} />
          ) : (
            <span className="status-chip neutral" title="None of the needs you chose has a rule for this kind of step, so it does not change the result.">
              <Minus size={16} aria-hidden="true" />
              <span>No requirement for your needs</span>
            </span>
          )}
        </div>

        <p className="text-secondary text-sm">{step.reason}</p>

        <div className="evidence-meta">
          {step.source && <span>Source: {step.source.replace(/_/g, ' ')}</span>}
          {step.observed_at && (
            <span className="evidence-meta-item">
              <Calendar size={12} aria-hidden="true" />
              <span>
                Observed {age} ({formatDate(step.observed_at)})
              </span>
            </span>
          )}
          {step.expires_at && <span>Valid until {formatDate(step.expires_at)}</span>}
          {!readOnly && onReportBarrier && needsAttention && (
            <button type="button" className="link-btn" onClick={() => onReportBarrier(step.description)}>
              Report a problem here
            </button>
          )}
        </div>

        {!readOnly && step.next_actions.length > 0 && (
          <div className="next-actions">
            {step.next_actions.map((act, i) => (
              <NextActionButton
                key={i}
                action={act}
                onActionClick={type => {
                  if (type === 'request_assistance' && onRequestAssistance) onRequestAssistance()
                }}
              />
            ))}
          </div>
        )}
      </li>
    )
  }

  const renderGroup = (title: string, steps: JourneyStep[], offset: number) =>
    steps.length > 0 && (
      <div className="step-group">
        <h4 className="step-group-title">{title}</h4>
        <ol className="step-list" start={offset + 1}>
          {steps.map((s, i) => renderStep(s, offset + i))}
        </ol>
      </div>
    )

  return (
    <article className={`saarthi-card passport ${isConfirmed ? 'is-confirmed' : 'is-unconfirmed'}`} aria-labelledby="passport-heading">
      <header className="passport-verdict">
        <span className="passport-icon" aria-hidden="true">
          {isConfirmed ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
        </span>
        <div className="passport-verdict-text">
          <p className="eyebrow">Journey readiness passport</p>
          <h2 id="passport-heading">{isConfirmed ? t('verdict.confirmed') : t('verdict.not_confirmed')}</h2>
          <p>{plan.summary_text}</p>
        </div>
        <div className="coverage-box">
          <span className="coverage-label">{t('verdict.confidence')}</span>
          <span className="coverage-value">{Math.round(plan.confidence_score * 100)}%</span>
          <span className="coverage-note text-sm">
            {counts.applicable > 0 ? `${covered} of ${counts.applicable} applicable steps` : 'No step could be assessed'}
          </span>
        </div>
      </header>

      <div className="count-pills" aria-label="Steps by evidence status">
        <span className="pill pill-verified">✓ {counts.verified} verified</span>
        {counts.reported > 0 && <span className="pill pill-reported">• {counts.reported} reported</span>}
        {counts.unknown > 0 && <span className="pill pill-unknown">? {counts.unknown} unknown</span>}
        {counts.barrier > 0 && <span className="pill pill-barrier">! {counts.barrier} barrier</span>}
        {counts.notApplicable > 0 && <span className="pill pill-neutral">– {counts.notApplicable} not applicable</span>}
      </div>

      {plan.route_kind === 'straight_line' && (
        <p className="callout callout-warn" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            No mapped walking route was found between these points. The dashed line and distance are a straight line, not a route you can follow.
          </span>
        </p>
      )}
      {plan.unevaluated_needs.length > 0 && (
        <p className="callout callout-warn" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>No rules exist yet for {plan.unevaluated_needs.map(needLabel).join(', ')}, so those needs did not affect this result.</span>
        </p>
      )}
      {ignored.length > 0 && (
        <p className="callout callout-note" role="note">
          <Info size={16} aria-hidden="true" />
          <span>Your {ignored.join(', ')} limit was not applied because no matching rule is active.</span>
        </p>
      )}

      <section className="passport-destination" aria-label="Destination">
        <div>
          <h3>{plan.destination_name}</h3>
          <p className="text-secondary text-sm">{plan.destination_address}</p>
          <p className="text-sm passport-facts">
            <span>{plan.route_kind === 'straight_line' ? 'Straight-line distance' : 'Walking distance'}: {Math.round(plan.total_distance_m)} m</span>
            {plan.destination_phone && (
              <a href={`tel:${plan.destination_phone}`} className="inline-link">
                <Phone size={13} aria-hidden="true" />
                <span>{plan.destination_phone}</span>
              </a>
            )}
          </p>
        </div>

        <div className="passport-tools">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleShare}>
            <Share2 size={15} aria-hidden="true" />
            <span>Share summary</span>
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport}>
            <Download size={15} aria-hidden="true" />
            <span>Export file</span>
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            <span>{t('actions.print_passport')}</span>
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {feedback}
        </p>
        {feedback && (
          <p className="callout callout-success" aria-hidden="true">
            <Check size={16} />
            <span>{feedback}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="timeline-heading">
        <h3 id="timeline-heading" className="section-title icon-title">
          <Layers size={18} aria-hidden="true" />
          <span>What was checked ({plan.steps.length})</span>
        </h3>
        {plan.steps.length === 0 ? (
          <div className="empty-state empty-state-warn">
            <HelpCircle size={28} className="empty-state-icon" aria-hidden="true" />
            <p className="empty-state-title">No checkable steps are recorded for this destination</p>
            <p className="empty-state-desc">Nothing can be confirmed until its entrance, route and facilities are audited.</p>
          </div>
        ) : (
          <>
            {renderGroup('On the way', groups.route, 0)}
            {renderGroup('At the destination', groups.destination, groups.route.length)}
          </>
        )}
      </section>

      {requirementGroups.length > 0 && (
        <details className="disclosure">
          <summary>Requirements applied to this result</summary>
          <ul className="requirement-list">
            {requirementGroups.map(group => (
              <li key={group.needCode}>
                <strong>{group.label}</strong>
                <ul>
                  {group.rows.map((row, i) => (
                    <li key={i}>
                      {row.text}
                      {row.customised && <span className="pill pill-brand">your value{row.standard ? ` (standard ${row.standard})` : ''}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="passport-foot">
        {evaluatedOn && (
          <p className="text-muted text-sm">
            Checked on {evaluatedOn}. Evidence expires, so check again before you travel.
          </p>
        )}
        <p className="text-muted text-sm">
          <Info size={13} aria-hidden="true" /> {plan.limits_notice}
        </p>
      </footer>

      {!readOnly && (onStartNavigation || plan.next_actions.length > 0) && (
        <div className="passport-actions">
          {onStartNavigation && (
            <button type="button" className="btn btn-primary btn-lg" onClick={onStartNavigation}>
              <Navigation size={18} aria-hidden="true" />
              <span>{t('actions.start_navigation')}</span>
            </button>
          )}
          {plan.next_actions.map((act, i) => (
            <NextActionButton
              key={i}
              action={act}
              onActionClick={type => {
                if (type === 'request_assistance' && onRequestAssistance) onRequestAssistance()
              }}
            />
          ))}
        </div>
      )}
    </article>
  )
}
