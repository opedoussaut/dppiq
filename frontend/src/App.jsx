import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Activity, Barcode, BrainCircuit, Camera, CheckCircle2, FileCheck2, ImagePlus,
  Recycle, ScanLine, Scale, Sparkles, Upload, X, Aperture,
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
      {regime.obligations?.length > 0 && <div style={{display:'grid',gap:'5px',marginTop:'8px'}}>{regime.obligations.slice(0,3).map((item,i)=><small key={i}>• {item}</small>)}</div>}
      {regime.source_url && <a className="source-link" href={regime.source_url} target="_blank" rel="noreferrer">Official source ↗</a>}
    </div>
  </div>
}

function ScanExperience() {
  const [preview, setPreview] = useState('')
  const [filename, setFilename] = useState('')
  const [barcode, setBarcode] = useState('')
  const [scanResult, setScanResult] = useState(null)
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
    setFilename(file.name || 'camera-capture.jpg')
    setScanResult(null); setBarcode(''); setMessage('')
    setPreview(URL.createObjectURL(file))
    const data = new FormData(); data.append('file', file)
    setBusy(true)
    try {
      const response = await fetch(`${API}/api/scan/image`, { method: 'POST', body: data })
      if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`)
      setScanResult(await response.json())
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

function IntelligenceDashboard() {
  const [passport,setPassport]=useState(null), [intel,setIntel]=useState(null), [evolution,setEvolution]=useState(null), [reference,setReference]=useState(null), [error,setError]=useState('')
  useEffect(()=>{Promise.all([fetch(`${API}/api/passport`).then(r=>r.json()),fetch(`${API}/api/intelligence`).then(r=>r.json()),fetch(`${API}/api/evolution`).then(r=>r.json()),fetch(`${API}/api/regulation/reference`).then(r=>r.json())]).then(([p,i,e,ref])=>{setPassport(p);setIntel(i);setEvolution(e);setReference(ref)}).catch(()=>setError('REGIQ API is not reachable.'))},[])
  return <section className="dashboard-view"><section className="hero compact-hero"><div><div className="eyebrow"><Sparkles size={15}/> REGIQ INTELLIGENCE</div><h1>Evidence, regulation and evolution.</h1><p>The deeper analysis layer behind the scan experience. DPP intelligence is one module, not the product definition.</p></div><div className="iq-ring"><div><span>{intel?.overall_iq??'--'}</span><small>REG IQ</small></div></div></section>{error&&<div className="error">{error}</div>}<section className="metrics"><Metric icon={Scale} label="Regulatory readiness" value={intel?.regulatory_readiness??'--'} suffix="%"/><Metric icon={FileCheck2} label="Evidence quality" value={intel?.evidence_quality??'--'} suffix="%"/><Metric icon={Recycle} label="Circularity readiness" value={intel?.circularity_readiness??'--'} suffix="%"/><Metric icon={BrainCircuit} label="Agent generation" value="G2"/></section><section className="grid-two"><article className="card panel"><div className="panel-title"><div><Activity size={18}/> DPP module</div><span className="pill green">DEMO</span></div><h2>{passport?.identity?.name||'Loading…'}</h2><p className="muted">{passport?.identity?.product_id} · {passport?.identity?.model}</p></article><article className="card panel"><div className="panel-title"><div><Scale size={18}/> Regulatory basis</div><span className="pill green">OFFICIAL SOURCE</span></div><h2>{reference?.title||'Regulatory reference'}</h2><p className="muted">{reference?.legal_id} · verified {reference?.last_verified}</p><div className="source-note">REGIQ separates authoritative sources, extracted rules, applicability interpretation and generated intelligence.</div></article></section><section className="grid-two"><article className="card panel"><div className="panel-title"><div><CheckCircle2 size={18}/> Requirement assessment</div><span className="pill">{intel?.requirements?.length||0} checks</span></div><div className="requirements">{intel?.requirements?.map(req=><div className="requirement" key={req.requirement_id}><span className={req.status==='ready'?'dot ready':'dot gap'}/><div><strong>{req.title}</strong><small>{req.classification} · {req.rationale}</small></div></div>)}</div></article><article className="card panel evolution"><div className="panel-title"><div><BrainCircuit size={18}/> Evolution engine</div><span className={`pill ${evolution?.decision==='promote'?'green':'red'}`}>{evolution?.decision?.toUpperCase()||'...'}</span></div><h2>{evolution?.candidate||'Evaluating candidate…'}</h2><p>{evolution?.reason}</p></article></section></section>
}

function App(){const[view,setView]=useState('scan');return <main><header className="topbar app-nav"><div className="brand"><span className="logo">R</span><div><strong>REGIQ</strong><small>Regulation Intelligence</small></div></div><nav><button className={view==='scan'?'active':''} onClick={()=>setView('scan')}><ScanLine size={16}/> Scan</button><button className={view==='intelligence'?'active':''} onClick={()=>setView('intelligence')}><BrainCircuit size={16}/> Intelligence</button></nav><div className="status"><span className="pulse"/> Open-source prototype</div></header>{view==='scan'?<ScanExperience/>:<IntelligenceDashboard/>}<footer>REGIQ · Point at a product. Know the rules. Know what comes next.</footer></main>}
export default App
