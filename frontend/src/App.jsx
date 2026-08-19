import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Activity,
  Barcode,
  BrainCircuit,
  Camera,
  CheckCircle2,
  FileCheck2,
  ImagePlus,
  Info,
  Recycle,
  ScanLine,
  Scale,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''

function Metric({ icon: Icon, label, value, suffix = '' }) {
  return (
    <div className="metric card">
      <div className="metric-icon"><Icon size={20} /></div>
      <div>
        <div className="muted">{label}</div>
        <div className="metric-value">{value}{suffix}</div>
      </div>
    </div>
  )
}

function ScanExperience() {
  const [preview, setPreview] = useState('')
  const [filename, setFilename] = useState('')
  const [barcode, setBarcode] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const imageRef = useRef(null)
  const fileRef = useRef(null)

  async function tryBarcode() {
    if (!imageRef.current) return
    try {
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeFromImageElement(imageRef.current)
      setBarcode(result.getText())
    } catch {
      setBarcode('')
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    setScanResult(null)
    setBarcode('')
    setMessage('')
    const url = URL.createObjectURL(file)
    setPreview(url)

    const data = new FormData()
    data.append('file', file)
    setBusy(true)
    try {
      const response = await fetch(`${API}/api/scan/image`, { method: 'POST', body: data })
      if (!response.ok) throw new Error('scan')
      setScanResult(await response.json())
    } catch {
      setMessage('The scan API is not reachable. Restart the FastAPI backend after pulling the latest code.')
    } finally {
      setBusy(false)
    }
  }

  const identification = scanResult?.identification
  const regulatory = scanResult?.regulatory
  const identified = identification?.status === 'identified'

  return (
    <section className="scan-experience">
      <div className="scan-intro">
        <div className="eyebrow"><ScanLine size={15}/> SHAZAM FOR DIGITAL PRODUCT PASSPORTS</div>
        <h1>What product is this?</h1>
        <p>Take a photo or show DPPIQ a product. We identify the product first, then independently check its Digital Product Passport regulatory status and evidence.</p>
      </div>

      <div className="scan-grid">
        <article className="scan-stage card">
          {!preview ? (
            <div className="camera-empty">
              <div className="camera-orbit"><Camera size={46}/></div>
              <h2>Scan a product</h2>
              <p>On a phone, the camera button opens your device camera. You can also upload an existing photo.</p>
              <div className="scan-actions">
                <label className="primary-action">
                  <Camera size={19}/> Use camera
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile}/>
                </label>
                <label className="secondary-action">
                  <Upload size={18}/> Upload photo
                  <input type="file" accept="image/*" onChange={handleFile}/>
                </label>
              </div>
            </div>
          ) : (
            <div className="preview-wrap">
              <img ref={imageRef} src={preview} alt="Product submitted for identification" onLoad={tryBarcode}/>
              <div className="scan-corners"><span/><span/><span/><span/></div>
              {busy && <div className="scanning-line"><span>Analysing product…</span></div>}
              <div className="preview-footer">
                <div><ImagePlus size={16}/><span>{filename}</span></div>
                <label className="secondary-action compact">
                  Scan another
                  <input type="file" accept="image/*" capture="environment" onChange={handleFile}/>
                </label>
              </div>
            </div>
          )}
        </article>

        <aside className="scan-results">
          <article className="card result-card">
            <div className="result-heading"><Barcode size={18}/><span>Identification</span></div>
            {!preview && <p className="muted">Waiting for a product image.</p>}
            {barcode && <div className="barcode-hit"><span>BARCODE / QR</span><strong>{barcode}</strong></div>}
            {preview && !busy && identification?.status === 'vision_not_configured' && (
              <div className="status-explainer">
                <span className="status-dot amber"/>
                <div>
                  <strong>Camera pipeline ready</strong>
                  <p>Open-weight visual identification is not enabled yet. DPPIQ is configured to support Ollama + Qwen3-VL without making up an identification.</p>
                </div>
              </div>
            )}
            {preview && !busy && identification?.status === 'vision_provider_unreachable' && (
              <div className="status-explainer">
                <span className="status-dot amber"/>
                <div><strong>Vision provider unavailable</strong><p>{identification.message}</p></div>
              </div>
            )}
            {identified && (
              <div className="identified-product">
                <div className="confidence">{Math.round((identification.confidence || 0) * 100)}% confidence</div>
                <h2>{identification.product_type}</h2>
                <p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'No brand/model confidently detected'}</p>
                <div className="category-chip">{identification.category?.replaceAll('_', ' ')}</div>
                <small>{identification.reasoning_summary}</small>
              </div>
            )}
          </article>

          <article className="card result-card regulatory-result">
            <div className="result-heading"><Scale size={18}/><span>DPP regulatory status</span></div>
            {!scanResult && <p className="muted">Regulatory assessment appears after identification.</p>}
            {scanResult && (
              <>
                <div className={`reg-status ${regulatory?.status === 'mandatory_from_future_date' ? 'mandatory' : 'framework'}`}>
                  <span className="status-dot"/>
                  <div><strong>{regulatory?.label}</strong><p>{regulatory?.scope_note}</p></div>
                </div>
                <div className="legal-source">
                  <span>{regulatory?.classification}</span>
                  <strong>{regulatory?.legal_basis}</strong>
                  <a href={regulatory?.source_url} target="_blank" rel="noreferrer">Open official EU source ↗</a>
                </div>
              </>
            )}
          </article>

          <article className="card result-card">
            <div className="result-heading"><FileCheck2 size={18}/><span>Public DPP discovery</span></div>
            <div className="status-explainer">
              <span className="status-dot neutral"/>
              <div>
                <strong>{scanResult?.public_dpp?.status === 'not_searched_yet' ? 'Discovery engine next' : 'Waiting for scan'}</strong>
                <p>{scanResult?.public_dpp?.message || 'DPPIQ will search verified public DPP endpoints and registries without inventing a passport URL.'}</p>
              </div>
            </div>
          </article>
        </aside>
      </div>
      {message && <div className="error">{message}</div>}

      <div className="trust-strip">
        <div><Camera size={18}/><span><strong>1. Identify</strong> using barcode, visible text and vision</span></div>
        <div><Scale size={18}/><span><strong>2. Regulate</strong> with independent EU-source rules</span></div>
        <div><FileCheck2 size={18}/><span><strong>3. Discover</strong> verified public DPPs only</span></div>
      </div>
    </section>
  )
}

