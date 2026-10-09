import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, CheckCircle2, AlertTriangle, Factory, Users, ArrowRight, AlarmClock,
  Layers, Route, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import { supabase, selectAll } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { NoteTrack, TrackStep, Profile, SystemRow, Priority } from '../lib/types'
import {
  daysStuck, delayLevel, trackProgress, DELAY_META, fmtDate, DELAY_REASONS,
  PIPELINE_STAGES, stageIndex, delayReasonLabel, IMPL_STEP_BY_ENV,
} from '../lib/workflow'
import {
  Panel, StatCard, Spinner, Empty, PriorityChip, StatusChip, DelayChip, ProgressBar, Reading,
} from '../components/ui'
import { ProgressGauge, CategoryBars, StageBars } from '../components/charts'

interface TrackVM extends NoteTrack {
  steps: TrackStep[]
  days: number
  level: ReturnType<typeof delayLevel>
  progress: { done: number; total: number; pct: number }
  currentTitle: string
}

interface PrdPending { sid: string; group: string; trackId: string; stage: number; days: number; adminId: string; reason: string | null }
interface NotePrd {
  note: string
  priority: Priority
  applies: boolean
  active: boolean
  done: string[]
  pend: PrdPending[]
}

const PRIO_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 }

const RED = '#fca5a5', GREEN = '#34d399', BLUE = '#93c5fd'
function Hl({ c = '#e9f0ff', children }: { c?: string; children: React.ReactNode }) {
  return <b style={{ color: c }}>{children}</b>
}
const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p)

