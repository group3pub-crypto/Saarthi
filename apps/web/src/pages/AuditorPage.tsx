import React, { useState, useEffect } from 'react'
import {
  ClipboardCheck,
  CheckCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  UserCheck,
  Clock,
  Layers,
  Sparkles,
  Search,
  ArrowRight
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  getAuditAssignments,
  getAttributeDefinitions,
  syncAuditsBatch,
  getVerificationQueue,
  approveEvidence,
  rejectEvidence,
  getReauditQueue,
  type AuditAssignment,
  type AttributeDefinition,
  type EvidenceQueueItem,
  type ReauditQueueItem
} from '../services/api'
import {
  saveOfflineAudit,
  getOfflineAudits,
  clearOfflineAudits,
  type OfflineAudit
} from '../services/idb'

export const AuditorPage: React.FC = () => {
  const { user, token, login, logout } = useAuth()

  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false)

  // App tabs & offline state
  const [activeTab, setActiveTab] = useState<'assignments' | 'checklist' | 'verification' | 'reaudit'>('assignments')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isTrainingMode, setIsTrainingMode] = useState(false)
  const [offlineAudits, setOfflineAudits] = useState<OfflineAudit[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Assignments & search
  const [assignments, setAssignments] = useState<AuditAssignment[]>([])
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<AuditAssignment | null>(null)

  // Checklist form
  const [featureType, setFeatureType] = useState('entrance')
  const [featureName, setFeatureName] = useState('Main Entrance')
  const [attrDefs, setAttrDefs] = useState<AttributeDefinition[]>([])
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [auditNote, setAuditNote] = useState('')
  const [isSavingAudit, setIsSavingAudit] = useState(false)

  // Verification queue
  const [verificationQueue, setVerificationQueue] = useState<EvidenceQueueItem[]>([])
  const [isLoadingQueue, setIsLoadingQueue] = useState(false)
  const [verifierNotes, setVerifierNotes] = useState<Record<string, string>>({})
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null)

  // Re-audit queue
  const [reauditQueue, setReauditQueue] = useState<ReauditQueueItem[]>([])
  const [isLoadingReaudit, setIsLoadingReaudit] = useState(false)

  // Network listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load offline audits count
  const refreshOfflineAudits = async () => {
    const list = await getOfflineAudits()
    setOfflineAudits(list)
  }

  useEffect(() => {
    refreshOfflineAudits()
  }, [])

  // Load assignments
  useEffect(() => {
    if (!token) return
    setIsLoadingAssignments(true)
    getAuditAssignments(token)
      .then(res => {
        setAssignments(res)
        setIsLoadingAssignments(false)
      })
      .catch(() => setIsLoadingAssignments(false))
  }, [token])

  // Load attribute definitions when featureType changes
  useEffect(() => {
    getAttributeDefinitions(featureType)
      .then(defs => {
        setAttrDefs(defs)
        // Set defaults
        const defaults: Record<string, any> = {}
        defs.forEach(d => {
          if (d.value_type === 'number') defaults[d.key] = 0
          else if (d.value_type === 'boolean') defaults[d.key] = true
          else if (d.value_type === 'enum') defaults[d.key] = 'flush'
          else defaults[d.key] = ''
        })
        setFormValues(defaults)
      })
      .catch(() => setAttrDefs([]))
  }, [featureType])

  // Load verification queue
  const loadVerification = () => {
    if (!token) return
    setIsLoadingQueue(true)
    getVerificationQueue(token)
      .then(q => {
        setVerificationQueue(q)
        setIsLoadingQueue(false)
      })
      .catch(() => setIsLoadingQueue(false))
  }

  // Load reaudit queue
  const loadReaudit = () => {
    if (!token) return
    setIsLoadingReaudit(true)
    getReauditQueue(token)
      .then(r => {
        setReauditQueue(r)
        setIsLoadingReaudit(false)
      })
      .catch(() => setIsLoadingReaudit(false))
  }

  useEffect(() => {
    if (activeTab === 'verification') loadVerification()
    if (activeTab === 'reaudit') loadReaudit()
  }, [activeTab, token])

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setIsSubmittingLogin(true)
    try {
      await login(loginEmail, loginPass)
      setIsSubmittingLogin(false)
    } catch (err: any) {
      setLoginError(err.message || 'Login failed')
      setIsSubmittingLogin(false)
    }
  }

  const handleSaveAudit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingAudit(true)

    const auditItem: OfflineAudit = {
      id: crypto.randomUUID(),
      placeId: selectedAssignment ? selectedAssignment.place_id : 'unassigned',
      featureType,
      attributes: {
        featureName,
        note: auditNote,
        isTraining: isTrainingMode,
        ...formValues
      },
      photos: [],
      createdAt: new Date().toISOString(),
      synced: false
    }

    await saveOfflineAudit(auditItem)
    await refreshOfflineAudits()
    setIsSavingAudit(false)
    setAuditNote('')
    setSyncStatus('Audit recorded locally in IndexedDB queue.')
  }

  const handleSyncAll = async () => {
    if (!token) return
    if (!isOnline) {
      alert('You are offline. Connect to network to sync audits.')
      return
    }

    setIsSyncing(true)
    setSyncStatus('Syncing offline audits with server...')

    try {
      const itemsToSync = offlineAudits.map(audit => ({
        feature_id: audit.placeId !== 'unassigned' ? audit.placeId : '00000000-0000-0000-0000-000000000000',
        attribute_key: Object.keys(audit.attributes)[0] || 'step_count',
        value: audit.attributes[Object.keys(audit.attributes)[0]] || 0,
        note: audit.attributes.note || 'Offline field audit'
      }))

      if (itemsToSync.length > 0) {
        await syncAuditsBatch(token, itemsToSync)
        await clearOfflineAudits()
        await refreshOfflineAudits()
        setSyncStatus(`Successfully synced ${itemsToSync.length} audits!`)
      } else {
        setSyncStatus('No pending offline audits to sync.')
      }
    } catch (err: any) {
      setSyncStatus(`Sync error: ${err.message}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleApprove = async (evidenceId: string) => {
    if (!token) return
    const note = verifierNotes[evidenceId]
    try {
      await approveEvidence(token, evidenceId, note)
      setActionSuccessMsg('Evidence successfully verified! Status promoted to Verified (90-day expiry).')
      loadVerification()
      setTimeout(() => setActionSuccessMsg(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Approval failed')
    }
  }

  const handleReject = async (evidenceId: string) => {
    if (!token) return
    const note = verifierNotes[evidenceId] || 'Rejected by verifier'
    try {
      await rejectEvidence(token, evidenceId, note)
      setActionSuccessMsg('Evidence rejected and marked accordingly.')
      loadVerification()
      setTimeout(() => setActionSuccessMsg(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Rejection failed')
    }
  }

  // If not logged in, show login form
  if (!user) {
    return (
      <div style={{ maxWidth: '480px', margin: '3rem auto' }}>
        <div className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ textAlign: 'center' }}>
            <ClipboardCheck size={42} style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }} />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Staff & Auditor Portal</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Sign in with your Auditor, Verifier, or Administrator credentials.
            </p>
          </div>

          {loginError && (
            <div
              style={{
                background: 'var(--status-barrier-bg)',
                border: '1px solid var(--status-barrier-border)',
                color: 'var(--status-barrier-text)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem'
              }}
              role="alert"
            >
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="staff-email" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Email Address
              </label>
              <input
                id="staff-email"
                type="email"
                required
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="auditor@example.gov.in"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div>
              <label htmlFor="staff-password" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmittingLogin}
              style={{ padding: '0.85rem', fontWeight: 700 }}
            >
              {isSubmittingLogin ? 'Signing In...' : 'Sign In to Portal'}
            </button>
          </form>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
            ℹ️ First-time setup: Administrator accounts are created via <code>make create-admin</code>.
          </div>
        </div>
      </div>
    )
  }

  const isVerifierOrAdmin = user.role === 'verifier' || user.role === 'admin'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Staff Header & Offline Bar */}
      <div className="saarthi-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Field Auditor & Verifier Console</h1>
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: 'var(--accent-primary)',
                color: '#000',
                fontWeight: 800
              }}
            >
              {user.role}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Logged in as <strong>{user.email}</strong> • Verified evidence requires two-person confirmation.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Network Status */}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.85rem',
              color: isOnline ? 'var(--status-verified-text)' : 'var(--status-barrier-text)',
              fontWeight: 600
            }}
          >
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </span>

          {/* Training Mode Toggle */}
          <button
            type="button"
            className={isTrainingMode ? 'btn-danger' : 'btn-secondary'}
            onClick={() => setIsTrainingMode(!isTrainingMode)}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            aria-pressed={isTrainingMode}
          >
            <Sparkles size={14} />
            <span>{isTrainingMode ? 'Training Mode (ON)' : 'Training Mode (OFF)'}</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            className="btn-secondary"
            onClick={logout}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Offline Sync Status Bar */}
      <div
        className="saarthi-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-elevated)',
          padding: '0.85rem 1.25rem'
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            Offline Audit Queue: {offlineAudits.length} pending
          </span>
          {syncStatus && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {syncStatus}
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={handleSyncAll}
          disabled={isSyncing || offlineAudits.length === 0}
          style={{ fontSize: '0.85rem', padding: '0.45rem 0.95rem' }}
        >
          <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Queue Now'}</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div role="tablist" aria-label="Auditor workflow tabs" style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-subtle)' }}>
        <button
          role="tab"
          aria-selected={activeTab === 'assignments'}
          className={activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('assignments')}
          style={{ borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
        >
          <Layers size={16} />
          <span>Field Assignments</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'checklist'}
          className={activeTab === 'checklist' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('checklist')}
          style={{ borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
        >
          <ClipboardCheck size={16} />
          <span>Audit Checklist Form</span>
        </button>

        {isVerifierOrAdmin && (
          <button
            role="tab"
            aria-selected={activeTab === 'verification'}
            className={activeTab === 'verification' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('verification')}
            style={{ borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
          >
            <UserCheck size={16} />
            <span>Second-Person Verification ({verificationQueue.length})</span>
          </button>
        )}

        <button
          role="tab"
          aria-selected={activeTab === 'reaudit'}
          className={activeTab === 'reaudit' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('reaudit')}
          style={{ borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
        >
          <Clock size={16} />
          <span>Re-Audit Queue (Expiry Sweep)</span>
        </button>
      </div>

      {/* TAB 1: FIELD ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <section className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              Priority Field Assignments in Pune ({assignments.length})
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filter by name..."
                value={assignmentSearch}
                onChange={e => setAssignmentSearch(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>

          {isLoadingAssignments ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading priority field assignments...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {assignments
                .filter(a => a.place_name.toLowerCase().includes(assignmentSearch.toLowerCase()))
                .map(a => (
                  <div
                    key={a.place_id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      backgroundColor: 'var(--bg-surface)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 700 }}>
                          {a.place_type}
                        </span>
                        <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '4px' }}>
                          Priority: {a.priority_score}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{a.place_name}</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{a.address}</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        Features requiring audit: <strong>{a.unverified_features}</strong> / {a.total_features}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setSelectedAssignment(a)
                        setActiveTab('checklist')
                      }}
                      style={{ marginTop: '0.85rem', fontSize: '0.85rem' }}
                    >
                      <span>Start Field Audit</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: AUDIT CHECKLIST FORM */}
      {activeTab === 'checklist' && (
        <section className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Field Audit Checklist Form</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {selectedAssignment
                ? `Auditing: ${selectedAssignment.place_name} (${selectedAssignment.place_type})`
                : 'General Field Feature Audit'}
            </p>
          </div>

          <form onSubmit={handleSaveAudit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              <div>
                <label htmlFor="feature-type-select" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Feature Type
                </label>
                <select
                  id="feature-type-select"
                  value={featureType}
                  onChange={e => setFeatureType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="entrance">Entrance</option>
                  <option value="ramp">Ramp</option>
                  <option value="lift">Lift / Elevator</option>
                  <option value="toilet">Accessible Toilet</option>
                  <option value="counter">Service / Registration Counter</option>
                  <option value="signage">Signage / Braille</option>
                  <option value="tactile_path">Tactile Guidance Path</option>
                  <option value="crossing">Pedestrian Crossing</option>
                  <option value="kerb">Kerb Ramp</option>
                </select>
              </div>

              <div>
                <label htmlFor="feature-name-input" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Feature Name / Location
                </label>
                <input
                  id="feature-name-input"
                  type="text"
                  required
                  value={featureName}
                  onChange={e => setFeatureName(e.target.value)}
                  placeholder="e.g. Ground Floor OPD Entrance"
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
            </div>

            {/* Dynamic Attribute Definition Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                Standard Accessibility Measurements ({featureType})
              </h3>

              {attrDefs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Loading attribute definitions for {featureType}...
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {attrDefs.map(attr => (
                    <div key={attr.key}>
                      <label htmlFor={`attr-${attr.key}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        {attr.key.replace(/_/g, ' ').toUpperCase()} {attr.unit ? `(${attr.unit})` : ''}
                      </label>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                        {attr.description}
                      </p>

                      {attr.value_type === 'number' && (
                        <input
                          id={`attr-${attr.key}`}
                          type="number"
                          step="any"
                          value={formValues[attr.key] ?? 0}
                          onChange={e => setFormValues({ ...formValues, [attr.key]: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)'
                          }}
                        />
                      )}

                      {attr.value_type === 'boolean' && (
                        <select
                          id={`attr-${attr.key}`}
                          value={formValues[attr.key] ? 'true' : 'false'}
                          onChange={e => setFormValues({ ...formValues, [attr.key]: e.target.value === 'true' })}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <option value="true">Yes / Present / Compliant</option>
                          <option value="false">No / Absent / Non-Compliant</option>
                        </select>
                      )}

                      {attr.value_type === 'enum' && (
                        <select
                          id={`attr-${attr.key}`}
                          value={formValues[attr.key] || 'flush'}
                          onChange={e => setFormValues({ ...formValues, [attr.key]: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <option value="flush">Flush</option>
                          <option value="lowered">Lowered</option>
                          <option value="raised">Raised (Barrier)</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Observations & Notes */}
            <div>
              <label htmlFor="audit-notes" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Field Observations & Evidence Notes
              </label>
              <textarea
                id="audit-notes"
                rows={3}
                value={auditNote}
                onChange={e => setAuditNote(e.target.value)}
                placeholder="Describe unobstructed path, tactile paving alignment, ramp handrails, lighting, or barriers observed."
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSavingAudit}
                style={{ padding: '0.75rem 1.5rem', fontWeight: 700 }}
              >
                {isSavingAudit ? 'Saving...' : '💾 Save Audit to Offline Queue'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 3: SECOND-PERSON VERIFICATION QUEUE */}
      {activeTab === 'verification' && isVerifierOrAdmin && (
        <section className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              Independent Second-Person Verification Queue ({verificationQueue.length})
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Strict Rule 4: Collector is NOT verifier. An audit becomes Verified only after an independent second person approves it.
            </p>
          </div>

          {actionSuccessMsg && (
            <div
              style={{
                backgroundColor: 'var(--status-verified-bg)',
                border: '1px solid var(--status-verified-border)',
                color: 'var(--status-verified-text)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem'
              }}
              role="alert"
            >
              ✓ {actionSuccessMsg}
            </div>
          )}

          {isLoadingQueue ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading pending verification items...
            </div>
          ) : verificationQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No audits currently awaiting verification.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {verificationQueue.map(item => {
                const isSelfAudit = item.observer_id === user.id
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 700 }}>
                          {item.feature_type} • {item.place_name || 'Public Facility'}
                        </span>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.feature_name}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Collected by <strong>{item.observer_email || 'Auditor'}</strong> on {new Date(item.observed_at).toLocaleDateString()}
                        </p>
                      </div>

                      <span
                        className="status-chip reported"
                        style={{ fontSize: '0.8rem', padding: '3px 8px' }}
                      >
                        Pending Verification
                      </span>
                    </div>

                    <div style={{ backgroundColor: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                      <strong>Attribute:</strong> {item.attribute_key} = <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{JSON.stringify(item.value)}</span>
                      {item.note && (
                        <p style={{ marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
                          <em>Note:</em> {item.note}
                        </p>
                      )}
                    </div>

                    {isSelfAudit && (
                      <div
                        style={{
                          color: 'var(--status-barrier-text)',
                          fontSize: '0.8rem',
                          background: 'var(--status-barrier-bg)',
                          padding: '0.5rem',
                          borderRadius: 'var(--radius-sm)'
                        }}
                      >
                        ⚠️ Rule 4 Violation Prevented: You collected this audit. An independent second person must verify it.
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                      <input
                        type="text"
                        placeholder="Verifier verification note (optional)..."
                        value={verifierNotes[item.id] || ''}
                        onChange={e => setVerifierNotes({ ...verifierNotes, [item.id]: e.target.value })}
                        disabled={isSelfAudit}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleApprove(item.id)}
                        disabled={isSelfAudit}
                        style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                      >
                        <CheckCircle size={16} />
                        <span>Approve (Verified)</span>
                      </button>

                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => handleReject(item.id)}
                        disabled={isSelfAudit}
                        style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                      >
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: RE-AUDIT QUEUE */}
      {activeTab === 'reaudit' && (
        <section className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              Evidence Freshness & Re-Audit Queue ({reauditQueue.length})
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Rule 2: Evidence expires. Expired evidence immediately reverts to Unknown. Features are prioritized by impact.
            </p>
          </div>

          {isLoadingReaudit ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading re-audit queue...
            </div>
          ) : reauditQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              All current evidence records are within their valid freshness window.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {reauditQueue.map(item => (
                <div
                  key={item.feature_id + item.attribute_key}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    backgroundColor: 'var(--bg-surface)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--status-temp-barrier-text)', fontWeight: 700 }}>
                        {item.feature_type}
                      </span>
                      <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--status-barrier-bg)', color: 'var(--status-barrier-text)', padding: '2px 6px', borderRadius: '4px' }}>
                        Impact Score: {item.impact_score}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{item.feature_name}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.place_name || 'Public Facility'} • Attribute: <code>{item.attribute_key}</code>
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--status-barrier-text)', marginTop: '0.2rem' }}>
                      ⚠️ {item.reason}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setFeatureType(item.feature_type)
                      setFeatureName(item.feature_name)
                      setActiveTab('checklist')
                    }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    <span>Schedule Re-Audit</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