function IntelligenceDashboard() {
  const [passport, setPassport] = useState(null)
  const [intel, setIntel] = useState(null)
  const [change, setChange] = useState(null)
  const [evolution, setEvolution] = useState(null)
  const [reference, setReference] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/passport`).then(r => r.json()),
      fetch(`${API}/api/intelligence`).then(r => r.json()),
      fetch(`${API}/api/regulation/change`).then(r => r.json()),
      fetch(`${API}/api/evolution`).then(r => r.json()),
      fetch(`${API}/api/regulation/reference`).then(r => r.json()),
    ])
      .then(([p, i, c, e, ref]) => { setPassport(p); setIntel(i); setChange(c); setEvolution(e); setReference(ref) })
      .catch(() => setError('DPPIQ API is not reachable.'))
  }, [])

  return (
    <section className="dashboard-view">
      <section className="hero compact-hero">
        <div>
          <div className="eyebrow"><Sparkles size={15}/> DPPIQ INTELLIGENCE</div>
          <h1>Evidence, regulation and evolution.</h1>
          <p>The deeper analysis layer behind the scan experience.</p>
        </div>
        <div className="iq-ring"><div><span>{intel?.overall_iq ?? '--'}</span><small>DPP IQ</small></div></div>
      </section>
      {error && <div className="error">{error}</div>}
      <section className="metrics">
        <Metric icon={Scale} label="Regulatory readiness" value={intel?.regulatory_readiness ?? '--'} suffix="%" />
        <Metric icon={FileCheck2} label="Evidence quality" value={intel?.evidence_quality ?? '--'} suffix="%" />
        <Metric icon={Recycle} label="Circularity readiness" value={intel?.circularity_readiness ?? '--'} suffix="%" />
        <Metric icon={BrainCircuit} label="Agent generation" value="G2" />
      </section>
      <section className="grid-two">
        <article className="card panel">
          <div className="panel-title"><div><Activity size={18}/> Product passport</div><span className="pill green">DEMO</span></div>
          <h2>{passport?.identity?.name || 'Loading…'}</h2>
          <p className="muted">{passport?.identity?.product_id} · {passport?.identity?.model}</p>
          <div className="facts">
            <div><span>Carbon footprint</span><strong>{passport?.environment?.product_carbon_footprint_kg_co2e ?? '--'} kg CO₂e</strong></div>
            <div><span>Recycled content</span><strong>{passport?.circularity?.recycled_content_percent ?? '--'}%</strong></div>
            <div><span>Spare parts</span><strong>{passport?.repair?.spare_parts_available_years ?? '--'} years</strong></div>
            <div><span>Evidence objects</span><strong>{passport?.evidence?.length ?? '--'}</strong></div>
          </div>
        </article>
        <article className="card panel">
          <div className="panel-title"><div><Scale size={18}/> Regulatory basis</div><span className="pill green">OFFICIAL SOURCE</span></div>
          <h2>{reference?.title || 'ESPR reference'}</h2>
          <p className="muted">{reference?.legal_id} · verified {reference?.last_verified}</p>
          <div className="source-note">DPPIQ separates enacted EU framework rules, product-specific requirements and DPPIQ-generated intelligence.</div>
          {reference?.official_url && <a className="source-link" href={reference.official_url} target="_blank" rel="noreferrer">Open EUR-Lex source ↗</a>}
        </article>
      </section>
      <section className="grid-two">
        <article className="card panel">
          <div className="panel-title"><div><CheckCircle2 size={18}/> Requirement assessment</div><span className="pill">{intel?.requirements?.length || 0} checks</span></div>
          <div className="requirements">
            {intel?.requirements?.map(req => (
              <div className="requirement" key={req.requirement_id}>
                <span className={req.status === 'ready' ? 'dot ready' : 'dot gap'} />
                <div><strong>{req.title}</strong><small>{req.classification} · {req.rationale}</small></div>
                <span className={req.status === 'ready' ? 'state ready-text' : 'state gap-text'}>{req.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="card panel evolution">
          <div className="panel-title"><div><BrainCircuit size={18}/> Evolution engine</div><span className={`pill ${evolution?.decision === 'promote' ? 'green' : 'red'}`}>{evolution?.decision?.toUpperCase() || '...'}</span></div>
          <h2>{evolution?.candidate || 'Evaluating candidate…'}</h2>
          <p>{evolution?.reason}</p>
          <div className="delta-grid">
            <div><span>Mapping accuracy Δ</span><strong>+{((evolution?.delta?.requirement_mapping_accuracy || 0) * 100).toFixed(1)} pts</strong></div>
            <div><span>Evidence precision Δ</span><strong>+{((evolution?.delta?.evidence_precision || 0) * 100).toFixed(1)} pts</strong></div>
            <div><span>False compliance Δ</span><strong>{((evolution?.delta?.false_compliance_rate || 0) * 100).toFixed(1)} pts</strong></div>
          </div>
          <div className="evolution-rule">A candidate is promoted only when benchmark guardrails improve.</div>
        </article>
      </section>
    </section>
  )
}

function App() {
  const [view, setView] = useState('scan')

  return (
    <main>
      <header className="topbar app-nav">
        <div className="brand"><span className="logo">D</span><div><strong>DPPIQ</strong><small>Digital Product Passport Intelligence</small></div></div>
        <nav>
          <button className={view === 'scan' ? 'active' : ''} onClick={() => setView('scan')}><ScanLine size={16}/> Scan</button>
          <button className={view === 'intelligence' ? 'active' : ''} onClick={() => setView('intelligence')}><BrainCircuit size={16}/> Intelligence</button>
        </nav>
        <div className="status"><span className="pulse" /> Open-source prototype</div>
      </header>
      {view === 'scan' ? <ScanExperience/> : <IntelligenceDashboard/>}
      <footer>DPPIQ · Point at a product. Know its passport. Know its regulation.</footer>
    </main>
  )
}

export default App