function useDashboardData() {
  const { profile } = useAuth()
  const [tracks, setTracks] = useState<NoteTrack[]>([])
  const [steps, setSteps] = useState<TrackStep[]>([])
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const isStaff = profile?.role === 'superuser' || profile?.role === 'supervisor'

  useEffect(() => {
    if (!profile) return
    let alive = true
    async function load() {
      const [t, s, sy, p] = await Promise.all([
        selectAll<NoteTrack>(() => supabase.from('note_tracks').select('*, system_groups(name)').order('created_at', { ascending: false }).order('id')),
        selectAll<TrackStep>(() => supabase.from('track_steps').select('id, track_id, admin_id, step_key, step_order, title, status, started_at, completed_at, delay_reason, delay_logged_at').order('id')),
        selectAll<SystemRow>(() => supabase.from('systems').select('id, group_id, sid, environment').order('id')),
        isStaff ? supabase.from('profiles').select('*') : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      setTracks((t.data as NoteTrack[]) ?? [])
      setSteps((s.data as TrackStep[]) ?? [])
      setSystems((sy.data as SystemRow[]) ?? [])
      setProfiles((p.data as Profile[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [profile, isStaff])

  const vms: TrackVM[] = useMemo(() => {
    const byTrack = new Map<string, TrackStep[]>()
    for (const s of steps) {
      const arr = byTrack.get(s.track_id) ?? []
      arr.push(s)
      byTrack.set(s.track_id, arr)
    }
    return tracks.map((t) => {
      const ts = (byTrack.get(t.id) ?? []).sort((a, b) => a.step_order - b.step_order)
      const days = daysStuck(t)
      const current = ts.find((s) => s.status === 'en_curso')
      return {
        ...t,
        steps: ts,
        days,
        level: delayLevel(days),
        progress: trackProgress(ts, t.status),
        currentTitle: t.status === 'completada' ? 'Concluido'
          : t.status === 'no_aplica' ? 'No aplicó'
          : current?.title ?? '—',
      }
    })
  }, [tracks, steps])

  return { vms, steps, systems, profiles, loading, isStaff, profile }
}

// Análisis por nota del alcance productivo: una nota está "en Producción" cuando
// todos sus sistemas PRD aplicables ya tienen el paso impl_prd concluido.
function analyzeProduction(vms: TrackVM[], systems: SystemRow[]) {
  const prdByGroup = new Map<string, SystemRow[]>()
  for (const sy of systems) {
    if (sy.environment !== 'PRD') continue
    const arr = prdByGroup.get(sy.group_id) ?? []
    arr.push(sy)
    prdByGroup.set(sy.group_id, arr)
  }
  const allByGroup = new Map<string, SystemRow[]>()
  for (const sy of systems) {
    const arr = allByGroup.get(sy.group_id) ?? []
    arr.push(sy)
    allByGroup.set(sy.group_id, arr)
  }
  // Implementación general: cada nota en cada sistema aplicable (todos los ambientes).
  let allDone = 0, allTot = 0
  const notes = new Map<string, NotePrd>()
  const byAdmin = new Map<string, { done: number; pend: number }>()
  for (const v of vms) {
    let n = notes.get(v.note_number)
    if (!n) {
      n = { note: v.note_number, priority: v.priority, applies: false, active: false, done: [], pend: [] }
      notes.set(v.note_number, n)
    }
    if (PRIO_RANK[v.priority] < PRIO_RANK[n.priority]) n.priority = v.priority
    if (v.status === 'no_aplica') continue
    n.applies = true
    if (v.status === 'en_progreso') n.active = true
    for (const sy of allByGroup.get(v.group_id) ?? []) {
      const key = IMPL_STEP_BY_ENV[sy.environment]
      allTot++
      if (v.status === 'completada' || v.steps.some((s) => s.step_key === key && s.status === 'completado')) allDone++
    }
    const prd = prdByGroup.get(v.group_id) ?? []
    if (!prd.length) continue
    const implPrd = v.steps.find((s) => s.step_key === 'impl_prd')
    const isDone = v.status === 'completada' || implPrd?.status === 'completado'
    const cur = v.steps.find((s) => s.status === 'en_curso')
    const stage = stageIndex(cur?.step_key)
    for (const sy of prd) {
      const a = byAdmin.get(v.admin_id) ?? { done: 0, pend: 0 }
      if (isDone) a.done++; else a.pend++
      byAdmin.set(v.admin_id, a)
      if (isDone) n.done.push(sy.sid)
      else n.pend.push({
        sid: sy.sid, group: v.system_groups?.name ?? '—', trackId: v.id,
        stage, days: v.days, adminId: v.admin_id, reason: cur?.delay_reason ?? null,
      })
    }
  }
  const all = [...notes.values()]
  const inImpl = all.filter((n) => n.applies)
  const withPrd = inImpl.filter((n) => n.done.length + n.pend.length > 0)
  const closed = withPrd.filter((n) => n.pend.length === 0)
    .sort((a, b) => a.note.localeCompare(b.note))
  const worst = (n: NotePrd) => n.pend.reduce((m, p) => Math.max(m, p.days), 0)
  const pending = withPrd.filter((n) => n.pend.length > 0)
    .sort((a, b) => worst(b) - worst(a) || b.pend.length - a.pend.length)
  const sysDone = withPrd.reduce((a, n) => a + n.done.length, 0)
  const sysPend = withPrd.reduce((a, n) => a + n.pend.length, 0)
  // Cada nota se cuenta UNA vez, en la etapa de su sistema PRD más atrasado.
  const stageOf = (n: NotePrd) => n.pend.reduce((m, p) => Math.min(m, p.stage), PIPELINE_STAGES.length - 1)
  const isLate = (n: NotePrd) => delayLevel(worst(n)) !== 'ok'
  const funnel = PIPELINE_STAGES.map((s, i) => {
    const ns = pending.filter((n) => stageOf(n) === i)
    return { label: s.label, ok: ns.filter((n) => !isLate(n)).length, late: ns.filter(isLate).length }
  })
  const lateNotes = pending.filter(isLate)
  const reasonCount = new Map<string, number>()
  for (const n of lateNotes) {
    for (const r of new Set(n.pend.map((p) => p.reason).filter((x): x is string => !!x))) {
      reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1)
    }
  }
  const topEntry = [...reasonCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const topLateReason = topEntry ? { key: topEntry[0], n: topEntry[1] } : null
  const stageSummary = {
    evalOk: pending.filter((n) => stageOf(n) === 0 && !isLate(n)).length,
    advOk: pending.filter((n) => stageOf(n) > 0 && !isLate(n)).length,
    late: lateNotes.length,
    topLateReason,
  }
  return {
    total: all.length,
    inImpl: inImpl.length,
    enCurso: inImpl.filter((n) => n.active).length,
    concluidas: inImpl.filter((n) => !n.active).length,
    noAplicaron: all.length - inImpl.length,
    sinPrd: inImpl.length - withPrd.length,
    withPrd: withPrd.length,
    closed, pending, worst, stageOf, stageSummary, byAdmin,
    allDone, allTot, allPct: allTot ? Math.round((allDone / allTot) * 100) : 0,
    sysDone, sysPend,
    pct: sysDone + sysPend ? Math.round((sysDone / (sysDone + sysPend)) * 100) : 100,
    funnel,
  }
}

function DelayedList({ vms, showAdmin, profiles }: { vms: TrackVM[]; showAdmin?: boolean; profiles?: Profile[] }) {
  const navigate = useNavigate()
  const delayed = vms
    .filter((v) => v.status === 'en_progreso' && v.level !== 'ok')
    .sort((a, b) => b.days - a.days)
    .slice(0, 8)
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name?.split(' ')[0] ?? '—'
  if (!delayed.length) {
    return <Empty icon={<CheckCircle2 size={30} />} title="Sin demoras" sub="Todos los tracks activos están dentro del tiempo esperado (menos de 5 días hábiles sin avance)." />
  }
  return (
    <div className="flex flex-col">
      {delayed.map((v) => {
        const m = DELAY_META[v.level]
        return (
          <button key={v.id} onClick={() => navigate(`/tracks/${v.id}`)}
            className="flex items-center gap-3 px-4 py-2.5 border-b border-[#16274a] last:border-0 hover:bg-[rgba(77,141,255,.06)] cursor-pointer text-left w-full">
            <span className="w-2 h-2 rounded-full shrink-0 pulse-dot" style={{ background: m.fg }} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold truncate">
                Nota {v.note_number} <span className="text-[var(--muted)] font-medium">· {v.system_groups?.name}</span>
                {showAdmin && <span className="text-[var(--muted)] font-medium"> · {nameOf(v.admin_id)}</span>}
              </div>
              <div className="text-[11.5px] text-[var(--muted)] truncate">{v.currentTitle}</div>
            </div>
            <DelayChip days={v.days} />
          </button>
        )
      })}
    </div>
  )
}

function TracksTable({ vms, limit = 8 }: { vms: TrackVM[]; limit?: number }) {
  const navigate = useNavigate()
  const rows = vms.slice(0, limit)
  if (!rows.length) return <Empty icon={<FileText size={30} />} title="Aún no hay notas registradas" sub="Registra tu primera nota desde la pestaña Notas." />
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr><th>Nota</th><th>Grupo</th><th>Paso actual</th><th>Avance</th><th>Estado</th><th>Días</th></tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="rowlink" onClick={() => navigate(`/tracks/${v.id}`)}>
              <td className="font-bold">{v.note_number}</td>
              <td>{v.system_groups?.name}</td>
              <td className="max-w-[220px] truncate text-[var(--muted)]">{v.currentTitle}</td>
              <td><ProgressBar pct={v.progress.pct} /></td>
              <td><StatusChip s={v.status} /></td>
              <td>{v.status === 'en_progreso' ? <DelayChip days={v.days} /> : <span className="text-[var(--muted)] text-xs">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { vms, steps, systems, profiles, loading, isStaff, profile } = useDashboardData()

  const stats = useMemo(() => {
    const active = vms.filter((v) => v.status === 'en_progreso')
    const delayed = active.filter((v) => v.level !== 'ok')
    const byLevel = { yellow: 0, orange: 0, red: 0 }
    for (const v of delayed) byLevel[v.level as 'yellow' | 'orange' | 'red']++
    return { active, delayed, byLevel }
  }, [vms])

  const prd = useMemo(() => analyzeProduction(vms, systems), [vms, systems])

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name?.split(' ')[0] ?? '—'

  const adminRows = useMemo(() => {
    if (!isStaff) return []
    const prdPendBy = new Map<string, number>()
    for (const n of prd.pending) for (const p of n.pend) prdPendBy.set(p.adminId, (prdPendBy.get(p.adminId) ?? 0) + 1)
    return profiles
      .filter((p) => p.role === 'admin')
      .map((p) => {
        const mine = vms.filter((v) => v.admin_id === p.id)
        const act = mine.filter((v) => v.status === 'en_progreso')
        const del = act.filter((v) => v.level !== 'ok')
        const crit = act.filter((v) => v.level === 'red').length
        const worst = del.reduce((m, v) => Math.max(m, v.days), 0)
        const cov = prd.byAdmin.get(p.id)
        const covTot = cov ? cov.done + cov.pend : 0
        return {
          p, total: mine.length, act: act.length,
          done: mine.filter((v) => v.status === 'completada').length,
          prdPend: prdPendBy.get(p.id) ?? 0, crit, worst,
          prdPct: covTot ? Math.round((cov!.done / covTot) * 100) : null,
          prdLabel: covTot ? `${cov!.done} de ${covTot} sistemas` : '',
        }
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.crit - a.crit || b.prdPend - a.prdPend)
  }, [isStaff, profiles, vms, prd])

  // Motivos de atraso: pasos activos (no completados) con un motivo de demora documentado.
  const delayStats = useMemo(() => {
    const counts = new Map<string, number>()
    let total = 0
    for (const s of steps) {
      if (s.status !== 'completado' && s.delay_reason) {
        counts.set(s.delay_reason, (counts.get(s.delay_reason) ?? 0) + 1)
        total++
      }
    }
    const rows = DELAY_REASONS
      .map((r) => ({ label: r.label, value: counts.get(r.key) ?? 0, color: r.chart }))
      .sort((a, b) => b.value - a.value)
    const top = rows.find((r) => r.value > 0)
    return { rows, total, top }
  }, [steps])

  if (loading) return <Spinner label="Cargando dashboard…" />

  const title = isStaff ? 'Avance general de vulnerabilidades en Focus Run' : 'Mi panel de seguimiento'
  const sub = isStaff
    ? 'Estado de la remediación con foco en los ambientes productivos'
    : 'Seguimiento de tus notas y sistemas asignados'
  const tus = isStaff ? '' : 'tus '
  const critNotes = prd.pending.filter((n) => prd.worst(n) >= 15).length
  const topPending = prd.pending[0]
  const ss = prd.stageSummary
  const stageParts: React.ReactNode[] = []
  if (ss.evalOk) stageParts.push(<><Hl c={BLUE}>{ss.evalOk}</Hl> {plural(ss.evalOk, 'recién iniciada, en evaluación', 'recién iniciadas, en evaluación')} dentro del tiempo esperado</>)
  if (ss.advOk) stageParts.push(<><Hl c={BLUE}>{ss.advOk}</Hl> {plural(ss.advOk, 'avanza', 'avanzan')} en tiempo hacia Producción</>)
  if (ss.late) stageParts.push(<><Hl c={RED}>{ss.late}</Hl> {plural(ss.late, 'presenta', 'presentan')} demora{ss.topLateReason && <> ({ss.topLateReason.n === ss.late ? (ss.late === 1 ? 'su motivo' : 'en todas el motivo') : <>{ss.topLateReason.n} de ellas con motivo</>}{' '}<Hl c={RED}>«{delayReasonLabel(ss.topLateReason.key)}»</Hl>)</>}</>)
  const sinMotivo = Math.max(0, stats.active.length - delayStats.total)
  const topAdmin = adminRows.find((r) => r.crit > 0)
  const idleAdmins = adminRows.filter((r) => r.act === 0).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="m-0 text-[19px] font-extrabold">{title}</h1>
          <p className="m-0 text-xs text-[var(--muted)]">{sub}</p>
        </div>
        <Link to="/notas" className="btn btn-primary no-underline">
          {profile?.role === 'admin' ? 'Registrar nota' : 'Ver todas las notas'} <ArrowRight size={14} />
        </Link>
      </div>

      {/* KPIs ejecutivos */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatCard label="Notas en implementación" value={prd.inImpl}
          sub={<>{prd.enCurso} en curso · {prd.concluidas} concluidas · {prd.noAplicaron} no aplicaron</>}
          icon={<FileText size={19} />} color="#93c5fd" />
        <StatCard label="En Producción" value={prd.closed.length}
          sub={`notas cerradas de ${prd.withPrd} con alcance productivo`}
          icon={<CheckCircle2 size={19} />} color="#34d399" />
        <StatCard label="Pendientes en Producción" value={prd.pending.length}
          sub={`${prd.sysPend} sistema${prd.sysPend === 1 ? '' : 's'} productivo${prd.sysPend === 1 ? '' : 's'} por implementar`}
          icon={<Factory size={19} />} color={prd.pending.length ? '#fca5a5' : '#34d399'} />
        <StatCard label="Seguimientos con demora" value={stats.delayed.length}
          sub={<span>
            <span style={{ color: DELAY_META.yellow.fg }}>{stats.byLevel.yellow} amarillo</span> ·{' '}
            <span style={{ color: DELAY_META.orange.fg }}>{stats.byLevel.orange} naranja</span> ·{' '}
            <span style={{ color: DELAY_META.red.fg }}>{stats.byLevel.red} rojo</span>
          </span>}
          icon={<AlertTriangle size={19} />} color={stats.delayed.length ? '#fca5a5' : '#34d399'} />
        <StatCard label="Implementación general" value={`${prd.allPct}%`}
          sub={`${prd.allDone} de ${prd.allTot} implementaciones concluidas en todos los ambientes`}
          icon={<ShieldCheck size={19} />} color={prd.allPct >= 80 ? '#34d399' : '#93c5fd'} />
      </div>

      <div className="panel overflow-hidden">
        <Reading flush>
          <b className="text-[var(--text)]">Lectura general:</b> de {tus}<Hl c={BLUE}>{prd.inImpl}</Hl> notas en implementación,{' '}
          <Hl c={GREEN}>{prd.closed.length}</Hl> ya están cerradas en Producción y <Hl c={RED}>{prd.pending.length}</Hl> siguen
          abiertas en <Hl c={RED}>{prd.sysPend}</Hl> {plural(prd.sysPend, 'sistema productivo', 'sistemas productivos')}.{' '}
          {stats.byLevel.red > 0
            ? <><Hl c={RED}>{stats.byLevel.red}</Hl> {plural(stats.byLevel.red, 'seguimiento está', 'seguimientos están')} en rojo (15+ días hábiles sin avance).</>
            : <>Ningún seguimiento está en rojo.</>}
        </Reading>
      </div>

      {/* Producción: cobertura + distancia */}
      <div className="grid-split">
        <Panel title="Cobertura en Producción" icon={<Factory size={15} />} bodyClass="p-4"
          reading={prd.sysPend + prd.sysDone === 0 ? 'Aún no hay notas con alcance en sistemas productivos.' : <>
            Mide qué tanto del riesgo ya se cerró donde más importa: los sistemas productivos.{' '}
            {prd.sysPend === 0
              ? <>Todos los sistemas productivos ya tienen sus notas implementadas.</>
              : <>Hoy el <Hl c={BLUE}>{prd.pct}%</Hl> de los sistemas PRD ya tiene la nota implementada; quedan{' '}
                <Hl c={RED}>{prd.sysPend}</Hl> {plural(prd.sysPend, 'sistema pendiente', 'sistemas pendientes')} repartidos en{' '}
                <Hl c={RED}>{prd.pending.length}</Hl> {plural(prd.pending.length, 'nota', 'notas')}.</>}
          </>}>
          <div className="flex items-center gap-6 flex-wrap">
            <ProgressGauge pct={prd.pct} label="Sistemas PRD" />
            <div className="flex-1 min-w-[220px] flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#059669' }} />
                <span className="text-[13px] flex-1">Notas ya en Producción</span>
                <span className="text-[17px] font-extrabold" style={{ color: '#34d399' }}>{prd.closed.length}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
                <span className="text-[13px] flex-1">Notas pendientes en Producción</span>
                <span className="text-[17px] font-extrabold" style={{ color: '#fca5a5' }}>{prd.pending.length}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#64748b' }} />
                <span className="text-[13px] flex-1">Sin alcance productivo</span>
                <span className="text-[17px] font-extrabold text-[var(--muted)]">{prd.sinPrd}</span>
              </div>
              <div className="text-[11.5px] text-[var(--muted)] pt-2 border-t border-[var(--border)]">
                Sistemas productivos: <b style={{ color: '#34d399' }}>{prd.sysDone}</b> implementados ·{' '}
                <b style={{ color: '#fca5a5' }}>{prd.sysPend}</b> pendientes
              </div>
            </div>
          </div>
          {prd.closed.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border)]">
              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--muted)] mb-2">Notas implementadas en Producción</div>
              <div className="flex flex-wrap gap-1.5">
                {prd.closed.map((n) => (
                  <span key={n.note} className="chip cursor-pointer" onClick={() => navigate(`/notas?q=${n.note}`)}
                    title={`${n.done.length} sistema(s) PRD implementado(s)`}
                    style={{ color: '#6ee7b7', background: 'rgba(5,150,105,.12)', borderColor: 'rgba(16,185,129,.4)' }}>
                    <CheckCircle2 size={11} /> {n.note}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Etapa actual de las notas pendientes en Producción" icon={<Route size={15} />} bodyClass="p-4"
          reading={<>
            Muestra en qué etapa del flujo va cada nota pendiente en Producción (si sus sistemas avanzan a distinto ritmo, se ubica
            en la etapa más atrasada). En azul, las que van dentro del tiempo esperado; en rojo, las que llevan 5 o más días hábiles sin avance.{' '}
            {stageParts.length > 0 && <>De <Hl>{prd.pending.length}</Hl> {plural(prd.pending.length, 'nota', 'notas')}:{' '}
              {stageParts.map((part, k) => (
                <span key={k}>{k > 0 && (k === stageParts.length - 1 ? ' y ' : ', ')}{part}</span>
              ))}.</>}
          </>}>
          {prd.pending.length ? (
            <StageBars data={prd.funnel} />
          ) : (
            <Empty icon={<CheckCircle2 size={30} />} title="Sin pendientes en Producción" sub="Todas las notas con alcance productivo ya están implementadas." />
          )}
        </Panel>
      </div>

      {/* La lista clave */}
      <Panel title={`Notas pendientes de implementar en Producción · ${prd.pending.length}`} icon={<ShieldAlert size={15} />} bodyClass="p-0"
        reading={<>
          Es la lista de trabajo para cerrar Producción: cada fila es una nota con al menos un sistema productivo sin implementar, de la más atrasada a la menos.{' '}
          {topPending && <>La más atrasada es la <Hl>{topPending.note}</Hl> con <Hl c={RED}>{prd.worst(topPending)} días hábiles</Hl> sin avance;{' '}
            <Hl c={RED}>{critNotes} de {prd.pending.length}</Hl> {plural(prd.pending.length, 'nota está', 'notas están')} en rojo.</>}
        </>}>
        {prd.pending.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nota</th><th>Prioridad</th><th>Avance en PRD</th><th>Sistemas productivos pendientes</th>
                  <th>Etapa más atrasada</th><th>Sin avance</th>{isStaff && <th>Responsable</th>}
                </tr>
              </thead>
              <tbody>
                {prd.pending.map((n) => {
                  const tot = n.done.length + n.pend.length
                  const farthest = prd.stageOf(n)
                  const admins = [...new Set(n.pend.map((p) => p.adminId))]
                  return (
                    <tr key={n.note} className="rowlink" onClick={() => navigate(`/notas?q=${n.note}`)}>
                      <td className="font-bold">{n.note}</td>
                      <td><PriorityChip p={n.priority} /></td>
                      <td style={{ minWidth: 150 }}>
                        <ProgressBar pct={Math.round((n.done.length / tot) * 100)} />
                        <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{n.done.length} de {tot} sistemas PRD</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {n.pend.map((p, i) => (
                            <span key={i} className="chip"
                              title={`${p.group} · ${PIPELINE_STAGES[p.stage].label} · ${p.days} d háb.`}
                              style={{ color: '#fca5a5', background: 'rgba(239,68,68,.12)', borderColor: 'rgba(239,68,68,.45)' }}>
                              {p.sid}<span className="opacity-70 font-normal ml-0.5">· {p.group}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-[12.5px]" style={{ color: farthest === 0 ? '#fca5a5' : 'var(--muted)' }}>
                        {PIPELINE_STAGES[farthest].label}
                      </td>
                      <td><DelayChip days={prd.worst(n)} showOk /></td>
                      {isStaff && <td className="text-[var(--muted)] text-[12.5px]">{admins.map(nameOf).join(', ')}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<CheckCircle2 size={30} />} title="Ninguna nota pendiente en Producción" sub="Todas las notas con alcance productivo ya están implementadas en PRD." />
        )}
      </Panel>

      {/* Atención inmediata */}
      <div className={isStaff ? 'grid-split' : 'grid-split-23'}>
        <Panel title="Demoras — requieren atención" icon={<AlertTriangle size={15} />} bodyClass="p-0"
          reading={<>
            Seguimientos con 5 o más días hábiles sin avance, del más atrasado al menos (se muestran los 8 principales).{' '}
            {stats.delayed.length
              ? <>Hoy son <Hl c={RED}>{stats.delayed.length}</Hl>, de los cuales <Hl c={RED}>{stats.byLevel.red}</Hl> {plural(stats.byLevel.red, 'está', 'están')} en rojo.</>
              : <>Hoy ninguno rebasa ese umbral.</>}
          </>}>
          <DelayedList vms={vms} showAdmin={isStaff} profiles={profiles} />
        </Panel>
        {isStaff ? (
          <Panel title="Motivos de atraso" icon={<AlarmClock size={15} />} bodyClass="p-4"
            reading={<>
              Explica por qué no avanzan los seguimientos, según lo que documentan los administradores.{' '}
              {delayStats.top && <>La causa principal es <Hl c={delayStats.top.color}>{delayStats.top.label}</Hl> ({delayStats.top.value} de {delayStats.total}).{' '}</>}
              {sinMotivo > 0 && <><Hl c={RED}>{sinMotivo}</Hl> {plural(sinMotivo, 'seguimiento activo no tiene', 'seguimientos activos no tienen')} motivo registrado, así que su causa se desconoce.</>}
            </>}
            actions={<span className="text-[11.5px] text-[var(--muted)]">{delayStats.total} con motivo documentado</span>}>
            <CategoryBars data={delayStats.rows} />
          </Panel>
        ) : (
          <Panel title="Mis tracks recientes" icon={<Layers size={15} />} bodyClass="p-0"
            reading="Tus seguimientos más recientes con el paso en que van; da clic en uno para documentar su avance.">
            <TracksTable vms={vms} />
          </Panel>
        )}
      </div>

      {isStaff && (
        <Panel title="Desempeño por administrador" icon={<Users size={15} />} bodyClass="p-0"
          reading={<>
            Compara la carga y el atraso de cada administrador, ordenados por quién tiene más seguimientos críticos.{' '}
            {topAdmin && <><Hl>{topAdmin.p.full_name ?? topAdmin.p.email}</Hl> concentra <Hl c={RED}>{topAdmin.crit}</Hl> {plural(topAdmin.crit, 'crítico')}
              {topAdmin.prdPend > 0 && <> y <Hl c={RED}>{topAdmin.prdPend}</Hl> {plural(topAdmin.prdPend, 'sistema productivo pendiente', 'sistemas productivos pendientes')}</>}.{' '}</>}
            {idleAdmins > 0 && <><Hl c={GREEN}>{idleAdmins}</Hl> {plural(idleAdmins, 'administrador no tiene', 'administradores no tienen')} seguimientos abiertos.</>}
          </>}>
          {adminRows.length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Administrador</th><th>Tracks</th><th>Activos</th><th>Completados</th>
                    <th>PRD pendientes</th><th>Críticos</th><th>Peor demora</th><th>Cobertura en Producción</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRows.map((r) => (
                    <tr key={r.p.id}>
                      <td>
                        <div className="font-bold">{r.p.full_name ?? '—'}</div>
                        <div className="text-[11px] text-[var(--muted)]">{r.p.email}</div>
                      </td>
                      <td className="font-bold">{r.total}</td>
                      <td>{r.act}</td>
                      <td style={{ color: '#34d399' }}>{r.done}</td>
                      <td style={{ color: r.prdPend ? '#fca5a5' : 'var(--muted)', fontWeight: r.prdPend ? 700 : 400 }}>{r.prdPend || '—'}</td>
                      <td style={{ color: r.crit ? '#fca5a5' : 'var(--muted)', fontWeight: r.crit ? 700 : 400 }}>{r.crit || '—'}</td>
                      <td>{r.worst > 0 ? <DelayChip days={r.worst} /> : <span className="text-xs" style={{ color: '#34d399' }}>Sin demoras</span>}</td>
                      <td style={{ minWidth: 150 }}>
                        {r.prdPct == null
                          ? <span className="text-xs text-[var(--muted)]">Sin sistemas PRD</span>
                          : <><ProgressBar pct={r.prdPct} /><div className="text-[10.5px] text-[var(--muted)] mt-0.5">{r.prdLabel}</div></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={<Users size={30} />} title="Sin administradores con actividad" sub="Crea administradores desde la consola de Usuarios." />}
        </Panel>
      )}

      {!isStaff && vms.some((v) => v.status === 'en_progreso') && (
        <div className="text-[11px] text-[var(--muted)] flex items-center gap-2 px-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: DELAY_META.yellow.fg }} /> 5+ días hábiles sin avance
          <span className="w-2 h-2 rounded-full inline-block ml-2" style={{ background: DELAY_META.orange.fg }} /> 10+ hábiles
          <span className="w-2 h-2 rounded-full inline-block ml-2" style={{ background: DELAY_META.red.fg }} /> 15+ hábiles
          <span className="ml-3">Fecha de corte: {fmtDate(new Date().toISOString())}</span>
        </div>
      )}
    </div>
  )
}
