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
    video.play().then(markReady).catch(() => setMessage('The camera opened, but the browser could not start the live preview. Try closing and reopening it.'))
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
      setBarcode(result.getText())
    } catch { setBarcode('') }
  }

  async function submitFile(file) {
    if (!file) return
    setFilename(file.name || 'camera-capture.jpg')
    setScanResult(null); setBarcode(''); setMessage('')
    const url = URL.createObjectURL(file)
    setPreview(url)
    const data = new FormData(); data.append('file', file)
    setBusy(true)
    try {
      const response = await fetch(`${API}/api/scan/image`, { method: 'POST', body: data })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
      }
      setScanResult(await response.json())
    } catch (error) {
      setMessage(`REGIQ scan failed: ${error?.message || 'API unavailable'}`)
    } finally { setBusy(false) }
  }

  async function handleFile(event) { await submitFile(event.target.files?.[0]) }

  async function openCamera() {
    setMessage(''); setCameraReady(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Live camera is not available in this browser. Use Upload photo instead.')
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      setStream(media)
      setCameraOpen(true)
    } catch (error) {
      setMessage(error?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser site settings and try again.' : `REGIQ could not open this device camera${error?.name ? ` (${error.name})` : ''}. You can still upload a photo.`)
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null); setCameraOpen(false); setCameraReady(false)
  }

  async function capturePhoto() {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) {
      setMessage('The live camera is not ready yet. Wait for the picture to appear, then capture.')
      return
    }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async blob => {
      if (!blob) return
      closeCamera()
      await submitFile(new File([blob], `regiq-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  const identification = scanResult?.identification
  const regulatory = scanResult?.regulatory
  const identified = identification?.status === 'identified'

  return <section className="scan-experience">
    <div className="scan-intro"><div className="eyebrow"><ScanLine size={15}/> SHAZAM FOR PRODUCT REGULATION</div><h1>What rules apply to this?</h1><p>Show REGIQ a physical product. We identify it first, then independently map it to regulatory regimes, standards, evidence requirements and Digital Product Passport obligations where relevant.</p></div>
    <div className="scan-grid">
      <article className="scan-stage card">
        {!preview ? <div className="camera-empty"><div className="camera-orbit"><Camera size={46}/></div><h2>Scan a product</h2><p>Use your laptop webcam or phone camera live. REGIQ keeps product recognition separate from regulatory reasoning.</p><div className="scan-actions"><button className="primary-action" onClick={openCamera}><Camera size={19}/> Open live camera</button><label className="secondary-action"><Upload size={18}/> Upload photo<input type="file" accept="image/*" onChange={handleFile}/></label></div></div> :
        <div className="preview-wrap"><img ref={imageRef} src={preview} alt="Product submitted for identification" onLoad={tryBarcode}/><div className="scan-corners"><span/><span/><span/><span/></div>{busy && <div className="scanning-line"><span>Identifying product and checking regulation…</span></div>}<div className="preview-footer"><div><ImagePlus size={16}/><span>{filename}</span></div><button className="secondary-action compact" onClick={() => { setPreview(''); setScanResult(null); setBarcode(''); openCamera() }}>Scan another</button></div></div>}
      </article>
      <aside className="scan-results">
        <article className="card result-card"><div className="result-heading"><Barcode size={18}/><span>Product identification</span></div>{!preview && <p className="muted">Waiting for a product image.</p>}{barcode && <div className="barcode-hit"><span>UNVERIFIED BARCODE / QR SIGNAL</span><strong>{barcode}</strong></div>}{preview && !busy && identification?.status === 'vision_not_configured' && <div className="status-explainer"><span className="status-dot amber"/><div><strong>Camera pipeline ready</strong><p>Visual identification is not enabled yet. Barcode/QR detection still runs locally in the browser.</p></div></div>}{preview && !busy && identification?.status === 'vision_provider_unreachable' && <div className="status-explainer"><span className="status-dot amber"/><div><strong>Vision provider unavailable</strong><p>{identification.message}</p></div></div>}{identified && <div className="identified-product"><div className="confidence">{Math.round((identification.confidence || 0)*100)}% confidence</div><h2>{identification.product_type}</h2><p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'No brand/model confidently detected'}</p><div className="category-chip">{identification.category?.replaceAll('_',' ')}</div><small>{identification.reasoning_summary}</small></div>}</article>
        <article className="card result-card regulatory-result"><div className="result-heading"><Scale size={18}/><span>Regulatory status</span></div>{!scanResult && <p className="muted">Regulatory assessment appears after identification.</p>}{scanResult && <><div className={`reg-status ${regulatory?.status === 'mandatory_from_future_date' ? 'mandatory':'framework'}`}><span className="status-dot"/><div><strong>{regulatory?.label}</strong><p>{regulatory?.scope_note}</p></div></div>{regulatory?.legal_basis && <div className="legal-source"><span>{regulatory?.classification}</span><strong>{regulatory?.legal_basis}</strong>{regulatory?.source_url && <a href={regulatory.source_url} target="_blank" rel="noreferrer">Open official source ↗</a>}</div>}</>}</article>
        <article className="card result-card"><div className="result-heading"><FileCheck2 size={18}/><span>Regulatory evidence & passports</span></div><div className="status-explainer"><span className="status-dot neutral"/><div><strong>{scanResult?.public_dpp?.status === 'not_searched_yet' ? 'Discovery engine next':'Waiting for identification'}</strong><p>{scanResult?.public_dpp?.message || 'REGIQ will search authoritative sources, standards references and verified public product-passport endpoints without inventing evidence.'}</p></div></div></article>
      </aside>
    </div>
    {message && <div className="error">{message}</div>}
    <div className="trust-strip"><div><Camera size={18}/><span><strong>1. Identify</strong> using camera, validated identifiers, visible text and vision</span></div><div><Scale size={18}/><span><strong>2. Map regulation</strong> against authoritative public sources</span></div><div><FileCheck2 size={18}/><span><strong>3. Explain</strong> obligations, evidence and DPPs where applicable</span></div></div>
    {cameraOpen && <div className="camera-modal"><div className="camera-shell"><video ref={videoRef} autoPlay playsInline muted/><div className="live-badge"><span/> {cameraReady ? 'LIVE' : 'CONNECTING…'}</div><button className="camera-close" onClick={closeCamera} aria-label="Close camera"><X/></button><div className="camera-frame"><i/><i/><i/><i/></div><div className="camera-controls"><button className="shutter" onClick={capturePhoto} disabled={!cameraReady} aria-label="Take photo"><Aperture size={34}/></button><span>{cameraReady ? 'Place the product in the frame and capture' : 'Starting camera preview…'}</span></div></div></div>}
    <canvas ref={canvasRef} style={{display:'none'}}/>
  </section>
}

function IntelligenceDashboard() {
  const [passport,setPassport]=useState(null), [intel,setIntel]=useState(null), [evolution,setEvolution]=useState(null), [reference,setReference]=useState(null), [error,setError]=useState('')
  useEffect(()=>{Promise.all([fetch(`${API}/api/passport`).then(r=>r.json()),fetch(`${API}/api/intelligence`).then(r=>r.json()),fetch(`${API}/api/evolution`).then(r=>r.json()),fetch(`${API}/api/regulation/reference`).then(r=>r.json())]).then(([p,i,e,ref])=>{setPassport(p);setIntel(i);setEvolution(e);setReference(ref)}).catch(()=>setError('REGIQ API is not reachable.'))},[])
  return <section className="dashboard-view"><section className="hero compact-hero"><div><div className="eyebrow"><Sparkles size={15}/> REGIQ INTELLIGENCE</div><h1>Evidence, regulation and evolution.</h1><p>The deeper analysis layer behind the scan experience. DPP intelligence is now one regulatory module inside REGIQ.</p></div><div className="iq-ring"><div><span>{intel?.overall_iq??'--'}</span><small>REG IQ</small></div></div></section>{error&&<div className="error">{error}</div>}<section className="metrics"><Metric icon={Scale} label="Regulatory readiness" value={intel?.regulatory_readiness??'--'} suffix="%"/><Metric icon={FileCheck2} label="Evidence quality" value={intel?.evidence_quality??'--'} suffix="%"/><Metric icon={Recycle} label="Circularity readiness" value={intel?.circularity_readiness??'--'} suffix="%"/><Metric icon={BrainCircuit} label="Agent generation" value="G2"/></section><section className="grid-two"><article className="card panel"><div className="panel-title"><div><Activity size={18}/> DPP module</div><span className="pill green">DEMO</span></div><h2>{passport?.identity?.name||'Loading…'}</h2><p className="muted">{passport?.identity?.product_id} · {passport?.identity?.model}</p><div className="facts"><div><span>Carbon footprint</span><strong>{passport?.environment?.product_carbon_footprint_kg_co2e??'--'} kg CO₂e</strong></div><div><span>Recycled content</span><strong>{passport?.circularity?.recycled_content_percent??'--'}%</strong></div><div><span>Spare parts</span><strong>{passport?.repair?.spare_parts_available_years??'--'} years</strong></div><div><span>Evidence objects</span><strong>{passport?.evidence?.length??'--'}</strong></div></div></article><article className="card panel"><div className="panel-title"><div><Scale size={18}/> Regulatory basis</div><span className="pill green">OFFICIAL SOURCE</span></div><h2>{reference?.title||'Regulatory reference'}</h2><p className="muted">{reference?.legal_id} · verified {reference?.last_verified}</p><div className="source-note">REGIQ separates authoritative sources, extracted rules, applicability interpretation and REGIQ-generated intelligence.</div>{reference?.official_url&&<a className="source-link" href={reference.official_url} target="_blank" rel="noreferrer">Open official source ↗</a>}</article></section><section className="grid-two"><article className="card panel"><div className="panel-title"><div><CheckCircle2 size={18}/> Requirement assessment</div><span className="pill">{intel?.requirements?.length||0} checks</span></div><div className="requirements">{intel?.requirements?.map(req=><div className="requirement" key={req.requirement_id}><span className={req.status==='ready'?'dot ready':'dot gap'}/><div><strong>{req.title}</strong><small>{req.classification} · {req.rationale}</small></div><span className={req.status==='ready'?'state ready-text':'state gap-text'}>{req.status.toUpperCase()}</span></div>)}</div></article><article className="card panel evolution"><div className="panel-title"><div><BrainCircuit size={18}/> Evolution engine</div><span className={`pill ${evolution?.decision==='promote'?'green':'red'}`}>{evolution?.decision?.toUpperCase()||'...'}</span></div><h2>{evolution?.candidate||'Evaluating candidate…'}</h2><p>{evolution?.reason}</p><div className="evolution-rule">A candidate is promoted only when benchmark guardrails improve.</div></article></section></section>
}

function App(){const[view,setView]=useState('scan');return <main><header className="topbar app-nav"><div className="brand"><span className="logo">R</span><div><strong>REGIQ</strong><small>Regulation Intelligence</small></div></div><nav><button className={view==='scan'?'active':''} onClick={()=>setView('scan')}><ScanLine size={16}/> Scan</button><button className={view==='intelligence'?'active':''} onClick={()=>setView('intelligence')}><BrainCircuit size={16}/> Intelligence</button></nav><div className="status"><span className="pulse"/> Open-source prototype</div></header>{view==='scan'?<ScanExperience/>:<IntelligenceDashboard/>}<footer>REGIQ · Point at a product. Know the rules. Know what comes next.</footer></main>}
export default App
