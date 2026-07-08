import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Plus, Trash2, Server } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import { ENV_LABELS, ENV_ORDER } from '../lib/workflow'
import type { Env } from '../lib/types'
import { ErrorBox, Spinner } from '../components/ui'

interface DraftSystem { sid: string; environment: Env }
interface DraftGroup { name: string; systems: DraftSystem[] }

const emptyGroup = (): DraftGroup => ({ name: '', systems: [{ sid: '', environment: 'DEV' }] })

export default function Onboarding() {
  const { session, profile, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [groups, setGroups] = useState<DraftGroup[]>([emptyGroup()])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) { navigate('/login', { replace: true }); return }
    if (profile && (profile.role !== 'admin' || profile.onboarded)) navigate('/', { replace: true })
  }, [session, profile, loading, navigate])

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name)
  }, [profile])

  if (loading || !profile) return <div className="h-full flex items-center justify-center"><Spinner /></div>

  function setGroup(i: number, patch: Partial<DraftGroup>) {
    setGroups((gs) => gs.map((g, ix) => (ix === i ? { ...g, ...patch } : g)))
  }
  function setSystem(gi: number, si: number, patch: Partial<DraftSystem>) {
    setGroups((gs) => gs.map((g, ix) => ix === gi
      ? { ...g, systems: g.systems.map((s, sx) => (sx === si ? { ...s, ...patch } : s)) }
      : g))
  }

  async function finish() {
    setError('')
    const clean = groups
      .map((g) => ({ name: g.name.trim(), systems: g.systems.filter((s) => s.sid.trim()) }))
      .filter((g) => g.name && g.systems.length)
    if (!fullName.trim()) { setError('Escribe tu nombre completo.'); setStep(1); return }
    if (!clean.length) { setError('Registra al menos un grupo de sistemas con un SID.'); return }
    setBusy(true)
    try {
      const uid = session!.user.id
      for (const g of clean) {
        const { data: grp, error: gErr } = await supabase
          .from('system_groups').insert({ admin_id: uid, name: g.name }).select().single()
        if (gErr) throw gErr
        const { error: sErr } = await supabase.from('systems').insert(
          g.systems.map((s) => ({ group_id: grp.id, sid: s.sid.trim().toUpperCase(), environment: s.environment })),
        )
        if (sErr) throw sErr
      }
      const { error: pErr } = await supabase.from('profiles')
        .update({ full_name: fullName.trim(), position: position.trim() || null, onboarded: true })
        .eq('id', uid)
      if (pErr) throw pErr
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-[760px]">
        <div className="flex items-center gap-3 mb-6 select-none">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(145deg,#2f7bff,#153e8f)' }}>
            <ShieldCheck size={24} color="#fff" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold m-0">Bienvenido al Control Center</h1>
            <p className="text-xs text-[var(--muted)] m-0">
              Antes de comenzar, registra tus datos y los grupos de sistemas a tu cargo.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-5">
          {[1, 2].map((n) => (
            <div key={n} className="flex-1 h-1.5 rounded-full"
              style={{ background: step >= n ? 'var(--blue)' : '#132648' }} />
          ))}
        </div>

        {step === 1 && (
          <div className="panel p-6 flex flex-col gap-4">
            <h2 className="m-0 text-[15px] font-bold">1 · Tus datos</h2>
            <div>
              <label className="lbl">Nombre completo *</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Juan Pérez García" autoFocus />
            </div>
            <div>
              <label className="lbl">Puesto (opcional)</label>
              <input className="input" value={position} onChange={(e) => setPosition(e.target.value)}
                placeholder="Ej. SAP BASIS Administrator" />
            </div>
            {error && <ErrorBox msg={error} />}
            <div className="flex justify-end">
              <button className="btn btn-primary" onClick={() => {
                if (!fullName.trim()) { setError('Escribe tu nombre completo.'); return }
                setError(''); setStep(2)
              }}>Continuar →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="panel p-5">
              <h2 className="m-0 text-[15px] font-bold mb-1">2 · Grupos de sistemas a tu cargo</h2>
              <p className="text-xs text-[var(--muted)] m-0">
                Ejemplo: grupo <b>S4-HANA</b> con ambientes S4D (Desarrollo), S4Q (Calidad), S4R (Pre Producción),
                S4Y (Sandbox) y S4P (Producción). El landscape es libre: registra solo los ambientes que existan.
              </p>
            </div>

            {groups.map((g, gi) => (
              <div key={gi} className="panel p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Server size={16} className="text-[var(--blue)]" />
                  <input className="input flex-1" placeholder="Nombre del grupo (Ej. S4-HANA, CPROC, GRC…)"
                    value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} />
                  {groups.length > 1 && (
                    <button className="btn btn-danger px-3" title="Eliminar grupo"
                      onClick={() => setGroups((gs) => gs.filter((_, ix) => ix !== gi))}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {g.systems.map((s, si) => (
                    <div key={si} className="flex gap-2 items-center">
                      <input className="input w-[160px] uppercase" placeholder="SID (Ej. S4D)"
                        value={s.sid} onChange={(e) => setSystem(gi, si, { sid: e.target.value })} />
                      <select className="input flex-1" value={s.environment}
                        onChange={(e) => setSystem(gi, si, { environment: e.target.value as Env })}>
                        {ENV_ORDER.map((env) => (
                          <option key={env} value={env}>{ENV_LABELS[env]} ({env})</option>
                        ))}
                      </select>
                      {g.systems.length > 1 && (
                        <button className="text-[var(--muted)] hover:text-[#fca5a5] cursor-pointer p-1.5"
                          onClick={() => setGroup(gi, { systems: g.systems.filter((_, sx) => sx !== si) })}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-ghost self-start mt-1"
                    onClick={() => setGroup(gi, { systems: [...g.systems, { sid: '', environment: 'DEV' }] })}>
                    <Plus size={14} /> Agregar ambiente
                  </button>
                </div>
              </div>
            ))}

            <button className="btn btn-ghost self-start" onClick={() => setGroups((gs) => [...gs, emptyGroup()])}>
              <Plus size={14} /> Agregar otro grupo de sistemas
            </button>

            {error && <ErrorBox msg={error} />}

            <div className="flex justify-between">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Regresar</button>
              <button className="btn btn-primary" onClick={finish} disabled={busy}>
                {busy ? 'Guardando…' : 'Finalizar y entrar al sistema'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
