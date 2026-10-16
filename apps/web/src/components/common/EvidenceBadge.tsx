import React from 'react'
import { XCircle, CheckCircle2, HelpCircle, Clock } from 'lucide-react'
import { EVIDENCE_STATE_INFO, type EvidenceState } from '../../services/evidence'

const ICONS: Record<EvidenceState, React.ReactNode> = {
  verified: <CheckCircle2 size={14} aria-hidden="true" />,
  reported: <Clock size={14} aria-hidden="true" />,
  unknown: <HelpCircle size={14} aria-hidden="true" />,
  known_barrier: <XCircle size={14} aria-hidden="true" />
}

interface EvidenceBadgeProps {
  state: EvidenceState
  /** Show the one-sentence explanation under the label. */
  showExplanation?: boolean
}

/**
 * Describes the evidence on file for a place. It is never a statement that the
 * place is accessible, which needs a journey check against someone's needs.
 */
export const EvidenceBadge: React.FC<EvidenceBadgeProps> = ({ state, showExplanation = false }) => {
  const info = EVIDENCE_STATE_INFO[state]
  return (
    <span className={`evidence-badge state-${state}`} title={info.explanation}>
      <span className="evidence-badge-label">
        {ICONS[state]}
        <span>{info.label}</span>
      </span>
      {showExplanation ? (
        <span className="evidence-badge-note">{info.explanation}</span>
      ) : (
        <span className="sr-only">. {info.explanation}</span>
      )}
    </span>
  )
}
