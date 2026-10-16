import React, { useState } from 'react'
import { Check, Compass, Copy, LifeBuoy, MapPin, Phone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NextActionItem } from '../../services/api'

interface NextActionProps {
  action: NextActionItem
  onActionClick?: (actionType: string) => void
}

/** Actions that are fully handled here: calling, or copying text for the person to send. */
export const NextActionButton: React.FC<NextActionProps> = ({ action, onActionClick }) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
    window.setTimeout(() => setCopied(null), 3000)
  }

  const copyText = action.action_type === 'call_ahead_script' ? action.script : action.message
  const label = action.title || t(`actions.${action.action_type}`, { defaultValue: 'Next step' })

  let control: React.ReactNode

  if (action.action_type === 'call_helpdesk') {
    control = action.phone ? (
      <a href={`tel:${action.phone}`} className="btn btn-secondary btn-sm" aria-label={`${label}: ${action.phone}`}>
        <Phone size={16} aria-hidden="true" />
        <span>{label}</span>
      </a>
    ) : (
      <span className="text-muted text-sm">{label}: no phone number is on file.</span>
    )
  } else if (action.action_type === 'call_ahead_script' || action.action_type === 'request_assistance') {
    const Icon = action.action_type === 'call_ahead_script' ? Copy : LifeBuoy
    control = copyText ? (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(copyText)}>
        {copied === 'ok' ? <Check size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
        <span>{copied === 'ok' ? t('actions.copied', { defaultValue: 'Copied' }) : label}</span>
      </button>
    ) : (
      <span className="text-muted text-sm">{action.details}</span>
    )
  } else if (onActionClick) {
    const Icon = action.action_type === 'alternative_entrance' ? Compass : MapPin
    control = (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onActionClick(action.action_type)}>
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
      </button>
    )
  } else {
    // Nothing to run for this kind of action, so show it as guidance instead of a dead button.
    control = (
      <span className="text-sm">
        <strong>{label}.</strong> {action.details}
      </span>
    )
  }

  return (
    <div className="next-action">
      {control}
      <span className="sr-only" role="status" aria-live="polite">
        {copied === 'ok' ? 'Copied to clipboard' : copied === 'failed' ? 'Could not copy' : ''}
      </span>
      {copied === 'failed' && <span className="text-sm text-danger">Copy is blocked in this browser. Select the text instead.</span>}
      {copyText && <p className="next-action-preview text-muted text-sm">{copyText}</p>}
    </div>
  )
}
