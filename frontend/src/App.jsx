import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  Aperture, Barcode, BrainCircuit, Camera, CheckCircle2, Database, Download,
  Eye, FileCheck2, History, ImagePlus, KeyRound, Menu, ScanLine, Scale,
  Settings, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''
const HISTORY_KEY = 'regiq.scanHistory.v1'

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 12))) } catch {}
}

function Metric({ icon: Icon, label, value, suffix = '' }) {
  return <div className="metric card"><div className="metric-icon"><Icon size={20}/></div><div><div className="muted">{label}</div><div className="metric-value">{value}{suffix}</div></div></div>
}

function RegimeCard({ regime }) {
  const statusLabel = regime.status?.replaceAll('_', ' ').toUpperCase()
  return <div className="requirement regime-card">
    <span className={`dot ${regime.status === 'applicable_regime' ? 'ready' : 'gap'}`}/>
    <div>
      <strong>{regime.title}</strong>
      <small>{statusLabel} · {regime.legal_basis}</small>
      <p className="muted regime-why">{regime.why}</p>
      {regime.obligations?.length > 0 && <div className="obligation-list">{regime.obligations.slice(0,4).map((item,i)=><small key={i}>• {item}</small>)}</div>}
      {regime.source_url && <a className="source-link" href={regime.source_url} target="_blank" rel="noreferrer">Official source ↗</a>}
    </div>
  </div>
}

