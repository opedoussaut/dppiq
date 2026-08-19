import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Barcode, BrainCircuit, Camera, FileCheck2, ImagePlus,
  ScanLine, Scale, Sparkles, Upload, X, Aperture, Eye, Database,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''

function Metric({ icon: Icon, label, value, suffix = '' }) {
  return <div className="metric card"><div className="metric-icon"><Icon size={20}/></div><div><div className="muted">{label}</div><div className="metric-value">{value}{suffix}</div></div></div>
}

function RegimeCard({ regime }) {
  const statusLabel = regime.status?.replaceAll('_', ' ').toUpperCase()
  return <div className="requirement" style={{alignItems:'start'}}>
    <span className={`dot ${regime.status === 'applicable_regime' ? 'ready' : 'gap'}`}/>
    <div>
      <strong>{regime.title}</strong>
      <small>{statusLabel} · {regime.legal_basis}</small>
      <p className="muted" style={{fontSize:'12px',lineHeight:1.5,margin:'7px 0'}}>{regime.why}</p>
      {regime.obligations?.length > 0 && <div style={{display:'grid',gap:'5px',marginTop:'8px'}}>{regime.obligations.slice(0,4).map((item,i)=><small key={i}>• {item}</small>)}</div>}
      {regime.source_url && <a className="source-link" href={regime.source_url} target="_blank" rel="noreferrer">Official source ↗</a>}
    </div>
  </div>
}

function ScanExperience({ latestScan, onScanComplete }) {
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
    video.play().then(markReady).catch(() => setMessage('The camera opened, but the browser could not start the live preview.'))
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
      setBarcode([8,12,13,14].includes(value.length) ? value : '')
    } catch { setBarcode('') }
  }

  async function submitFile(file) {
    if (!file) return
    const displayName = file.name || 'camera-capture.jpg'
    setFilename(displayName)
    setScanResult(null); setBarcode(''); setMessage('')
    const imageUrl = URL.createObjectURL(file)
    setPreview(imageUrl)
    const data = new FormData(); data.append('file', file)
    setBusy(true)
    try {
      const response = await fetch(`${API}/api/scan/image`, { method: 'POST', body: data })
      if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`)
      const result = await response.json()
      setScanResult(result)
      onScanComplete({ result, imageUrl, filename: displayName, scannedAt: new Date().toISOString() })
    } catch (error) {
      setMessage(`REGIQ scan failed: ${error?.message || 'API unavailable'}`)
    } finally { setBusy(false) }
  }

  async function handleFile(event) { await submitFile(event.target.files?.[0]) }

  async function openCamera() {
    setMessage(''); setCameraReady(false)
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('Live camera is not available in this browser.'); return }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      setStream(media); setCameraOpen(true)
    } catch (error) {
      setMessage(error?.name === 'NotAllowedError' ? 'Camera permission was denied.' : `REGIQ could not open this camera${error?.name ? ` (${error.name})` : ''}.`)
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null); setCameraOpen(false); setCameraReady(false)
  }

  async function capturePhoto() {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) { setMessage('The live camera is not ready yet.'); return }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async blob => {
      if (!blob) return
      closeCamera()
      await submitFile(new File([blob], `regiq-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  const identification = scanResult?.identification
  const profile = scanResult?.regulatory_profile
  const identified = identification?.status === 'identified'

  return <section className="scan-experience">
    <div className="scan-intro"><div className="eyebrow"><ScanLine size={15}/> SHAZAM FOR PRODUCT REGULATION</div><h1>What rules apply to this?</h1><p>Show REGIQ a physical product. We identify it first, then map it to multiple potentially applicable regulatory regimes. DPP is only shown when it is actually relevant.</p></div>
    <div className="scan-grid">
      <article className="scan-stage card">
        {!preview ? <div className="camera-empty"><div className="camera-orbit"><Camera size={46}/></div><h2>Scan a product</h2><p>Use your laptop webcam or phone camera. Product recognition is kept separate from regulatory reasoning.</p><div className="scan-actions"><button className="primary-action" onClick={openCamera}><Camera size={19}/> Open live camera</button><label className="secondary-action"><Upload size={18}/> Upload photo<input type="file" accept="image/*" onChange={handleFile}/></label></div></div> :
        <div className="preview-wrap"><img ref={imageRef} src={preview} alt="Product submitted for identification" onLoad={tryBarcode}/><div className="scan-corners"><span/><span/><span/><span/></div>{busy && <div className="scanning-line"><span>Identifying product and mapping regulation…</span></div>}<div className="preview-footer"><div><ImagePlus size={16}/><span>{filename}</span></div><button className="secondary-action compact" onClick={() => { setPreview(''); setScanResult(null); setBarcode(''); openCamera() }}>Scan another</button></div></div>}
      </article>

      <aside className="scan-results">
        <article className="card result-card">
          <div className="result-heading"><Barcode size={18}/><span>Product identification</span></div>
          {!preview && <p className="muted">Waiting for a product image.</p>}
          {barcode && <div className="barcode-hit"><span>VALID-LENGTH BARCODE SIGNAL</span><strong>{barcode}</strong></div>}
          {identified && <div className="identified-product"><div className="confidence">{Math.round((identification.confidence || 0)*100)}% confidence</div><h2>{identification.product_type}</h2><p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'No brand/model confidently detected'}</p><div className="category-chip">{identification.category?.replaceAll('_',' ')}</div><small>{identification.reasoning_summary}</small></div>}
          {preview && !busy && identification?.status && !identified && <div className="status-explainer"><span className="status-dot amber"/><div><strong>Product not identified</strong><p>{identification.message}</p></div></div>}
        </article>

        <article className="card result-card regulatory-result">
          <div className="result-heading"><Scale size={18}/><span>Regulatory profile</span></div>
          {!profile && <p className="muted">Regulatory mapping appears after identification.</p>}
          {profile && <div className="reg-status"><span className="status-dot"/><div><strong>{profile.headline}</strong><p>{profile.summary}</p></div></div>}
        </article>

        {profile?.regimes?.length > 0 && <article className="card result-card" style={{paddingBottom:'10px'}}>
          <div className="result-heading"><FileCheck2 size={18}/><span>Applicable & relevant regimes</span></div>
          <div className="requirements">{profile.regimes.map(regime=><RegimeCard key={regime.id} regime={regime}/>)}</div>
        </article>}

        {profile?.dpp && <article className="card result-card">
          <div className="result-heading"><FileCheck2 size={18}/><span>DPP / digital passport</span></div>
          <div className="status-explainer"><span className="status-dot neutral"/><div><strong>{profile.dpp.label}</strong><p>{profile.dpp.explanation}</p></div></div>
        </article>}
      </aside>
    </div>

    {message && <div className="error">{message}</div>}
    {profile?.disclaimer && <div className="source-note" style={{marginTop:'14px'}}>{profile.disclaimer}</div>}
    <div className="trust-strip"><div><Camera size={18}/><span><strong>1. Identify</strong> product and visible evidence</span></div><div><Scale size={18}/><span><strong>2. Map</strong> multiple regulatory regimes</span></div><div><FileCheck2 size={18}/><span><strong>3. Explain</strong> obligations and authoritative sources</span></div></div>

    {cameraOpen && <div className="camera-modal"><div className="camera-shell"><video ref={videoRef} autoPlay playsInline muted/><div className="live-badge"><span/> {cameraReady ? 'LIVE' : 'CONNECTING…'}</div><button className="camera-close" onClick={closeCamera}><X/></button><div className="camera-frame"><i/><i/><i/><i/></div><div className="camera-controls"><button className="shutter" onClick={capturePhoto} disabled={!cameraReady}><Aperture size={34}/></button><span>{cameraReady ? 'Place the product in the frame and capture' : 'Starting camera preview…'}</span></div></div></div>}
    <canvas ref={canvasRef} style={{display:'none'}}/>
  </section>
}

