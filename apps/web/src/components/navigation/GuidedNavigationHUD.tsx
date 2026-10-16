import React, { useState, useEffect } from 'react'
import { Volume2, VolumeX, AlertOctagon, ChevronRight, ChevronLeft, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JourneyPlanResponse } from '../../services/api'
import { SpeechService } from '../../services/speech'
import { useAccessibility } from '../../context/AccessibilityContext'

interface GuidedNavigationHUDProps {
  plan: JourneyPlanResponse
  onClose: () => void
  onHitBarrier: (currentStepDescription: string) => void
}

export const GuidedNavigationHUD: React.FC<GuidedNavigationHUDProps> = ({
  plan,
  onClose,
  onHitBarrier
}) => {
  const { i18n } = useTranslation()
  const { speechDirections } = useAccessibility()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [audioEnabled, setAudioEnabled] = useState(speechDirections)

  const steps = plan.steps || []
  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1

  // Announce current step when index changes
  useEffect(() => {
    if (currentStep && audioEnabled) {
      const lang = i18n.language.startsWith('hi') ? 'hi-IN' : (i18n.language.startsWith('mr') ? 'mr-IN' : 'en-IN')
      const announcement = `Step ${currentStepIndex + 1}. ${currentStep.description}. ${currentStep.reason}`
      SpeechService.speak(announcement, lang)
    }
  }, [currentStepIndex, audioEnabled, i18n.language])

  const handleNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  return (
    <div
      role="region"
      aria-label="Active Guided Navigation"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '600px',
        width: 'calc(100% - 2rem)',
        backgroundColor: 'var(--bg-card)',
        border: '3px solid var(--accent-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem'
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapPin size={20} color="var(--accent-primary)" aria-hidden="true" />
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--accent-primary)' }}>
            GUIDED NAVIGATION — STEP {currentStepIndex + 1} OF {steps.length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            aria-label={audioEnabled ? 'Mute spoken audio directions' : 'Enable spoken audio directions'}
            className="theme-toggle-btn"
          >
            {audioEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="theme-toggle-btn"
            aria-label="Exit guided navigation mode"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Main Step Instruction */}
      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
          {currentStep ? currentStep.description : 'Approaching destination'}
        </h3>
        {currentStep && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            {currentStep.reason}
          </p>
        )}
      </div>

      {/* Navigation Controls & Barrier Alert */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePrevStep}
            disabled={currentStepIndex === 0}
            style={{ opacity: currentStepIndex === 0 ? 0.5 : 1 }}
            aria-label="Previous navigation step"
          >
            <ChevronLeft size={18} aria-hidden="true" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleNextStep}
            disabled={isLastStep}
            aria-label={isLastStep ? 'Reached destination' : 'Next navigation step'}
          >
            <span>{isLastStep ? 'Reached Destination' : 'Next Step'}</span>
            {!isLastStep && <ChevronRight size={18} aria-hidden="true" />}
          </button>
        </div>

        {/* Immediate One-Tap Barrier Button */}
        <button
          type="button"
          onClick={() => onHitBarrier(currentStep?.description || 'Current step')}
          style={{
            backgroundColor: 'var(--status-barrier-bg)',
            color: 'var(--status-barrier-text)',
            border: '2px solid var(--status-barrier-border)',
            padding: '0.6rem 0.9rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem'
          }}
          aria-label="Report that you hit an unflagged barrier on this step immediately"
        >
          <AlertOctagon size={18} aria-hidden="true" />
          <span>Hit an Unflagged Barrier!</span>
        </button>
      </div>
    </div>
  )
}
