import { useEffect, useState } from 'react'
import { Activity, BrainCircuit, CheckCircle2, FileCheck2, Recycle, Scale, ShieldAlert, Sparkles } from 'lucide-react'

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

function App() {
  const [passport, setPassport] = useState(null)
  const [intel, setIntel] = useState(null)
  const [change, setChange] = useState(null)
  const [evolution, setEvolution] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/passport`).then(r => { if (!r.ok) throw new Error('passport'); return r.json() }),
      fetch(`${API}/api/intelligence`).then(r => { if (!r.ok) throw new Error('intelligence'); return r.json() }),
      fetch(`${API}/api/regulation/change`).then(r => { if (!r.ok) throw new Error('regulation'); return r.json() }),
      fetch(`${API}/api/evolution`).then(r => { if (!r.ok) throw new Error('evolution'); return r.json() }),
    ])
      .then(([p, i, c, e]) => {
        setPassport(p)
        setIntel(i)
        setChange(c)
        setEvolution(e)
        setError('')
      })
      .catch(() => setError('DPPIQ API is not reachable. Make sure the FastAPI backend is running on port 8000.'))
  }, [])

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="logo">D</span><div><strong>DPPIQ</strong><small>Digital Product Passport Intelligence</small></div></div>
        <div className="status"><span className="pulse" /> Open intelligence · prototype</div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><Sparkles size={15}/> SELF-EVOLVING DPP INTELLIGENCE</div>
          <h1>A passport that evolves<br/>with regulation.</h1>
          <p>DPPIQ continuously connects product evidence, regulatory change and measurable agent improvement — transparently and without proprietary enterprise systems.</p>
        </div>
        <div className="iq-ring">
          <div><span>{intel?.overall_iq ?? '--'}</span><small>DPP IQ</small></div>
        </div>
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
          <div className="panel-title"><div><Activity size={18}/> Product passport</div><span className="pill green">IN USE</span></div>
          <h2>{passport?.identity?.name || 'Loading…'}</h2>
          <p className="muted">{passport?.identity?.product_id} · {passport?.identity?.model}</p>
          <div className="facts">
            <div><span>Carbon footprint</span><strong>{passport?.environment?.product_carbon_footprint_kg_co2e ?? '--'} kg CO₂e</strong></div>
            <div><span>Recycled content</span><strong>{passport?.circularity?.recycled_content_percent ?? '--'}%</strong></div>
            <div><span>Spare parts</span><strong>{passport?.repair?.spare_parts_available_years ?? '--'} years</strong></div>
            <div><span>Evidence objects</span><strong>{passport?.evidence?.length ?? '--'}</strong></div>
          </div>
        </article>

        <article className="card panel regulatory">
          <div className="panel-title"><div><ShieldAlert size={18}/> Regulatory radar</div><span className="pill amber">CHANGE</span></div>
          <h2>{change?.summary || 'Comparing versions…'}</h2>
          <p className="muted">{change?.from_version} → {change?.to_version}</p>
          <div className="change-list">
            {change?.added?.map(item => <div key={item.id}><span className="plus">+</span><span>{item.title}</span></div>)}
          </div>
          <div className="source-note">Illustrative regulation dataset — not legal advice. DPPIQ keeps authoritative sources separate from machine interpretation.</div>
        </article>
      </section>

      <section className="grid-two">
        <article className="card panel">
          <div className="panel-title"><div><CheckCircle2 size={18}/> Requirement assessment</div><span className="pill">{intel?.requirements?.length || 0} checks</span></div>
          <div className="requirements">
            {intel?.requirements?.map(req => (
              <div className="requirement" key={req.requirement_id}>
                <span className={req.status === 'ready' ? 'dot ready' : 'dot gap'} />
                <div><strong>{req.title}</strong><small>{req.rationale}</small></div>
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
          <div className="evolution-rule">A candidate is promoted only when benchmark guardrails improve. Model opinion alone is never sufficient.</div>
        </article>
      </section>

      <footer>DPPIQ · Open-source Digital Product Passport Intelligence</footer>
    </main>
  )
}

export default App
