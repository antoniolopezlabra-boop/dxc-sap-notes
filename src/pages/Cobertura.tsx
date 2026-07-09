import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers, Search, AlertTriangle, CheckCircle2, Target, ServerCrash, Factory, ListChecks,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { NoteTrack, TrackStep, SystemRow, SystemGroup, Profile, Env, Priority } from '../lib/types'
import { ENV_LABELS, ENV_ORDER, IMPL_STEP_BY_ENV, PRODUCTIVE_ENVS } from '../lib/workflow'
import { Panel, StatCard, Spinner, Empty, ErrorBox, PriorityChip, ProgressBar } from '../components/ui'
import { EnvCoverageBars } from '../components/charts'

type CovStatus = 'done' | 'pending' | 'no_aplica'

interface SysCov {
  sid: string
  env: Env
  groupId: string
  groupName: string
  adminId: string
  status: CovStatus
}

interface NoteCov {
  note: string
  priority: Priority
  systems: SysCov[]
}

const PRIO_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 }

export default function Cobertura() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isStaff = profile?.role === 'superuser' || profile?.role === 'supervisor'

  const [tracks, setTracks] = useState<NoteTrack[]>([])
  const [steps, setSteps] = useState<TrackStep[]>([])
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [groups, setGroups] = useState<SystemGroup[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // filtros
  const [envSel, setEnvSel] = useState<Set<Env>>(new Set(ENV_ORDER))
  const [prio, setPrio] = useState('')
  const [q, setQ] = useState('')
  const [onlyPending, setOnlyPending] = useState(true)

  useEffect(() => {
    if (!isStaff) { setLoading(false); return }
    let alive = true
    async function load() {
      const [t, s, sys, g, p] = await Promise.all([
        supabase.from('note_tracks').select('id, admin_id, group_id, note_number, priority, status'),
        supabase.from('track_steps').select('track_id, step_key, status'),
        supabase.from('systems').select('*'),
        supabase.from('system_groups').select('id, name, admin_id'),
        supabase.from('profiles').select('id, full_name, email'),
      ])
      if (!alive) return
      if (t.error) setError(t.error.message)
      setTracks((t.data as NoteTrack[]) ?? [])
      setSteps((s.data as TrackStep[]) ?? [])
      setSystems((sys.data as SystemRow[]) ?? [])
      setGroups((g.data as SystemGroup[]) ?? [])
      setProfiles((p.data as Profile[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [isStaff])

  // ── construir cobertura nota × sistema ──
  const notes: NoteCov[] = useMemo(() => {
    const stepsByTrack = new Map<string, { step_key: string; status: string }[]>()
    for (const s of steps) {
      const arr = stepsByTrack.get(s.track_id) ?? []
      arr.push({ step_key: s.step_key, status: s.status })
      stepsByTrack.set(s.track_id, arr)
    }
    const sysByGroup = new Map<string, SystemRow[]>()
    for (const sy of systems) {
      const arr = sysByGroup.get(sy.group_id) ?? []
      arr.push(sy)
      sysByGroup.set(sy.group_id, arr)
    }
    const groupName = new Map(groups.map((g) => [g.id, g.name]))

    const byNote = new Map<string, NoteTrack[]>()
    for (const t of tracks) {
      const arr = byNote.get(t.note_number) ?? []
      arr.push(t)
      byNote.set(t.note_number, arr)
    }

    const out: NoteCov[] = []
    for (const [note, ts] of byNote) {
      const sysList: SysCov[] = []
      let priority: Priority = 'P3'
      for (const t of ts) {
        if (PRIO_RANK[t.priority] < PRIO_RANK[priority]) priority = t.priority
        const gsys = sysByGroup.get(t.group_id) ?? []
        const tsteps = stepsByTrack.get(t.id) ?? []
        for (const sy of gsys) {
          const implKey = IMPL_STEP_BY_ENV[sy.environment]
          const st = tsteps.find((x) => x.step_key === implKey)
          const status: CovStatus = t.status === 'no_aplica'
            ? 'no_aplica'
            : st?.status === 'completado' ? 'done' : 'pending'
          sysList.push({
            sid: sy.sid, env: sy.environment, groupId: t.group_id,
            groupName: groupName.get(t.group_id) ?? '—', adminId: t.admin_id, status,
          })
        }
      }
      out.push({ note, priority, systems: sysList })
    }
    return out
  }, [tracks, steps, systems, groups])

  // ── aplicar filtros ──
  const filtered = useMemo(() => {
    return notes
      .filter((n) => !prio || n.priority === prio)
      .filter((n) => !q || n.note.toLowerCase().includes(q.toLowerCase().trim()))
      .map((n) => {
        const inScope = n.systems.filter((s) => envSel.has(s.env))
        const pending = inScope.filter((s) => s.status === 'pending')
        const done = inScope.filter((s) => s.status === 'done')
        const na = inScope.filter((s) => s.status === 'no_aplica')
        const total = pending.length + done.length
        return { ...n, inScope, pending, done, na, pct: total ? Math.round((done.length / total) * 100) : 100 }
      })
      .filter((n) => (onlyPending ? n.pending.length > 0 : n.inScope.length > 0))
      .sort((a, b) => b.pending.length - a.pending.length || PRIO_RANK[a.priority] - PRIO_RANK[b.priority])
  }, [notes, envSel, prio, q, onlyPending])

  const stats = useMemo(() => {
    let pending = 0, done = 0
    const all = notes.map((n) => {
      const inScope = n.systems.filter((s) => envSel.has(s.env))
      const p = inScope.filter((s) => s.status === 'pending').length
      const d = inScope.filter((s) => s.status === 'done').length
      pending += p; done += d
      return { note: n.note, p }
    })
    const notesWithPending = all.filter((n) => n.p > 0).length
    const total = pending + done
    return {
      pending, done, notesWithPending,
      pct: total ? Math.round((done / total) * 100) : 100,
      totalNotes: notes.length,
    }
  }, [notes, envSel])

  const envChart = useMemo(() => {
    return ENV_ORDER.filter((e) => envSel.has(e)).map((env) => {
      let done = 0, pending = 0
      for (const n of notes) {
        for (const s of n.systems) {
          if (s.env !== env) continue
          if (s.status === 'done') done++
          else if (s.status === 'pending') pending++
        }
      }
      return { env, Implementados: done, Pendientes: pending }
    })
  }, [notes, envSel])

  const adminName = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p?.full_name?.split(' ').slice(0, 2).join(' ') ?? p?.email ?? '—'
  }

  function toggleEnv(env: Env) {
    setEnvSel((s) => {
      const n = new Set(s)
      if (n.has(env)) n.delete(env); else n.add(env)
      if (n.size === 0) return new Set(ENV_ORDER) // nunca vacío
      return n
    })
  }

  if (!isStaff) {
    return <div className="max-w-[560px] mx-auto mt-10"><ErrorBox msg="Esta sección es para súper usuario y supervisores." /></div>
  }
  if (loading) return <Spinner label="Calculando cobertura…" />

  const allEnvsOn = ENV_ORDER.every((e) => envSel.has(e))
  const onlyProd = envSel.size === PRODUCTIVE_ENVS.length && PRODUCTIVE_ENVS.every((e) => envSel.has(e))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[19px] font-extrabold">Cobertura de remediación</h1>
        <p className="m-0 text-xs text-[var(--muted)]">
          Por nota, en qué sistemas ya se implementó y en cuáles falta. Filtra por ambiente para enfocarte
          (p. ej. solo productivos).
        </p>
      </div>

      {error && <ErrorBox msg={error} />}

      {/* KPIs */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatCard label="Sistemas pendientes" value={stats.pending}
          sub={<>en {stats.notesWithPending} nota{stats.notesWithPending === 1 ? '' : 's'} · ámbito filtrado</>}
          icon={<ServerCrash size={19} />} color={stats.pending ? '#fca5a5' : '#34d399'} />
        <StatCard label="Sistemas implementados" value={stats.done} sub="en los ambientes seleccionados"
          icon={<CheckCircle2 size={19} />} color="#34d399" />
        <StatCard label="Cobertura" value={`${stats.pct}%`} sub={`${100 - stats.pct}% restante`}
          icon={<Target size={19} />} color={stats.pct >= 100 ? '#34d399' : '#93c5fd'} />
        <StatCard label="Notas con pendientes" value={stats.notesWithPending} sub={`${stats.totalNotes} notas registradas`}
          icon={<ListChecks size={19} />} color="#93c5fd" />
      </div>

      {/* Filtros */}
      <Panel bodyClass="p-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mr-1">Ambiente:</span>
            {ENV_ORDER.map((env) => {
              const on = envSel.has(env)
              return (
                <button key={env} onClick={() => toggleEnv(env)} title={ENV_LABELS[env]}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                  style={{
                    background: on ? 'rgba(77,141,255,.16)' : '#0a142b',
                    border: `1px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                    color: on ? '#bcd6ff' : 'var(--muted)',
                  }}>
                  {env}
                </button>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            <button className="btn btn-ghost py-1.5 px-3 text-[12px]" onClick={() => setEnvSel(new Set(ENV_ORDER))}
              style={allEnvsOn ? { borderColor: 'var(--blue)', color: '#bcd6ff' } : undefined}>
              Todos
            </button>
            <button className="btn btn-ghost py-1.5 px-3 text-[12px]" onClick={() => setEnvSel(new Set(PRODUCTIVE_ENVS))}
              style={onlyProd ? { borderColor: 'var(--blue)', color: '#bcd6ff' } : undefined}>
              <Factory size={12} /> Solo productivo
            </button>
          </div>
          <div className="w-px h-6 bg-[var(--border)]" />
          <select className="input w-auto" value={prio} onChange={(e) => setPrio(e.target.value)}>
            <option value="">Prioridad: todas</option>
            <option>P1</option><option>P2</option><option>P3</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input className="input pl-9" placeholder="Buscar nota…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--muted)] cursor-pointer select-none">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Solo con pendientes
          </label>
        </div>
      </Panel>

      {/* Chart + tabla */}
      <div className="grid-split-23">
        <Panel title="Faltantes por nota" icon={<AlertTriangle size={15} />} bodyClass="p-0">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nota</th><th>Prioridad</th><th>Faltan implementar en</th><th>Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((n) => (
                    <tr key={n.note}>
                      <td className="font-bold align-top">{n.note}</td>
                      <td className="align-top"><PriorityChip p={n.priority} /></td>
                      <td>
                        {n.pending.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {n.pending.map((s, i) => (
                              <span key={i} className="chip cursor-pointer"
                                title={`${ENV_LABELS[s.env]} · Grupo ${s.groupName} · ${adminName(s.adminId)}`}
                                onClick={() => navigate(`/notas?q=${n.note}`)}
                                style={{ color: '#fca5a5', background: 'rgba(239,68,68,.12)', borderColor: 'rgba(239,68,68,.45)' }}>
                                {s.sid}<span className="opacity-70 font-normal ml-0.5">· {s.env}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="chip" style={{ color: '#6ee7b7', background: 'rgba(5,150,105,.12)', borderColor: 'rgba(16,185,129,.4)' }}>
                            <CheckCircle2 size={12} /> Completo en ámbito
                          </span>
                        )}
                        <div className="text-[11px] text-[var(--muted)] mt-1.5">
                          {n.done.length} implementado{n.done.length === 1 ? '' : 's'}
                          {n.na.length > 0 && <> · {n.na.length} no aplica</>}
                        </div>
                      </td>
                      <td className="align-top" style={{ minWidth: 140 }}><ProgressBar pct={n.pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<CheckCircle2 size={32} />}
              title={notes.length ? 'Sin pendientes en el ámbito seleccionado' : 'Aún no hay notas registradas'}
              sub={notes.length ? 'Ninguna nota tiene sistemas pendientes con los filtros actuales. Quita "Solo con pendientes" para ver todas.' : 'Cuando los administradores registren notas, aquí verás la cobertura.'} />
          )}
        </Panel>

        <Panel title="Sistemas por ambiente" icon={<Layers size={15} />} bodyClass="p-3 pt-4">
          {envChart.some((e) => e.Implementados + e.Pendientes > 0) ? (
            <>
              <EnvCoverageBars data={envChart} />
              <div className="text-[11px] text-[var(--muted)] mt-2 text-center">
                Implementados vs pendientes en cada ambiente seleccionado
              </div>
            </>
          ) : <Empty title="Sin datos" sub="No hay sistemas en los ambientes seleccionados." />}
        </Panel>
      </div>
    </div>
  )
}
