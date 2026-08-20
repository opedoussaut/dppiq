import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Aperture, ArrowLeft, ArrowRight, BadgeCheck, BrainCircuit, Camera,
  Check, CheckCircle2, ChevronDown, Download, FileCheck2, FileText,
  History, ImagePlus, KeyRound, Menu, RefreshCw, ScanLine, SearchCheck, Settings,
  ShieldCheck, Sparkles, Upload, X, AlertTriangle,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''
const HISTORY_KEY = 'regiq.scanHistory.v1'
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 12))) } catch {}
}

function confidenceTone(score) {
  if (score == null) return 'neutral'
  if (score >= 85) return 'high'
  if (score >= 65) return 'medium'
  return 'low'
}

function regimeTone(regime) {
  const status = String(regime?.status || '').toLowerCase()
  if (status === 'applicable_regime' || status === 'applicable' || status === 'likely') return 'live'
  if (status.includes('future') || status.includes('upcoming')) return 'future'
  return 'conditional'
}

function formatStatus(value) {
  return String(value || 'conditional').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function parseTimelineDate(text) {
  if (!text) return null
  const value = String(text)
  const monthNames = Object.keys(MONTHS).join('|')

  const exact = value.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s+(20\\d{2})\\b`, 'i'))
  if (exact) {
    const [, day, month, year] = exact
    return new Date(Number(year), MONTHS[month.toLowerCase()], Number(day))
  }

  const monthYear = value.match(new RegExp(`\\b(${monthNames})\\s+(20\\d{2})\\b`, 'i'))
  if (monthYear) {
    const [, month, year] = monthYear
    return new Date(Number(year), MONTHS[month.toLowerCase()], 1)
  }

  return null
}

function timelineLabel(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date)
}

function makeSnapshot(profile) {
  const regimes = profile?.regimes || []
  return {
    confidence: Number.isFinite(profile?.overall_confidence) ? Math.round(profile.overall_confidence) : null,
    gaps: (profile?.missing_evidence || profile?.questions || []).length,
    confirmed: regimes.filter(r => r.verification === 'confirmed').length,
    conditional: regimes.filter(r => regimeTone(r) === 'conditional').length,
    findings: regimes.length,
  }
}

function buildTimeline(regimes, catalog) {
  const acts = catalog?.acts || {}
  const now = new Date()
  const result = regimes.map(regime => {
    const act = acts[regime.id] || {}
    const text = [act.summary, regime.why, ...(regime.obligations || [])].filter(Boolean).join(' ')
    const date = parseTimelineDate(text)
    const tone = regimeTone(regime)
    const catalogStatus = act.status || regime.status
    const isCurrent = !date && (tone === 'live' || catalogStatus === 'in_force')
    return {
      id: regime.id,
      title: regime.title,
      legalBasis: regime.legal_basis,
      date,
      sortValue: date ? date.getTime() : isCurrent ? now.getTime() - 1 : Number.MAX_SAFE_INTEGER,
      dateLabel: date ? timelineLabel(date) : isCurrent ? 'Now' : 'Date to verify',
      tone,
      status: catalogStatus,
      confidence: regime.confidence,
      sourceUrl: regime.source_url,
      summary: act.summary || regime.why,
    }
  })

  return result.sort((a, b) => a.sortValue - b.sortValue)
}

async function apiError(response) {
  try {
    const payload = await response.json()
    return payload?.detail || payload?.message || `HTTP ${response.status}`
  } catch {
    try { return (await response.text()) || `HTTP ${response.status}` } catch { return `HTTP ${response.status}` }
  }
}

function ScanExperience({ latestScan, onScanComplete, onOpenIntelligence, hfToken }) {
  const [preview, setPreview] = useState(latestScan?.imageUrl || '')
  const [filename, setFilename] = useState(latestScan?.filename || '')
  const [barcode, setBarcode] = useState('')
  const [scanResult, setScanResult] = useState(latestScan?.result || null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [stream, setStream] = useState(null)
  const imageRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => () => stream?.getTracks().forEach(track => track.stop()), [stream])

  useEffect(() => {
    if (!cameraOpen || !stream || !videoRef.current) return
    const video = videoRef.current
    video.srcObject = stream
    const markReady = () => setCameraReady(video.videoWidth > 0 && video.videoHeight > 0)
    video.addEventListener('loadedmetadata', markReady)
    video.addEventListener('playing', markReady)
    video.play().then(markReady).catch(() => setMessage('The browser could not start the live camera preview.'))
    return () => {
      video.removeEventListener('loadedmetadata', markReady)
      video.removeEventListener('playing', markReady)
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [cameraOpen, stream])

  async function tryBarcode() {
    if (!imageRef.current) return
    try {
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeFromImageElement(imageRef.current)
      const value = result.getText()
      setBarcode([8, 12, 13, 14].includes(value.length) ? value : '')
    } catch {
      setBarcode('')
    }
  }

  async function submitFile(file) {
    if (!file) return
    const displayName = file.name || 'camera-capture.jpg'
    const imageUrl = URL.createObjectURL(file)
    setFilename(displayName)
    setPreview(imageUrl)
    setScanResult(null)
    setBarcode('')
    setMessage('')
    setBusy(true)

    const data = new FormData()
    data.append('file', file)
    const headers = hfToken ? { 'X-REGIQ-HF-Token': hfToken } : {}

    try {
      const response = await fetch(`${API}/api/scan/image`, { method: 'POST', headers, body: data })
      if (!response.ok) throw new Error(await apiError(response))
      const result = await response.json()
      setScanResult(result)
      onScanComplete({ result, imageUrl, filename: displayName, scannedAt: new Date().toISOString() })
    } catch (error) {
      setMessage(`REGIQ scan failed: ${error?.message || 'API unavailable'}`)
    } finally {
      setBusy(false)
    }
  }

  async function openCamera() {
    setMessage('')
    setCameraReady(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Live camera is not available in this browser. Use Upload photo instead.')
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      setStream(media)
      setCameraOpen(true)
    } catch (error) {
      setMessage(error?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access for this site and try again.'
        : `REGIQ could not open this camera${error?.name ? ` (${error.name})` : ''}.`)
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null)
    setCameraOpen(false)
    setCameraReady(false)
  }

  async function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) {
      setMessage('The camera is not ready yet.')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async blob => {
      if (!blob) return
      closeCamera()
      await submitFile(new File([blob], `regiq-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', .9)
  }

  const identification = scanResult?.identification
  const profile = scanResult?.regulatory_profile
  const identified = identification?.status === 'identified'
  const regimes = profile?.regimes || []
  const score = Number.isFinite(profile?.overall_confidence) ? Math.round(profile.overall_confidence) : null
  const missing = profile?.missing_evidence || profile?.questions || []

  return (
    <section className="os-page os-scan-page">
      <section className="os-hero os-scan-hero">
        <div className="os-kicker"><ScanLine size={16} /> INSTANT PRODUCT REGULATION</div>
        <h1>Point. Scan.<br /><span>Know what matters.</span></h1>
        <p>REGIQ identifies a product, investigates the verified legal corpus, and tells you what deserves attention. Intelligence takes you from the signal to the decision.</p>
      </section>

      <div className="os-scan-layout">
        <article className="os-card os-capture-card">
          {!preview ? (
            <div className="os-capture-empty">
              <div className="os-capture-mark"><Camera size={42} /></div>
              <div>
                <h2>Assess a product</h2>
                <p>Use the camera for something in front of you, or upload a clear product image for complex equipment.</p>
              </div>
              <div className="os-action-pair">
                <button className="os-primary-button" onClick={openCamera}><Camera size={18} /> Use camera</button>
                <label className="os-secondary-button os-file-button"><Upload size={18} /> Upload image<input type="file" accept="image/*" onChange={e => submitFile(e.target.files?.[0])} /></label>
              </div>
            </div>
          ) : (
            <div className="os-preview">
              <img ref={imageRef} src={preview} alt="Product submitted for identification" onLoad={tryBarcode} />
              <div className="os-preview-vignette" />
              {busy && <div className="os-scan-progress"><Sparkles size={16} /> Identifying · investigating · verifying</div>}
              <div className="os-preview-footer">
                <span><ImagePlus size={15} /> {filename}</span>
                <button onClick={() => { setPreview(''); setScanResult(null); setBarcode('') }}>New scan</button>
              </div>
            </div>
          )}
        </article>

        <aside className="os-scan-result">
          {!scanResult && (
            <article className="os-card os-result-placeholder">
              <span className="os-overline">SCAN</span>
              <h2>The signal, not the dossier.</h2>
              <p>Scan is intentionally fast. Product identity, regulatory signals and evidence confidence appear here. The actionable work happens in Intelligence.</p>
            </article>
          )}

          {identified && (
            <article className="os-card os-product-card">
              <div className="os-product-top">
                <div>
                  <span className="os-overline">IDENTIFIED</span>
                  <h2>{identification.product_type}</h2>
                  <p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || identification.category?.replaceAll('_', ' ')}</p>
                </div>
                <div className="os-identity-score"><strong>{Math.round((identification.confidence || 0) * 100)}</strong><span>% identity</span></div>
              </div>
              {barcode && <div className="os-inline-fact"><span>Barcode</span><strong>{barcode}</strong></div>}
            </article>
          )}

          {profile && (
            <article className="os-card os-signal-card">
              <div className={`os-confidence-orb ${confidenceTone(score)}`}><strong>{score ?? '—'}</strong><span>{score != null ? '%' : 'n/a'}</span></div>
              <div>
                <span className="os-overline">EVIDENCE CONFIDENCE</span>
                <h3>{score != null ? `${profile.overall_confidence_label || confidenceTone(score)} confidence` : 'Fallback assessment'}</h3>
                <p>Confidence in the investigation, not a product compliance score.</p>
              </div>
            </article>
          )}

          {regimes.length > 0 && (
            <article className="os-card os-signal-list">
              <div className="os-card-heading"><span>Regulatory signals</span><small>{regimes.length} findings</small></div>
              {regimes.slice(0, 5).map(regime => (
                <div className="os-signal-row" key={regime.id}>
                  <span className={`os-signal-dot ${regimeTone(regime)}`} />
                  <div><strong>{regime.title}</strong><small>{formatStatus(regime.status)}</small></div>
                  {Number.isFinite(regime.confidence) && <b>{Math.round(regime.confidence)}%</b>}
                </div>
              ))}
            </article>
          )}

          {missing.length > 0 && (
            <article className="os-card os-gap-tease">
              <div><SearchCheck size={18} /><span>{missing.length} evidence gap{missing.length === 1 ? '' : 's'} can be resolved</span></div>
              <p>Intelligence lets you answer the missing facts, attach evidence and re-run the investigator + verifier.</p>
            </article>
          )}

          {profile && (
            <button className="os-intelligence-button" onClick={onOpenIntelligence}>
              <span><small>GO BEYOND THE SCAN</small><strong>Open Intelligence</strong></span><ArrowRight size={22} />
            </button>
          )}

          {preview && !busy && identification?.status && !identified && (
            <article className="os-card os-warning-card"><AlertTriangle size={20} /><div><strong>Product not identified</strong><p>{identification.message}</p></div></article>
          )}
        </aside>
      </div>

      {message && <div className="os-error">{message}</div>}

      {cameraOpen && (
        <div className="os-camera-modal">
          <div className="os-camera-shell">
            <video ref={videoRef} autoPlay playsInline muted />
            <button className="os-camera-close" onClick={closeCamera}><X /></button>
            <div className="os-camera-live"><span /> {cameraReady ? 'LIVE' : 'CONNECTING'}</div>
            <div className="os-camera-frame" />
            <div className="os-camera-controls">
              <button onClick={capturePhoto} disabled={!cameraReady}><Aperture size={34} /></button>
              <span>{cameraReady ? 'Center the product and capture' : 'Starting camera…'}</span>
            </div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </section>
  )
}

function GapCard({ gap, index, draft, onChange, expanded, onToggle }) {
  const hasEvidence = Boolean(draft?.value?.trim())
  return (
    <article className={`os-gap-card ${expanded ? 'expanded' : ''} ${hasEvidence ? 'ready' : ''}`}>
      <button className="os-gap-summary" onClick={onToggle}>
        <div className="os-gap-index">{hasEvidence ? <Check size={17} /> : String(index + 1).padStart(2, '0')}</div>
        <div><strong>{gap}</strong><span>{hasEvidence ? 'Product fact ready for reassessment' : 'Bridge this gap to strengthen the investigation'}</span></div>
        <ChevronDown size={18} />
      </button>
      {expanded && (
        <div className="os-gap-editor">
          <label>
            <span>Product fact or answer</span>
            <textarea
              value={draft?.value || ''}
              onChange={e => onChange({ ...draft, value: e.target.value })}
              placeholder="Enter the missing product information as precisely as you can…"
            />
          </label>
          <div className="os-gap-fields">
            <label>
              <span>Evidence level</span>
              <select value={draft?.evidence_level || 'self_declared'} onChange={e => onChange({ ...draft, evidence_level: e.target.value })}>
                <option value="self_declared">Self declared</option>
                <option value="document_supported">Document supported</option>
                <option value="verified_evidence">Verified evidence</option>
              </select>
            </label>
            <label className="os-attachment-field">
              <span>Supporting file</span>
              <div className="os-attachment-button"><FileText size={16} /> {draft?.attachment || 'Attach reference'}</div>
              <input
                type="file"
                onChange={e => onChange({ ...draft, attachment: e.target.files?.[0]?.name || '' })}
              />
            </label>
          </div>
          {draft?.attachment && <p className="os-fineprint">The filename is registered as supporting context. Document contents are not parsed yet, so an explicit product fact above is still required.</p>}
        </div>
      )}
    </article>
  )
}

function DeltaValue({ before, after, suffix = '' }) {
  const delta = (before == null || after == null) ? null : after - before
  return (
    <div className="os-delta-value">
      <span>{before ?? '—'}{before != null ? suffix : ''}</span>
      <ArrowRight size={16} />
      <strong>{after ?? '—'}{after != null ? suffix : ''}</strong>
      {delta != null && delta !== 0 && <b className={delta > 0 ? 'positive' : 'negative'}>{delta > 0 ? '+' : ''}{delta}{suffix}</b>}
    </div>
  )
}

function IntelligenceDashboard({ latestScan, onReturnToScan, onReplaceLatest, hfToken }) {
  const [workingResult, setWorkingResult] = useState(latestScan?.result || null)
  const [catalog, setCatalog] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [expandedGap, setExpandedGap] = useState(0)
  const [reassessing, setReassessing] = useState(false)
  const [reassessError, setReassessError] = useState('')
  const [comparison, setComparison] = useState(null)

  useEffect(() => {
    setWorkingResult(latestScan?.result || null)
    setDrafts({})
    setExpandedGap(0)
    setComparison(null)
    setReassessError('')
  }, [latestScan?.scannedAt])

  useEffect(() => {
    fetch(`${API}/api/regulation/catalog`).then(r => r.ok ? r.json() : null).then(setCatalog).catch(() => {})
  }, [])

  if (!workingResult) {
    return (
      <section className="os-page os-intelligence-empty">
        <div className="os-empty-orb"><BrainCircuit size={42} /></div>
        <span className="os-overline">REGIQ INTELLIGENCE</span>
        <h1>No dossier yet.</h1>
        <p>Scan or upload a product first. Intelligence turns the scan into a regulatory decision workspace.</p>
        <button className="os-primary-button" onClick={onReturnToScan}><ScanLine size={18} /> Assess a product</button>
      </section>
    )
  }

  const identification = workingResult.identification || {}
  const profile = workingResult.regulatory_profile || {}
  const regimes = profile.regimes || []
  const missing = profile.missing_evidence || profile.questions || []
  const official = regimes.filter(r => r.source_url)
  const obligations = regimes.flatMap(r => (r.obligations || []).map(text => ({ regime: r.title, text })))
  const score = Number.isFinite(profile.overall_confidence) ? Math.round(profile.overall_confidence) : null
  const identity = Math.round((identification.confidence || 0) * 100)
  const timeline = buildTimeline(regimes, catalog)
  const now = new Date()
  const nextMilestone = timeline.find(item => item.date && item.date.getTime() > now.getTime())
  const evidenceEntries = Object.entries(drafts)
    .filter(([, value]) => value?.value?.trim())
    .map(([gap, value]) => ({ gap, value: value.value.trim(), evidence_level: value.evidence_level || 'self_declared', attachment: value.attachment || '' }))

  async function reassess() {
    if (!evidenceEntries.length) return
    setReassessing(true)
    setReassessError('')
    const before = makeSnapshot(profile)
    const headers = { 'Content-Type': 'application/json', ...(hfToken ? { 'X-REGIQ-HF-Token': hfToken } : {}) }

    try {
      const response = await fetch(`${API}/api/scan/reassess`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ identification, gap_resolutions: evidenceEntries }),
      })
      if (!response.ok) throw new Error(await apiError(response))
      const payload = await response.json()
      const nextResult = {
        ...workingResult,
        identification: payload.identification || identification,
        regulatory_profile: payload.regulatory_profile || profile,
      }
      setWorkingResult(nextResult)
      setComparison({ before, after: makeSnapshot(nextResult.regulatory_profile), evidenceCount: evidenceEntries.length })
      setDrafts({})
      setExpandedGap(0)
      onReplaceLatest?.(nextResult)
    } catch (error) {
      setReassessError(error?.message || 'Reassessment unavailable')
    } finally {
      setReassessing(false)
    }
  }

  return (
    <section className="os-page os-intelligence-page">
      <button className="os-back-link" onClick={onReturnToScan}><ArrowLeft size={17} /> Back to Scan</button>

      <section className="os-intel-hero">
        <div>
          <span className="os-overline">REGULATORY INTELLIGENCE</span>
          <h1>{identification.product_type || 'Scanned product'}</h1>
          <p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || identification.category?.replaceAll('_', ' ')}</p>
        </div>
        <div className="os-intel-badges">
          <span><BadgeCheck size={15} /> Identity {identity}%</span>
          <span><ShieldCheck size={15} /> {official.length} official sources</span>
        </div>
      </section>

      <section className="os-metrics-grid">
        <article className="os-metric-card os-metric-featured">
          <span>Evidence confidence</span>
          <div><strong>{score ?? '—'}</strong>{score != null && <small>%</small>}</div>
          <p>{score != null ? `${profile.overall_confidence_label || confidenceTone(score)} confidence in this investigation` : 'Agent confidence score unavailable in fallback mode'}</p>
        </article>
        <article className="os-metric-card">
          <span>Open evidence gaps</span>
          <div><strong>{missing.length}</strong></div>
          <p>{missing.length ? 'You can resolve these and re-run Intelligence.' : 'No global evidence gaps surfaced.'}</p>
        </article>
        <article className="os-metric-card">
          <span>Next dated milestone</span>
          <div className="os-next-milestone">{nextMilestone ? timelineLabel(nextMilestone.date) : 'No dated event'}</div>
          <p>{nextMilestone ? nextMilestone.title : 'Future findings without dates remain visible in the horizon.'}</p>
        </article>
      </section>

      <article className="os-card os-position-card">
        <div className="os-section-tag"><Sparkles size={16} /> POSITION</div>
        <h2>{profile.headline || 'Regulatory screening'}</h2>
        <p>{profile.summary}</p>
      </article>

      <section className="os-section-block">
        <div className="os-section-heading">
          <div><span className="os-overline">REGULATORY HORIZON</span><h2>What changes, and when.</h2></div>
          <p>Dates come from the verified catalog text where REGIQ has an explicit milestone. Unknown dates stay explicitly unknown.</p>
        </div>

        <div className="os-timeline">
          <div className="os-timeline-line" />
          {timeline.map((item, index) => (
            <article className={`os-timeline-item ${item.tone}`} key={`${item.id}-${index}`}>
              <div className="os-timeline-dot" />
              <div className="os-timeline-date">{item.dateLabel}</div>
              <h3>{item.title}</h3>
              <span>{formatStatus(item.status)}</span>
              <p>{item.summary}</p>
              <div className="os-timeline-meta">
                {Number.isFinite(item.confidence) && <b>{Math.round(item.confidence)}% confidence</b>}
                {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Official text ↗</a>}
              </div>
            </article>
          ))}
          {!timeline.length && <div className="os-empty-row">No regulatory milestones are available for this assessment.</div>}
        </div>
      </section>

      <section className="os-section-block os-gap-lab">
        <div className="os-section-heading">
          <div><span className="os-overline">BRIDGE THE GAPS</span><h2>Turn uncertainty into evidence.</h2></div>
          <p>Answer what REGIQ could not infer from the scan. Your facts are sent back through the investigator and independent verifier against the same verified legal corpus.</p>
        </div>

        {missing.length ? (
          <div className="os-gap-layout">
            <div className="os-gap-stack">
              {missing.map((gap, index) => (
                <GapCard
                  key={`${gap}-${index}`}
                  gap={gap}
                  index={index}
                  draft={drafts[gap] || { evidence_level: 'self_declared' }}
                  expanded={expandedGap === index}
                  onToggle={() => setExpandedGap(expandedGap === index ? -1 : index)}
                  onChange={next => setDrafts(current => ({ ...current, [gap]: next }))}
                />
              ))}
            </div>

            <aside className="os-reassess-panel">
              <div className="os-reassess-icon"><RefreshCw size={22} /></div>
              <span className="os-overline">RE-RUN INTELLIGENCE</span>
              <h3>{evidenceEntries.length ? `${evidenceEntries.length} product fact${evidenceEntries.length === 1 ? '' : 's'} ready` : 'Add a product fact to continue'}</h3>
              <p>The scan stays the same. REGIQ re-evaluates regulatory applicability, missing evidence and confidence using your new product facts.</p>
              <button className="os-primary-button os-full-button" disabled={!evidenceEntries.length || reassessing} onClick={reassess}>
                {reassessing ? <><RefreshCw className="os-spin" size={17} /> Re-investigating…</> : <><Sparkles size={17} /> Re-run Intelligence</>}
              </button>
              <small>This is a new investigator + verifier run, not a cosmetic score adjustment.</small>
              {reassessError && <div className="os-inline-error">{reassessError}</div>}
            </aside>
          </div>
        ) : (
          <article className="os-card os-all-clear"><CheckCircle2 size={24} /><div><h3>No global evidence gaps surfaced.</h3><p>You can still inspect conditional findings below for act-specific conditions.</p></div></article>
        )}
      </section>

      {comparison && (
        <section className="os-section-block">
          <div className="os-section-heading">
            <div><span className="os-overline">WHAT CHANGED</span><h2>Before → after.</h2></div>
            <p>{comparison.evidenceCount} product fact{comparison.evidenceCount === 1 ? '' : 's'} were added to a fresh investigator + verifier run.</p>
          </div>
          <div className="os-comparison-card">
            <div className="os-comparison-row"><span>Evidence confidence</span><DeltaValue before={comparison.before.confidence} after={comparison.after.confidence} suffix="%" /></div>
            <div className="os-comparison-row"><span>Open gaps</span><DeltaValue before={comparison.before.gaps} after={comparison.after.gaps} /></div>
            <div className="os-comparison-row"><span>Verifier-confirmed findings</span><DeltaValue before={comparison.before.confirmed} after={comparison.after.confirmed} /></div>
            <div className="os-comparison-row"><span>Conditional findings</span><DeltaValue before={comparison.before.conditional} after={comparison.after.conditional} /></div>
          </div>
        </section>
      )}

      <section className="os-section-block">
        <div className="os-section-heading">
          <div><span className="os-overline">APPLICABILITY</span><h2>The verified findings.</h2></div>
          <p>Each conclusion keeps its source, verifier state and confidence visible.</p>
        </div>
        <div className="os-findings-grid">
          {regimes.map(regime => (
            <article className={`os-finding-card ${regimeTone(regime)}`} key={regime.id}>
              <div className="os-finding-top">
                <span className="os-status-pill">{formatStatus(regime.status)}</span>
                {Number.isFinite(regime.confidence) && <strong>{Math.round(regime.confidence)}%</strong>}
              </div>
              <h3>{regime.title}</h3>
              <small>{regime.legal_basis}</small>
              <p>{regime.why}</p>
              {regime.verification_note && <div className="os-verifier-note"><ShieldCheck size={15} /><span><b>{formatStatus(regime.verification)}</b> · {regime.verification_note}</span></div>}
              {(regime.conditions || []).length > 0 && (
                <div className="os-condition-list">
                  <span>Needs evidence</span>
                  {(regime.conditions || []).map((condition, index) => <small key={index}>{condition}</small>)}
                </div>
              )}
              {regime.source_url && <a className="os-source-link" href={regime.source_url} target="_blank" rel="noreferrer">Open official text <ArrowRight size={15} /></a>}
            </article>
          ))}
        </div>
      </section>

      {obligations.length > 0 && (
        <section className="os-section-block">
          <div className="os-section-heading">
            <div><span className="os-overline">OBLIGATIONS</span><h2>What to check next.</h2></div>
            <p>High-level checks extracted from the supported findings.</p>
          </div>
          <div className="os-obligations">
            {obligations.map((item, index) => (
              <div className="os-obligation-row" key={`${item.regime}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{item.text}</strong><small>{item.regime}</small></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="os-intel-footer-grid">
        <article className="os-card">
          <div className="os-section-tag"><FileCheck2 size={16} /> EVIDENCE</div>
          <h3>{official.length} official source{official.length === 1 ? '' : 's'}</h3>
          <div className="os-source-stack">
            {official.map(regime => <a href={regime.source_url} target="_blank" rel="noreferrer" key={regime.id}><span>{regime.title}</span><ArrowRight size={15} /></a>)}
          </div>
        </article>
        <article className="os-card">
          <div className="os-section-tag"><BrainCircuit size={16} /> AGENT TRACE</div>
          <div className="os-trace-list">
            <div><span>Reasoning</span><strong>{profile.reasoning_mode || profile.investigation?.mode || 'fallback'}</strong></div>
            <div><span>Investigator</span><strong>{profile.investigation?.investigator_model || 'n/a'}</strong></div>
            <div><span>Verifier</span><strong>{profile.investigation?.verifier_model || 'n/a'}</strong></div>
            <div><span>Scanned</span><strong>{latestScan?.scannedAt ? new Date(latestScan.scannedAt).toLocaleString() : 'current session'}</strong></div>
          </div>
        </article>
      </section>

      <p className="os-disclaimer">{profile.disclaimer || 'REGIQ is a screening and intelligence aid. Exact applicability depends on product specifications, market and dates.'}</p>
    </section>
  )
}

function HistoryView({ history, onSelect, onClear }) {
  return (
    <section className="os-page os-simple-page">
      <section className="os-simple-hero">
        <span className="os-overline">RECENT ASSESSMENTS</span>
        <h1>Your regulation trail.</h1>
        <p>Stored locally in this browser. Open any assessment directly in Intelligence.</p>
        {history.length > 0 && <button className="os-secondary-button" onClick={onClear}>Clear history</button>}
      </section>
      {history.length === 0 ? <div className="os-card os-empty-row">No saved assessments yet.</div> : (
        <div className="os-history-grid">
          {history.map(item => {
            const id = item.result?.identification || {}
            const profile = item.result?.regulatory_profile || {}
            return (
              <button className="os-card os-history-card" key={item.id} onClick={() => onSelect(item)}>
                <div className="os-history-icon"><ScanLine size={21} /></div>
                <div>
                  <strong>{id.product_type || 'Scanned product'}</strong>
                  <span>{[id.brand, id.model].filter(Boolean).join(' · ') || id.category?.replaceAll('_', ' ')}</span>
                  <small>{profile.regimes?.length || 0} findings · {Number.isFinite(profile.overall_confidence) ? `${Math.round(profile.overall_confidence)}% confidence · ` : ''}{new Date(item.scannedAt).toLocaleString()}</small>
                </div>
                <ArrowRight size={18} />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SettingsView({ config, provenance, hfToken, setHfToken, installPrompt, onInstall }) {
  const byo = config?.vision?.byo_hf_token_enabled || config?.regulation_agents?.byo_token_enabled
  const serverReady = config?.vision?.server_token_configured || config?.regulation_agents?.server_token_configured
  return (
    <section className="os-page os-simple-page">
      <section className="os-simple-hero">
        <span className="os-overline">SETUP</span>
        <h1>Keep the intelligence visible.</h1>
        <p>Configure model access and install REGIQ as a progressive web app.</p>
      </section>
      <div className="os-settings-grid">
        <article className="os-card os-settings-card">
          <div className="os-section-tag"><KeyRound size={16} /> MODEL ACCESS</div>
          <h2>{serverReady ? 'Host credentials are ready' : byo ? 'Bring your own token' : 'Model setup required'}</h2>
          <p>Vision: {config?.vision?.model || 'auto'}<br />Investigator: {config?.regulation_agents?.investigator_model || 'auto'}</p>
          {byo && <label className="os-token-field"><span>Hugging Face token</span><input type="password" value={hfToken} onChange={e => setHfToken(e.target.value)} placeholder="hf_…" autoComplete="off" /></label>}
          <small>Token stays in page memory only and is sent request-scoped to the configured backend.</small>
        </article>

        <article className="os-card os-settings-card">
          <div className="os-section-tag"><Download size={16} /> APP</div>
          <h2>Install REGIQ</h2>
          <p>Run REGIQ from your home screen or desktop like an application.</p>
          {installPrompt ? <button className="os-primary-button" onClick={onInstall}><Download size={17} /> Install app</button> : <small>iPhone/iPad: Safari → Share → Add to Home Screen.<br />Android/Chrome: browser menu → Install app.</small>}
        </article>

        <article className="os-card os-settings-card">
          <div className="os-section-tag"><ShieldCheck size={16} /> PROVENANCE</div>
          <h2>{provenance?.software?.name || 'REGIQ'} {provenance?.software?.version || ''}</h2>
          <p>{provenance?.note || 'REGIQ separates product recognition from regulatory investigation.'}</p>
          {provenance?.software?.repository && <a className="os-source-link" href={provenance.software.repository} target="_blank" rel="noreferrer">Open GitHub repository <ArrowRight size={15} /></a>}
        </article>
      </div>
    </section>
  )
}

function AppV2() {
  const [view, setView] = useState('scan')
  const [latestScan, setLatestScan] = useState(null)
  const [history, setHistory] = useState(readHistory)
  const [hfToken, setHfToken] = useState('')
  const [config, setConfig] = useState(null)
  const [provenance, setProvenance] = useState(null)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/scan/config`).then(r => r.ok ? r.json() : null).then(setConfig).catch(() => {})
    fetch(`${API}/api/model/provenance`).then(r => r.ok ? r.json() : null).then(setProvenance).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = event => { event.preventDefault(); setInstallPrompt(event) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function completeScan(scan) {
    setLatestScan(scan)
    const persisted = { id: crypto.randomUUID?.() || String(Date.now()), scannedAt: scan.scannedAt, filename: scan.filename, result: scan.result }
    const next = [persisted, ...history].slice(0, 12)
    setHistory(next)
    saveHistory(next)
  }

  function replaceLatest(result) {
    setLatestScan(current => current ? { ...current, result } : current)
    setHistory(current => {
      if (!latestScan?.scannedAt) return current
      const next = current.map(item => item.scannedAt === latestScan.scannedAt ? { ...item, result } : item)
      saveHistory(next)
      return next
    })
  }

  function chooseHistory(item) {
    setLatestScan({ ...item, imageUrl: '' })
    setView('intelligence')
  }

  async function install() {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  function nav(next) {
    setView(next)
    setMobileNav(false)
  }

  return (
    <main className="os-app">
      <header className="os-topbar">
        <button className="os-brand" onClick={() => nav('scan')}>
          <span className="os-logo">R</span>
          <span><strong>REGIQ</strong><small>Regulation Intelligence</small></span>
        </button>
        <button className="os-mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={21} /></button>
        <nav className={mobileNav ? 'open' : ''}>
          <button className={view === 'scan' ? 'active' : ''} onClick={() => nav('scan')}><ScanLine size={15} /> Scan</button>
          <button className={view === 'intelligence' ? 'active' : ''} onClick={() => nav('intelligence')}><BrainCircuit size={15} /> Intelligence</button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => nav('history')}><History size={15} /> History</button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => nav('settings')}><Settings size={15} /> Setup</button>
        </nav>
        <div className="os-beta"><span /> Open-source beta</div>
      </header>

      {view === 'scan' && <ScanExperience latestScan={latestScan} onScanComplete={completeScan} onOpenIntelligence={() => setView('intelligence')} hfToken={hfToken} />}
      {view === 'intelligence' && <IntelligenceDashboard latestScan={latestScan} onReturnToScan={() => setView('scan')} onReplaceLatest={replaceLatest} hfToken={hfToken} />}
      {view === 'history' && <HistoryView history={history} onSelect={chooseHistory} onClear={() => { setHistory([]); saveHistory([]) }} />}
      {view === 'settings' && <SettingsView config={config} provenance={provenance} hfToken={hfToken} setHfToken={setHfToken} installPrompt={installPrompt} onInstall={install} />}

      <footer className="os-footer">REGIQ · Scan the product. Resolve the uncertainty. Re-run the intelligence.</footer>
    </main>
  )
}

export default AppV2