function ScanExperience({ latestScan, onScanComplete, hfToken }) {
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
      setBarcode([8,12,13,14].includes(value.length) ? value : '')
    } catch { setBarcode('') }
  }

  async function submitFile(file) {
    if (!file) return
    const displayName = file.name || 'camera-capture.jpg'
    const imageUrl = URL.createObjectURL(file)
    setFilename(displayName); setPreview(imageUrl); setScanResult(null); setBarcode(''); setMessage(''); setBusy(true)
    const data = new FormData(); data.append('file', file)
    const headers = hfToken ? { 'X-REGIQ-HF-Token': hfToken } : {}
    try {
      const response = await fetch(`${API}/api/scan/image`, { method: 'POST', headers, body: data })
      if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`)
      const result = await response.json()
      setScanResult(result)
      onScanComplete({ result, imageUrl, filename: displayName, scannedAt: new Date().toISOString() })
    } catch (error) {
      setMessage(`REGIQ scan failed: ${error?.message || 'API unavailable'}`)
    } finally { setBusy(false) }
  }

  async function openCamera() {
    setMessage(''); setCameraReady(false)
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('Live camera is not available in this browser. Use Upload photo instead.'); return }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      setStream(media); setCameraOpen(true)
    } catch (error) {
      setMessage(error?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this site and try again.' : `REGIQ could not open this camera${error?.name ? ` (${error.name})` : ''}.`)
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null); setCameraOpen(false); setCameraReady(false)
  }

  async function capturePhoto() {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) { setMessage('The camera is not ready yet.'); return }
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
    <div className="scan-intro"><div className="eyebrow"><ScanLine size={15}/> SHAZAM FOR PRODUCT REGULATION</div><h1>What rules apply to this?</h1><p>Point your phone or laptop camera at a product. REGIQ identifies it, maps relevant regulatory regimes, and links the reasoning back to authoritative sources.</p></div>
    <div className="scan-grid">
      <article className="scan-stage card">
        {!preview ? <div className="camera-empty">
          <div className="camera-orbit"><Camera size={46}/></div><h2>Scan a product</h2><p>Camera is the fastest path on mobile. You can also upload an existing photo.</p>
          <div className="scan-actions"><button className="primary-action" onClick={openCamera}><Camera size={19}/> Open camera</button><label className="secondary-action"><Upload size={18}/> Upload photo<input type="file" accept="image/*" capture="environment" onChange={e=>submitFile(e.target.files?.[0])}/></label></div>
        </div> : <div className="preview-wrap"><img ref={imageRef} src={preview} alt="Product submitted for identification" onLoad={tryBarcode}/><div className="scan-corners"><span/><span/><span/><span/></div>{busy && <div className="scanning-line"><span>Identifying product and mapping regulation…</span></div>}<div className="preview-footer"><div><ImagePlus size={16}/><span>{filename}</span></div><button className="secondary-action compact" onClick={()=>{setPreview('');setScanResult(null);setBarcode('')}}>New scan</button></div></div>}
      </article>

      <aside className="scan-results">
        <article className="card result-card"><div className="result-heading"><Barcode size={18}/><span>Product identification</span></div>
          {!preview && <p className="muted">Waiting for a product image.</p>}
          {barcode && <div className="barcode-hit"><span>VALID-LENGTH BARCODE SIGNAL</span><strong>{barcode}</strong></div>}
          {identified && <div className="identified-product"><div className="confidence">{Math.round((identification.confidence||0)*100)}% confidence</div><h2>{identification.product_type}</h2><p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'No brand/model confidently detected'}</p><div className="category-chip">{identification.category?.replaceAll('_',' ')}</div><small>{identification.reasoning_summary}</small></div>}
          {preview && !busy && identification?.status && !identified && <div className="status-explainer"><span className="status-dot amber"/><div><strong>Product not identified</strong><p>{identification.message}</p></div></div>}
        </article>
        <article className="card result-card regulatory-result"><div className="result-heading"><Scale size={18}/><span>Regulatory profile</span></div>{!profile && <p className="muted">Regulatory mapping appears after identification.</p>}{profile && <div className="reg-status"><span className="status-dot"/><div><strong>{profile.headline}</strong><p>{profile.summary}</p></div></div>}</article>
        {profile?.regimes?.length > 0 && <article className="card result-card"><div className="result-heading"><FileCheck2 size={18}/><span>Applicable & relevant regimes</span></div><div className="requirements">{profile.regimes.map(r=><RegimeCard key={r.id} regime={r}/>)}</div></article>}
        {profile?.dpp && <article className="card result-card"><div className="result-heading"><FileCheck2 size={18}/><span>DPP / digital passport</span></div><div className="status-explainer"><span className="status-dot neutral"/><div><strong>{profile.dpp.label}</strong><p>{profile.dpp.explanation}</p></div></div></article>}
      </aside>
    </div>
    {message && <div className="error">{message}</div>}
    {profile?.disclaimer && <div className="source-note disclaimer">{profile.disclaimer}</div>}
    <div className="trust-strip"><div><Camera size={18}/><span><strong>1. Identify</strong> the product</span></div><div><Scale size={18}/><span><strong>2. Map</strong> regulatory regimes</span></div><div><FileCheck2 size={18}/><span><strong>3. Explain</strong> with sources</span></div></div>
    {cameraOpen && <div className="camera-modal"><div className="camera-shell"><video ref={videoRef} autoPlay playsInline muted/><div className="live-badge"><span/> {cameraReady?'LIVE':'CONNECTING…'}</div><button className="camera-close" onClick={closeCamera}><X/></button><div className="camera-frame"><i/><i/><i/><i/></div><div className="camera-controls"><button className="shutter" onClick={capturePhoto} disabled={!cameraReady}><Aperture size={34}/></button><span>{cameraReady?'Center the product and capture':'Starting camera…'}</span></div></div></div>}
    <canvas ref={canvasRef} style={{display:'none'}}/>
  </section>
}

function IntelligenceDashboard({ latestScan, onReturnToScan }) {
  if (!latestScan?.result) return <section className="dashboard-view"><section className="hero compact-hero"><div><div className="eyebrow"><Sparkles size={15}/> REGIQ INTELLIGENCE</div><h1>No product scanned yet.</h1><p>Scan a product first. This page becomes the intelligence dossier for that exact product.</p><button className="primary-action" onClick={onReturnToScan}><ScanLine size={18}/> Scan a product</button></div></section></section>
  const { result, imageUrl, filename, scannedAt } = latestScan
  const identification = result.identification || {}; const profile = result.regulatory_profile || {}; const regimes = profile.regimes || []
  const confidence = Math.round((identification.confidence||0)*100); const provenance = identification.model_provenance || {}
  return <section className="dashboard-view">
    <section className="hero compact-hero"><div><div className="eyebrow"><Sparkles size={15}/> LIVE PRODUCT INTELLIGENCE</div><h1>{identification.product_type || 'Scanned product'}</h1><p>{[identification.brand, identification.model].filter(Boolean).join(' · ') || 'Intelligence generated from the latest scan.'}</p><small className="muted">{filename}{scannedAt?` · ${new Date(scannedAt).toLocaleString()}`:''}</small></div><div className="iq-ring"><div><span>{confidence}</span><small>IDENTITY %</small></div></div></section>
    <section className="metrics"><Metric icon={Eye} label="Identity confidence" value={confidence} suffix="%"/><Metric icon={Scale} label="Regulatory regimes" value={regimes.length}/><Metric icon={Database} label="Official sources" value={regimes.filter(r=>r.source_url).length}/><Metric icon={FileCheck2} label="DPP" value={profile.dpp?.status==='mandatory_from_future_date'?'Required':'Context'}/></section>
    <section className="grid-two"><article className="card panel"><div className="panel-title"><div><Camera size={18}/> Current product</div><span className="pill green">LATEST SCAN</span></div>{imageUrl&&<img className="intel-product-image" src={imageUrl} alt="Latest scanned product"/>}<h2>{identification.product_type}</h2><p className="muted">{[identification.brand,identification.model].filter(Boolean).join(' · ')}</p><div className="category-chip">{identification.category?.replaceAll('_',' ')}</div><div className="source-note">{identification.reasoning_summary}</div></article>
      <article className="card panel"><div className="panel-title"><div><ShieldCheck size={18}/> Recognition provenance</div><span className="pill">TRACEABLE</span></div><h2>{identification.model_used || 'Model unavailable'}</h2><div className="facts single"><div><span>Provider</span><strong>{identification.provider || 'unknown'}</strong></div><div><span>Model license</span><strong>{provenance.license || 'not declared'}</strong></div><div><span>Model revision</span><strong>{provenance.revision || 'not reported'}</strong></div><div><span>Visible text</span><strong>{(identification.visible_text||[]).length} signals</strong></div></div>{provenance.source_url&&<a className="source-link" href={provenance.source_url} target="_blank" rel="noreferrer">Open model source ↗</a>}</article></section>
    <section className="grid-two"><article className="card panel"><div className="panel-title"><div><Scale size={18}/> Regulatory map</div><span className="pill green">{regimes.length} REGIMES</span></div><h2>{profile.headline}</h2><p className="muted">{profile.summary}</p><div className="requirements">{regimes.map(r=><RegimeCard key={r.id} regime={r}/>)}</div></article>
      <article className="card panel"><div className="panel-title"><div><Database size={18}/> Evidence & sources</div><span className="pill green">OFFICIAL LINKS</span></div>{regimes.map(r=><div className="source-row" key={r.id}><div><strong>{r.title}</strong><small>{r.classification}</small></div>{r.source_url&&<a href={r.source_url} target="_blank" rel="noreferrer">Open ↗</a>}</div>)}<div className="source-note"><strong>DPP:</strong> {profile.dpp?.label}<br/>{profile.dpp?.explanation}</div></article></section>
  </section>
}

function SettingsView({ config, provenance, hfToken, setHfToken, installPrompt, onInstall }) {
  const byo = config?.vision?.byo_hf_token_enabled
  const serverToken = config?.vision?.server_token_configured
  return <section className="dashboard-view settings-view">
    <section className="hero compact-hero"><div><div className="eyebrow"><Settings size={15}/> SETUP</div><h1>Ready in minutes.</h1><p>REGIQ can use the host's inference credentials or your own Hugging Face token for this browser session.</p></div></section>
    <section className="grid-two"><article className="card panel"><div className="panel-title"><div><KeyRound size={18}/> Vision access</div><span className={`pill ${config?.vision?.enabled?'green':'red'}`}>{config?.vision?.enabled?'ENABLED':'DISABLED'}</span></div><h2>{config?.vision?.provider || 'Not configured'}</h2><p className="muted">Model: {config?.vision?.model || '—'}</p>
      {byo ? <><label className="field-label">Hugging Face token</label><input className="token-input" type="password" value={hfToken} onChange={e=>setHfToken(e.target.value)} placeholder="hf_…" autoComplete="off"/><div className="source-note">Stored only in this page's memory. It is sent directly to the REGIQ backend with each scan and is not written to localStorage.</div></> : <div className="source-note">BYO token is disabled by this deployment. {serverToken?'The server has its own inference token configured.':'Ask the host to configure a server token or enable REGIQ_ALLOW_BYO_HF_TOKEN.'}</div>}
    </article>
    <article className="card panel"><div className="panel-title"><div><Download size={18}/> Mobile app</div><span className="pill green">PWA</span></div><h2>Install REGIQ</h2><p className="muted">On supported browsers REGIQ can be installed to the home screen and opens like an app.</p>{installPrompt?<button className="primary-action" onClick={onInstall}><Download size={18}/> Install REGIQ</button>:<div className="source-note"><strong>iPhone/iPad:</strong> open REGIQ in Safari → Share → Add to Home Screen.<br/><br/><strong>Android/Chrome:</strong> browser menu → Install app / Add to Home screen.</div>}</article></section>
    <section className="grid-two"><article className="card panel"><div className="panel-title"><div><ShieldCheck size={18}/> Software provenance</div><span className="pill green">OPEN SOURCE</span></div><h2>{provenance?.software?.name || 'REGIQ'} {provenance?.software?.version || ''}</h2><div className="facts single"><div><span>License</span><strong>{provenance?.software?.license || 'Apache-2.0'}</strong></div><div><span>Repository</span><strong>opedoussaut/regiq</strong></div></div>{provenance?.software?.repository&&<a className="source-link" href={provenance.software.repository} target="_blank" rel="noreferrer">Open GitHub repository ↗</a>}</article>
      <article className="card panel"><div className="panel-title"><div><CheckCircle2 size={18}/> Privacy model</div><span className="pill">TRANSPARENT</span></div><h2>What stays where</h2><div className="requirements"><div className="requirement"><span className="dot ready"/><div><strong>HF token</strong><small>Memory only; not persisted by the frontend.</small></div></div><div className="requirement"><span className="dot ready"/><div><strong>Scan history</strong><small>Product metadata and regulatory results remain in local browser storage.</small></div></div><div className="requirement"><span className="dot gap"/><div><strong>Product image</strong><small>Sent to the configured vision provider for recognition.</small></div></div></div></article></section>
  </section>
}

function HistoryView({ history, onSelect, onClear }) {
  return <section className="dashboard-view"><section className="hero compact-hero"><div><div className="eyebrow"><History size={15}/> RECENT SCANS</div><h1>Your regulation trail.</h1><p>Stored locally in this browser. No account is required.</p></div>{history.length>0&&<button className="secondary-action" onClick={onClear}>Clear history</button>}</section>
    {history.length===0?<div className="card empty-state">No saved scans yet.</div>:<div className="history-grid">{history.map(item=>{const id=item.result?.identification||{};const profile=item.result?.regulatory_profile||{};return <button className="card history-card" key={item.id} onClick={()=>onSelect(item)}><div className="history-icon"><ScanLine size={22}/></div><div><strong>{id.product_type || 'Scanned product'}</strong><span>{[id.brand,id.model].filter(Boolean).join(' · ') || id.category?.replaceAll('_',' ')}</span><small>{profile.regimes?.length||0} regulatory regimes · {new Date(item.scannedAt).toLocaleString()}</small></div></button>})}</div>}
  </section>
}

function App() {
  const [view,setView]=useState('scan')
  const [latestScan,setLatestScan]=useState(null)
  const [history,setHistory]=useState(readHistory)
  const [hfToken,setHfToken]=useState('')
  const [config,setConfig]=useState(null)
  const [provenance,setProvenance]=useState(null)
  const [installPrompt,setInstallPrompt]=useState(null)
  const [mobileNav,setMobileNav]=useState(false)

  useEffect(()=>{fetch(`${API}/api/scan/config`).then(r=>r.ok?r.json():null).then(setConfig).catch(()=>{});fetch(`${API}/api/model/provenance`).then(r=>r.ok?r.json():null).then(setProvenance).catch(()=>{})},[])
  useEffect(()=>{const handler=e=>{e.preventDefault();setInstallPrompt(e)};window.addEventListener('beforeinstallprompt',handler);return()=>window.removeEventListener('beforeinstallprompt',handler)},[])

  function completeScan(scan) {
    setLatestScan(scan)
    const persisted={id:crypto.randomUUID?.()||String(Date.now()),scannedAt:scan.scannedAt,filename:scan.filename,result:scan.result}
    const next=[persisted,...history].slice(0,12);setHistory(next);saveHistory(next)
  }
  function chooseHistory(item){setLatestScan({...item,imageUrl:''});setView('intelligence')}
  async function install(){if(!installPrompt)return;await installPrompt.prompt();setInstallPrompt(null)}
  const nav=(next)=>{setView(next);setMobileNav(false)}

  return <main><header className="topbar app-nav"><div className="brand"><span className="logo">R</span><div><strong>REGIQ</strong><small>Regulation Intelligence</small></div></div><button className="mobile-menu" onClick={()=>setMobileNav(!mobileNav)}><Menu size={22}/></button><nav className={mobileNav?'open':''}><button className={view==='scan'?'active':''} onClick={()=>nav('scan')}><ScanLine size={16}/> Scan</button><button className={view==='intelligence'?'active':''} onClick={()=>nav('intelligence')}><BrainCircuit size={16}/> Intelligence</button><button className={view==='history'?'active':''} onClick={()=>nav('history')}><History size={16}/> History</button><button className={view==='settings'?'active':''} onClick={()=>nav('settings')}><Settings size={16}/> Setup</button></nav><div className="status"><span className="pulse"/> Open-source prototype</div></header>
    {view==='scan'&&<ScanExperience latestScan={latestScan} onScanComplete={completeScan} hfToken={hfToken}/>} 
    {view==='intelligence'&&<IntelligenceDashboard latestScan={latestScan} onReturnToScan={()=>setView('scan')}/>} 
    {view==='history'&&<HistoryView history={history} onSelect={chooseHistory} onClear={()=>{setHistory([]);saveHistory([])}}/>}
    {view==='settings'&&<SettingsView config={config} provenance={provenance} hfToken={hfToken} setHfToken={setHfToken} installPrompt={installPrompt} onInstall={install}/>} 
    <footer>REGIQ · Point at a product. Know the rules. Know what comes next.</footer></main>
}

export default App
