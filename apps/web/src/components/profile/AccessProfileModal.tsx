import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, Info, Lock, RotateCcw, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccessProfile } from '../../context/AccessProfileContext'
import { getRequirements, type RequirementsResponse } from '../../services/api'
import {
  PRESET_KEYS,
  createDefaultProfile,
  STANDARD_THRESHOLDS,
  THRESHOLD_LIMITS,
  deriveNeedCodes,
  informationalPresets,
  normalizeThresholds,
  thresholdPreferences,
  type CustomThresholds
} from '../../services/profile'
import { describeIgnoredThresholds, groupRequirements, needLabel } from '../../services/requirements'

interface AccessProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

type Notice = { tone: 'success' | 'error'; text: string } | null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const AccessProfileModal: React.FC<AccessProfileModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const { profile, hasSavedProfile, saveProfile, deleteProfile, exportProfileJSON, importProfileJSON } =
    useAccessProfile()

  const [presets, setPresets] = useState<string[]>(profile.presets)
  const [thresholds, setThresholds] = useState<CustomThresholds>(profile.customThresholds)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [requirements, setRequirements] = useState<RequirementsResponse | null>(null)
  const [requirementsError, setRequirementsError] = useState(false)
  const [requirementsLoading, setRequirementsLoading] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // Start every opening from what is stored; edits stay a draft until saved.
  useEffect(() => {
    if (!isOpen) return
    setPresets(profile.presets)
    setThresholds(profile.customThresholds)
    setConfirmDelete(false)
    setNotice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Focus handling: move focus into the dialog and give it back on close.
  useEffect(() => {
    if (!isOpen) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => returnFocusRef.current?.focus?.()
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  // Escape also works when focus has left the dialog.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const draftNeedCodes = useMemo(() => deriveNeedCodes(presets, thresholds), [presets, thresholds])
  const draftThresholdPrefs = useMemo(() => thresholdPreferences(normalizeThresholds(thresholds)), [thresholds])
  const informational = useMemo(() => informationalPresets(presets), [presets])

  // The summary comes from the server's rule table, so it can never drift from what is evaluated.
  useEffect(() => {
    if (!isOpen) return
    if (draftNeedCodes.length === 0) {
      setRequirements(null)
      setRequirementsError(false)
      return
    }
    const controller = new AbortController()
    setRequirementsLoading(true)
    const timer = window.setTimeout(() => {
      getRequirements(draftNeedCodes, draftThresholdPrefs, controller.signal)
        .then(r => {
          setRequirements(r)
          setRequirementsError(false)
        })
        .catch(err => {
          if (controller.signal.aborted || (err as Error).name === 'AbortError') return
          setRequirementsError(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setRequirementsLoading(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [isOpen, draftNeedCodes, draftThresholdPrefs])

  if (!isOpen) return null

  const dirty =
    JSON.stringify([presets, normalizeThresholds(thresholds)]) !==
    JSON.stringify([profile.presets, profile.customThresholds])

  const togglePreset = (key: string) => {
    setPresets(prev => (prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]))
    setNotice(null)
  }

  const setThreshold = <K extends keyof CustomThresholds>(key: K, value: CustomThresholds[K] | undefined) => {
    setThresholds(prev => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
    setNotice(null)
  }

  const handleSave = async () => {
    await saveProfile({ presets, customThresholds: normalizeThresholds(thresholds) })
    setNotice({ tone: 'success', text: t('profile.saved') })
  }

  const handleDelete = async () => {
    await deleteProfile()
    const fallback = createDefaultProfile()
    setPresets(fallback.presets)
    setThresholds(fallback.customThresholds)
    setConfirmDelete(false)
    setNotice({ tone: 'success', text: t('profile.deleted') })
  }

  const handleExport = () => {
    const blob = new Blob([exportProfileJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'saarthi_access_profile.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', text: t('profile.exported') })
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 20_000) {
      setNotice({ tone: 'error', text: t('profile.importTooLarge') })
      return
    }
    const result = await importProfileJSON(await file.text())
    if (result.ok) {
      setNotice({
        tone: 'success',
        text: [t('profile.imported'), ...result.warnings].join(' ')
      })
    } else {
      setNotice({ tone: 'error', text: result.error })
    }
  }

  const ramp = THRESHOLD_LIMITS.maxRampSlopePct
  const door = THRESHOLD_LIMITS.minDoorWidthCm
  const kerb = THRESHOLD_LIMITS.maxKerbHeightCm
  const rampValue = thresholds.maxRampSlopePct ?? STANDARD_THRESHOLDS.maxRampSlopePct
  const doorValue = thresholds.minDoorWidthCm ?? STANDARD_THRESHOLDS.minDoorWidthCm
  const groups = requirements ? groupRequirements(requirements.requirements) : []
  const ignored = requirements ? describeIgnoredThresholds(requirements.ignored_thresholds) : []

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-profile-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <div>
            <h2 id="access-profile-title" className="modal-title">
              {t('profile.title')}
            </h2>
            <p className="text-muted text-sm">{t('profile.subtitle')}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('profile.closeLabel')}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="modal-body">
          <p className="callout callout-info">
            <Lock size={16} aria-hidden="true" />
            <span>{t('profile.privacy')}</span>
          </p>

          <div className="profile-status" aria-live="polite">
            <span className={`pill ${hasSavedProfile ? 'pill-brand' : 'pill-neutral'}`}>
              {hasSavedProfile ? t('profile.statusSaved') : t('profile.statusNotSaved')}
            </span>
            {dirty && <span className="pill pill-warn">{t('profile.unsaved')}</span>}
          </div>

          <section aria-labelledby="needs-heading" className="profile-section">
            <h3 id="needs-heading" className="section-title">
              {t('profile.selectPresets')}
              <span className="text-muted"> ({presets.length})</span>
            </h3>
            <p className="text-muted text-sm">{t('profile.combineHint')}</p>
            <div className="preset-grid">
              {PRESET_KEYS.map(key => {
                const active = presets.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className={`preset-card${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => togglePreset(key)}
                  >
                    <span className="preset-name">
                      {t(`presets.${key}.name`)}
                      {active && <Check size={16} aria-hidden="true" />}
                    </span>
                    <span className="text-muted text-sm">{t(`presets.${key}.desc`)}</span>
                  </button>
                )
              })}
            </div>
            {informational.length > 0 && (
              <p className="callout callout-note">
                <Info size={16} aria-hidden="true" />
                <span>{t('profile.informationalNote')}</span>
              </p>
            )}
          </section>

          <section aria-labelledby="limits-heading" className="profile-section">
            <h3 id="limits-heading" className="section-title">
              {t('profile.customThresholds')}
            </h3>
            <p className="text-muted text-sm">{t('profile.thresholdHint')}</p>

            <div className="field">
              <label htmlFor="ramp-slope">
                {t('profile.rampLabel')}: <strong>{rampValue}%</strong>
              </label>
              <input
                id="ramp-slope"
                type="range"
                min={ramp.min}
                max={ramp.max}
                step={ramp.step}
                value={rampValue}
                onChange={e => setThreshold('maxRampSlopePct', parseFloat(e.target.value))}
              />
              <span className="text-muted text-sm">
                {thresholds.maxRampSlopePct === undefined || thresholds.maxRampSlopePct === STANDARD_THRESHOLDS.maxRampSlopePct
                  ? t('profile.usingStandard', { value: `${STANDARD_THRESHOLDS.maxRampSlopePct}%` })
                  : t('profile.customValue', { value: `${STANDARD_THRESHOLDS.maxRampSlopePct}%` })}
              </span>
            </div>

            <div className="field">
              <label htmlFor="door-width">
                {t('profile.doorLabel')}: <strong>{doorValue} cm</strong>
              </label>
              <input
                id="door-width"
                type="range"
                min={door.min}
                max={door.max}
                step={door.step}
                value={doorValue}
                onChange={e => setThreshold('minDoorWidthCm', parseFloat(e.target.value))}
              />
              <span className="text-muted text-sm">
                {thresholds.minDoorWidthCm === undefined || thresholds.minDoorWidthCm === STANDARD_THRESHOLDS.minDoorWidthCm
                  ? t('profile.usingStandard', { value: `${STANDARD_THRESHOLDS.minDoorWidthCm} cm` })
                  : t('profile.customValue', { value: `${STANDARD_THRESHOLDS.minDoorWidthCm} cm` })}
              </span>
            </div>

            <div className="field">
              <label className="check-row" htmlFor="kerb-enabled">
                <input
                  id="kerb-enabled"
                  type="checkbox"
                  checked={thresholds.maxKerbHeightCm !== undefined}
                  onChange={e => setThreshold('maxKerbHeightCm', e.target.checked ? 5 : undefined)}
                />
                <span>{t('profile.kerbToggle')}</span>
              </label>
              {thresholds.maxKerbHeightCm !== undefined && (
                <>
                  <label htmlFor="kerb-height">
                    {t('profile.kerbLabel')}: <strong>{thresholds.maxKerbHeightCm} cm</strong>
                  </label>
                  <input
                    id="kerb-height"
                    type="range"
                    min={kerb.min}
                    max={kerb.max}
                    step={kerb.step}
                    value={thresholds.maxKerbHeightCm}
                    onChange={e => setThreshold('maxKerbHeightCm', parseFloat(e.target.value))}
                  />
                </>
              )}
            </div>

            <label className="check-row" htmlFor="require-stepfree">
              <input
                id="require-stepfree"
                type="checkbox"
                checked={thresholds.requireLift === true}
                onChange={e => setThreshold('requireLift', e.target.checked ? true : undefined)}
              />
              <span>{t('profile.stepFreeToggle')}</span>
            </label>
            <label className="check-row" htmlFor="require-tactile">
              <input
                id="require-tactile"
                type="checkbox"
                checked={thresholds.requireTactile === true}
                onChange={e => setThreshold('requireTactile', e.target.checked ? true : undefined)}
              />
              <span>{t('profile.tactileToggle')}</span>
            </label>
            <label className="check-row" htmlFor="require-audio">
              <input
                id="require-audio"
                type="checkbox"
                checked={thresholds.requireAudioSignal === true}
                onChange={e => setThreshold('requireAudioSignal', e.target.checked ? true : undefined)}
              />
              <span>{t('profile.audioToggle')}</span>
            </label>
          </section>

          <section aria-labelledby="summary-heading" className="profile-section">
            <h3 id="summary-heading" className="section-title">
              {t('profile.summaryTitle')}
            </h3>

            {draftNeedCodes.length === 0 ? (
              <p className="callout callout-warn">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{t('profile.noEvaluableNeeds')}</span>
              </p>
            ) : (
              <>
                <p className="text-sm">
                  {t('profile.evaluatedFor')}{' '}
                  {draftNeedCodes.map(code => (
                    <span key={code} className="pill pill-neutral">
                      {needLabel(code)}
                    </span>
                  ))}
                </p>
                {requirementsLoading && !requirements && <p className="text-muted text-sm">{t('profile.loadingRules')}</p>}
                {requirementsError && (
                  <p className="callout callout-warn">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{t('profile.rulesUnavailable')}</span>
                  </p>
                )}
                {groups.length > 0 && (
                  <ul className="requirement-list">
                    {groups.map(group => (
                      <li key={group.needCode}>
                        <strong>{group.label}</strong>
                        <ul>
                          {group.rows.map((row, i) => (
                            <li key={i}>
                              {row.text}
                              {row.customised && (
                                <span className="pill pill-brand">
                                  {t('profile.customised')}
                                  {row.standard ? ` (${t('profile.standard')}: ${row.standard})` : ''}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                {requirements && requirements.unevaluated_needs.length > 0 && (
                  <p className="callout callout-warn">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>
                      {t('profile.unevaluated', {
                        needs: requirements.unevaluated_needs.map(needLabel).join(', ')
                      })}
                    </span>
                  </p>
                )}
                {ignored.length > 0 && (
                  <p className="callout callout-note">
                    <Info size={16} aria-hidden="true" />
                    <span>{t('profile.ignoredThresholds', { list: ignored.join(', ') })}</span>
                  </p>
                )}
              </>
            )}
          </section>

          {notice && (
            <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`callout callout-${notice.tone === 'error' ? 'danger' : 'success'}`}>
              {notice.tone === 'error' ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              <span>{notice.text}</span>
            </p>
          )}
        </div>

        <footer className="modal-footer">
          <div className="modal-footer-group">
            <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={!hasSavedProfile}>
              <Download size={16} aria-hidden="true" />
              <span>{t('profile.export')}</span>
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} aria-label={t('profile.importLabel')} />
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={16} aria-hidden="true" />
              <span>{t('profile.import')}</span>
            </button>
            {!confirmDelete ? (
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)} disabled={!hasSavedProfile}>
                <Trash2 size={16} aria-hidden="true" />
                <span>{t('profile.clear')}</span>
              </button>
            ) : (
              <span className="confirm-inline" role="group" aria-label={t('profile.confirmDeleteTitle')}>
                <span className="text-sm">{t('profile.confirmDelete')}</span>
                <button type="button" className="btn btn-danger" onClick={handleDelete}>
                  {t('profile.confirmYes')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                  {t('profile.confirmNo')}
                </button>
              </span>
            )}
          </div>

          <div className="modal-footer-group">
            {dirty && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPresets(profile.presets)
                  setThresholds(profile.customThresholds)
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                <span>{t('profile.discard')}</span>
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('profile.close')}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty && hasSavedProfile}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{t('profile.save')}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