function IntelligenceDashboard({ latestScan, onReturnToScan }) {
  if (!latestScan?.result) {
    return <section className="dashboard-view">
      <section className="hero compact-hero"><div><div className="eyebrow"><Sparkles size={15}/> REGIQ INTELLIGENCE</div><h1>No product scanned yet.</h1><p>Scan a physical product first. This page will then become the intelligence dossier for that exact product.</p><button className="primary-action" onClick={onReturnToScan}><ScanLine size={18}/> Scan a product</button></div></section>
    </section>
  }

  const { result, imageUrl, filename, scannedAt } = latestScan
  const identification = result.identification || {}
  const profile = result.regulatory_profile || {}
  const regimes = profile.regimes || []
  const officialSources = regimes.filter(r => r.source_url).length
  const visibleText = identification.visible_text || []
  const confidence = Math.round((identification.confidence || 0) * 100)
  const dppLabel = profile.dpp?.label || 'Not assessed'

  return <section className="dashboard-view">
    <section className="hero compact-hero">
      <div>
        <div className="eyebrow"><Sparkles size={15}/> LIVE PRODUCT INTELLIGENCE</div>
        <h1>{identification.product_type || 'Scanned product'}</h1>
        <p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'REGIQ intelligence generated from the latest scan.'}</p>
        <small className="muted">{filename}{scannedAt ? ` · scanned ${new Date(scannedAt).toLocaleString()}` : ''}</small>
      </div>
      <div className="iq-ring"><div><span>{confidence}</span><small>IDENTITY %</small></div></div>
    </section>

    <section className="metrics">
      <Metric icon={Eye} label="Identity confidence" value={confidence} suffix="%"/>
      <Metric icon={Scale} label="Regulatory regimes" value={regimes.length}/>
      <Metric icon={Database} label="Official sources" value={officialSources}/>
      <Metric icon={FileCheck2} label="DPP status" value={profile.dpp?.status === 'required' ? 'Required' : 'Context'}/>
    </section>

    <section className="grid-two">
      <article className="card panel" style={{overflow:'hidden'}}>
        <div className="panel-title"><div><Camera size={18}/> Current scanned product</div><span className="pill green">LIVE SCAN</span></div>
        {imageUrl && <img src={imageUrl} alt="Latest scanned product" style={{width:'100%',height:'260px',objectFit:'contain',background:'#020706',borderRadius:'14px',marginTop:'16px'}}/>}
        <h2 style={{textTransform:'capitalize'}}>{identification.product_type}</h2>
        <p className="muted">{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'Brand/model not confidently identified'}</p>
        <div className="category-chip">{identification.category?.replaceAll('_',' ')}</div>
        <div className="source-note">{identification.reasoning_summary || 'No visual reasoning summary returned.'}</div>
      </article>

      <article className="card panel">
        <div className="panel-title"><div><FileCheck2 size={18}/> Observed evidence</div><span className="pill">SCAN EVIDENCE</span></div>
        <h2>What REGIQ actually saw</h2>
        {visibleText.length > 0 ? <div className="requirements">{visibleText.map((text,i)=><div className="requirement" key={i}><span className="dot ready"/><div><strong>{text}</strong><small>Visible text extracted by the recognition model</small></div></div>)}</div> : <p className="muted">No visible text was returned by the recognition model.</p>}
        <div className="source-note">Recognition provider: <strong>{identification.provider || 'unknown'}</strong><br/>Model: <strong>{identification.model_used || 'unknown'}</strong></div>
      </article>
    </section>

    <section className="grid-two">
      <article className="card panel">
        <div className="panel-title"><div><Scale size={18}/> Regulatory map</div><span className="pill green">{regimes.length} REGIMES</span></div>
        <h2>{profile.headline || 'Regulatory profile'}</h2>
        <p className="muted">{profile.summary}</p>
        <div className="requirements">{regimes.map(regime=><RegimeCard key={regime.id} regime={regime}/>)}</div>
      </article>

      <article className="card panel">
        <div className="panel-title"><div><Database size={18}/> Source & applicability intelligence</div><span className="pill green">AUTHORITATIVE LINKS</span></div>
        <h2>Traceable regulatory evidence</h2>
        <div className="requirements">{regimes.map(regime=><div className="requirement" key={regime.id}><span className={`dot ${regime.status === 'applicable_regime' ? 'ready':'gap'}`}/><div><strong>{regime.legal_basis}</strong><small>{regime.status?.replaceAll('_',' ')} · {regime.title}</small>{regime.source_url && <a className="source-link" href={regime.source_url} target="_blank" rel="noreferrer">Open official source ↗</a>}</div></div>)}</div>
        {regimes.length === 0 && <p className="muted">No regulatory regimes mapped for this scan yet.</p>}
      </article>
    </section>

    <section className="grid-two">
      <article className="card panel">
        <div className="panel-title"><div><FileCheck2 size={18}/> DPP is one module</div><span className="pill">SECONDARY</span></div>
        <h2>{dppLabel}</h2>
        <p>{profile.dpp?.explanation || 'No Digital Product Passport assessment was returned for this product.'}</p>
        <div className="source-note">The Intelligence view no longer assumes a DPP. It reports DPP only as one node of the product's broader regulatory map.</div>
      </article>

      <article className="card panel">
        <div className="panel-title"><div><BrainCircuit size={18}/> REGIQ assessment boundary</div><span className="pill">AUDITABLE</span></div>
        <h2>What is known vs inferred</h2>
        <p className="muted">Product identity comes from the vision layer. Regulatory applicability comes from REGIQ's rule mapping. Official sources remain separate from model-generated interpretation.</p>
        <div className="source-note">{profile.disclaimer || 'REGIQ is an early prototype and does not replace professional legal or conformity assessment.'}</div>
      </article>
    </section>
  </section>
}

function App(){
  const [view,setView]=useState('scan')
  const [latestScan,setLatestScan]=useState(null)
  return <main>
    <header className="topbar app-nav"><div className="brand"><span className="logo">R</span><div><strong>REGIQ</strong><small>Regulation Intelligence</small></div></div><nav><button className={view==='scan'?'active':''} onClick={()=>setView('scan')}><ScanLine size={16}/> Scan</button><button className={view==='intelligence'?'active':''} onClick={()=>setView('intelligence')}><BrainCircuit size={16}/> Intelligence</button></nav><div className="status"><span className="pulse"/> {latestScan ? 'Live scan loaded' : 'Open-source prototype'}</div></header>
    {view==='scan' ? <ScanExperience latestScan={latestScan} onScanComplete={setLatestScan}/> : <IntelligenceDashboard latestScan={latestScan} onReturnToScan={()=>setView('scan')}/>} 
    <footer>REGIQ · Point at a product. Know the rules. Know what comes next.</footer>
  </main>
}
export default App
