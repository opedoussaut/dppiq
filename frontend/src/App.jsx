import { useEffect, useState } from 'react'
import {
  Activity, BrainCircuit, CheckCircle2, ExternalLink, FileCheck2, Info,
  Layers3, Recycle, Scale, ShieldCheck, Sparkles
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''

const labels = {
  EU_FRAMEWORK: { text: 'EU FRAMEWORK', cls: 'eu' },
  PRODUCT_SPECIFIC: { text: 'PRODUCT-SPECIFIC', cls: 'specific' },
  DPPIQ_INTELLIGENCE: { text: 'DPPIQ INTELLIGENCE', cls: 'iq' },
}

function Badge({ type }) {
  const meta = labels[type] || { text: type, cls: '' }
  return <span className={`classification ${meta.cls}`}>{meta.text}</span>
}

function Metric({ icon: Icon, label, value, suffix = '', intelligence = false }) {
  return (
    <div className="metric card">
      <div className="metric-icon"><Icon size={20} /></div>
      <div>
        <div className="metric-label">{label} {intelligence && <Badge type="DPPIQ_INTELLIGENCE" />}</div>
        <div className="metric-value">{value}{suffix}</div>
      </div>
    </div>
  )
}

function App() {
  const [passport, setPassport] = useState(null)
  const [intel, setIntel] = useState(null)
  const [reference, setReference] = useState(null)
  const [evolution, setEvolution] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/passport`).then(r => { if (!r.ok) throw new Error('passport'); return r.json() }),
      fetch(`${API}/api/intelligence`).then(r => { if (!r.ok) throw new Error('intelligence'); return r.json() }),
      fetch(`${API}/api/regulation/reference`).then(r => { if (!r.ok) throw new Error('reference'); return r.json() }),
      fetch(`${API}/api/evolution`).then(r => { if (!r.ok) throw new Error('evolution'); return r.json() }),
    ])
      .then(([p, i, r, e]) => { setPassport(p); setIntel(i); setReference(r); setEvolution(e); setError('') })
      .catch(() => setError('DPPIQ API is not reachable. Make sure the FastAPI backend is running on port 8000.'))
  }, [])

  const currentFramework = intel?.requirements?.filter(r => r.classification === 'EU_FRAMEWORK') || []
  const productSpecific = intel?.requirements?.filter(r => r.classification === 'PRODUCT_SPECIFIC') || []

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="logo">D</span><div><strong>DPPIQ</strong><small>Digital Product Passport Intelligence</small></div></div>
        <div className="status"><span className="pulse" /> Open-source reference implementation</div>
      </header>

      <section className="hero product-hero">
        <div>
          <div className="eyebrow"><Sparkles size={15}/> OPEN DIGITAL PRODUCT PASSPORT</div>
          <h1>{passport?.identity?.name || 'Digital Product Passport'}</h1>
          <p className="product-meta">{passport?.identity?.manufacturer} · {passport?.identity?.model} · {passport?.identity?.product_id}</p>
          <p>One open passport view for product information, with a clearly separated intelligence layer for regulation, evidence, circularity and agent evolution.</p>
        </div>
        <div className="iq-ring"><div><span>{intel?.overall_iq ?? '--'}</span><small>DPP IQ</small><em>DPPIQ</em></div></div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="legal-strip card">
        <div className="legal-main">
          <ShieldCheck size={22} />
          <div>
            <div className="legal-title"><Badge type="EU_FRAMEWORK" /> {reference?.legal_basis || 'Loading legal reference…'}</div>
            <p>DPPIQ is using the official ESPR DPP framework as its regulatory reference. Framework readiness is not a legal compliance opinion.</p>
          </div>
        </div>
        <div className="legal-actions">
          <span>Verified by DPPIQ: {reference?.last_verified_by_dppiq || '—'}</span>
          {reference?.authoritative_source?.url && <a href={reference.authoritative_source.url} target="_blank" rel="noreferrer">EUR-Lex <ExternalLink size={13}/></a>}
          {reference?.commission_reference?.url && <a href={reference.commission_reference.url} target="_blank" rel="noreferrer">EU DPP page <ExternalLink size={13}/></a>}
        </div>
      </section>

      <section className="scope-warning">
        <Info size={18}/>
        <div><strong>Legal applicability for this demo product</strong><br/>{passport?.legal_applicability?.note}</div>
      </section>

      <section className="legend card">
        <div><Badge type="EU_FRAMEWORK" /><span>Enacted horizontal ESPR DPP provisions used as reference.</span></div>
        <div><Badge type="PRODUCT_SPECIFIC" /><span>Content/obligations that depend on an applicable delegated act or other EU legislation.</span></div>
        <div><Badge type="DPPIQ_INTELLIGENCE" /><span>Scores, analytics and recommendations added by DPPIQ — not legal requirements.</span></div>
      </section>

      <section className="metrics">
        <Metric icon={Scale} label="ESPR framework readiness" value={intel?.framework_readiness ?? '--'} suffix="%" />
        <Metric icon={FileCheck2} label="Evidence quality" value={intel?.evidence_quality ?? '--'} suffix="%" intelligence />
        <Metric icon={Recycle} label="Circularity readiness" value={intel?.circularity_readiness ?? '--'} suffix="%" intelligence />
        <Metric icon={BrainCircuit} label="Agent generation" value="G2" intelligence />
      </section>

      <section className="grid-two">
        <article className="card panel">
          <div className="panel-title"><div><Activity size={18}/> Product passport</div><span className="pill green">OPEN DATA DEMO</span></div>
          <h2>{passport?.identity?.name || 'Loading…'}</h2>
          <div className="facts">
            <div><span>Unique product ID</span><strong>{passport?.identity?.product_id ?? '--'}</strong></div>
            <div><span>Data carrier</span><strong>{passport?.dpp?.data_carrier?.type ?? '--'}</strong></div>
            <div><span>Carbon footprint</span><strong>{passport?.environment?.product_carbon_footprint_kg_co2e ?? '--'} kg CO₂e</strong><Badge type="DPPIQ_INTELLIGENCE" /></div>
            <div><span>Recycled content</span><strong>{passport?.circularity?.recycled_content_percent ?? '--'}%</strong><Badge type="DPPIQ_INTELLIGENCE" /></div>
            <div><span>Spare-parts horizon</span><strong>{passport?.repair?.spare_parts_available_years ?? '--'} years</strong><Badge type="DPPIQ_INTELLIGENCE" /></div>
            <div><span>Evidence objects</span><strong>{passport?.evidence?.length ?? '--'}</strong><Badge type="DPPIQ_INTELLIGENCE" /></div>
          </div>
        </article>

        <article className="card panel basis-panel">
          <div className="panel-title"><div><Layers3 size={18}/> Regulatory basis</div><span className="pill green">OFFICIAL SOURCE</span></div>
          <h2>ESPR Digital Product Passport</h2>
          <p className="muted">Regulation (EU) 2024/1781 · Articles 9–11</p>
          <p className="basis-note">{reference?.scope_note}</p>
          <div className="basis-links">
            <span>Registry: <strong>{reference?.registry_reference?.status || '—'}</strong></span>
            <span>Reference status: <strong>{reference?.status || '—'}</strong></span>
          </div>
        </article>
      </section>

      <section className="grid-two">
        <article className="card panel">
          <div className="panel-title"><div><CheckCircle2 size={18}/> Current ESPR framework checks</div><Badge type="EU_FRAMEWORK" /></div>
          <div className="requirements">
            {currentFramework.map(req => (
              <div className="requirement" key={req.requirement_id}>
                <span className={req.status === 'ready' ? 'dot ready' : 'dot gap'} />
                <div><strong>{req.title}</strong><small>Article {req.article} · {req.rationale}</small></div>
                <span className={req.status === 'ready' ? 'state ready-text' : 'state gap-text'}>{req.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card panel">
          <div className="panel-title"><div><Scale size={18}/> Product-specific layer</div><Badge type="PRODUCT_SPECIFIC" /></div>
          <div className="requirements">
            {productSpecific.map(req => (
              <div className="requirement" key={req.requirement_id}>
                <span className="dot pending" />
                <div><strong>{req.title}</strong><small>Article {req.article} · {req.rationale}</small></div>
                <span className="state pending-text">{req.status.replace('_', ' ').toUpperCase()}</span>
              </div>
            ))}
          </div>
          <div className="source-note">DPPIQ deliberately does not label repairability, recycled content, carbon footprint or other product fields as “EU required” unless an applicable product-specific legal instrument establishes that requirement.</div>
        </article>
      </section>

      <section className="card panel evolution">
        <div className="panel-title"><div><BrainCircuit size={18}/> Evolution engine</div><Badge type="DPPIQ_INTELLIGENCE" /></div>
        <div className="evolution-head"><div><h2>{evolution?.candidate || 'Evaluating candidate…'}</h2><p>{evolution?.reason}</p></div><span className={`pill ${evolution?.decision === 'promote' ? 'green' : 'red'}`}>{evolution?.decision?.toUpperCase() || '...'}</span></div>
        <div className="delta-grid">
          <div><span>Mapping accuracy Δ</span><strong>+{((evolution?.delta?.requirement_mapping_accuracy || 0) * 100).toFixed(1)} pts</strong></div>
          <div><span>Evidence precision Δ</span><strong>+{((evolution?.delta?.evidence_precision || 0) * 100).toFixed(1)} pts</strong></div>
          <div><span>False compliance Δ</span><strong>{((evolution?.delta?.false_compliance_rate || 0) * 100).toFixed(1)} pts</strong></div>
        </div>
        <div className="evolution-rule">Self-improvement is benchmark-gated. DPPIQ may improve its interpretation workflow, but it cannot rewrite the authoritative legal source or silently turn its own interpretations into law.</div>
      </section>

      <footer>DPPIQ · Open-source Digital Product Passport Intelligence · Regulatory information is traceable to official sources; DPPIQ analytics are explicitly separated.</footer>
    </main>
  )
}

export default App
