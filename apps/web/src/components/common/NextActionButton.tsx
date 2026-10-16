import React, { useState } from 'react'
import { Phone, Copy, Check, LifeBuoy, MapPin, Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NextActionProps {
  action: {
    action_type: string
    title: string
    details: string
    phone?: string
  }
  onActionClick?: (actionType: string) => void
}

export const NextActionButton: React.FC<NextActionProps> = ({ action, onActionClick }) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopyScript = () => {
    navigator.clipboard.writeText(action.details).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const renderButtonContent = () => {
    switch (action.action_type) {
      case 'call_helpdesk':
        return (
          <a
            href={action.phone ? `tel:${action.phone}` : '#'}
            className="btn-secondary"
            aria-label={`${t('actions.call_helpdesk')}: ${action.phone || 'Number unavailable'}`}
            style={{ textDecoration: 'none' }}
          >
            <Phone size={18} aria-hidden="true" />
            <span>{action.title || t('actions.call_helpdesk')}</span>
          </a>
        )

      case 'call_ahead_script':
        return (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCopyScript}
            aria-label={`${t('actions.call_ahead_script')}: ${action.details}`}
          >
            {copied ? <Check size={18} color="#10b981" aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
            <span>{copied ? 'Script Copied to Clipboard!' : (action.title || t('actions.call_ahead_script'))}</span>
            <span className="sr-only" aria-live="polite">
              {copied ? 'Call ahead script copied to clipboard successfully' : ''}
            </span>
          </button>
        )

      case 'request_assistance':
        return (
          <button
            type="button"
            className="btn-primary"
            onClick={() => onActionClick && onActionClick('request_assistance')}
            aria-label={action.title || t('actions.request_assistance')}
          >
            <LifeBuoy size={18} aria-hidden="true" />
            <span>{action.title || t('actions.request_assistance')}</span>
          </button>
        )

      case 'alternative_entrance':
        return (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onActionClick && onActionClick('alternative_entrance')}
            aria-label={action.title || t('actions.alternative_entrance')}
          >
            <Compass size={18} aria-hidden="true" />
            <span>{action.title || t('actions.alternative_entrance')}</span>
          </button>
        )

      case 'nearest_alternative':
      default:
        return (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onActionClick && onActionClick(action.action_type)}
            aria-label={action.title || t('actions.nearest_alternative')}
          >
            <MapPin size={18} aria-hidden="true" />
            <span>{action.title || t('actions.nearest_alternative')}</span>
          </button>
        )
    }
  }

  return (
    <div style={{ display: 'inline-block', margin: '0.25rem 0.25rem 0.25rem 0' }}>
      {renderButtonContent()}
    </div>
  )
}
