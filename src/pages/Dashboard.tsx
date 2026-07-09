import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Activity, CheckCircle2, AlertTriangle, XCircle, TrendingUp,
  PieChart as PieIcon, BarChart3, Clock, Users, ArrowRight, AlarmClock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { NoteTrack, TrackStep, Profile } from '../lib/types'
import {
  daysStuck, delayLevel, trackProgress, DELAY_META, fmtDate, DELAY_REASONS,
} from '../lib/workflow'
import {
  Panel, StatCard, Spinner, Empty, PriorityChip, StatusChip, DelayChip, ProgressBar,
} from '../components/ui'
import { ActivityArea, PriorityDonut, AdminStackedBars, ProgressGauge, CategoryBars } from '../components/charts'

interface TrackVM extends NoteTrack {
  steps: TrackStep[]
  days: number
  level: ReturnType<typeof delayLevel>
  progress: { done: number; total: number; pct: number }
  currentTitle: string
}

function useDashboardData() {
  const { profile } = useAuth()
  const [tracks, setTracks] = useState<NoteTrack[]>([])
  const [steps, setSteps] = useState<TrackStep[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const isStaff = profile?.role === 'superuser' || profile?.role === 'supervisor'

  useEffect(() => {
    if (!profile) return
    let alive = true
    async function load() {
      const [t, s, p] = await Promise.all([
        supabase.from('note_tracks').select('*, system_groups(name)').order('created_at', { ascending: false }),
        supabase.from('track_steps').select('id, track_id, admin_id, step_key, step_order, title, status, started_at, completed_at, description, requires_input, input_value, comment, evidence_path, delay_reason, delay_note, delay_logged_at'),
        isStaff ? supabase.from('profiles').select('*') : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      setTracks((t.data as NoteTrack[]) ?? [])
      setSteps((s.data as TrackStep[]) ?? [])
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
        progress: trackProgress(ts),
        currentTitle: t.status === 'completada' ? 'Concluido'
          : t.status === 'no_aplica' ? 'No aplicó'
          : current?.title ?? '—',
      }
    })
  }, [tracks, steps])

  return { vms, steps, profiles, loading, isStaff, profile }
}

function activitySeries(steps: TrackStep[]) {
  const days: { day: string; pasos: number }[] = []
  const counts = new Map<string, number>()
  for (const s of steps) {
    if (s.status !== 'completado' || !s.completed_at) continue
    const key = s.completed_at.slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    days.push({
      day: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
      pasos: counts.get(key) ?? 0,
    })
  }
  return days
}

function DelayedList({ vms, showAdmin, profiles }: { vms: TrackVM[]; showAdmin?: boolean; profiles?: Profile[] }) {
  const navigate = useNavigate()
  const delayed = vms
    .filter((v) => v.status === 'en_progreso' && v.level !== 'ok')
    .sort((a, b) => b.days - a.days)
    .slice(0, 8)
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name?.split(' ')[0] ?? '—'
  if (!delayed.length) {
    return <Empty icon={<CheckCircle2 size={30} />} title="Sin demoras" sub="Todos los tracks activos están dentro del tiempo esperado (menos de 5 días hábiles sin seguimiento)." />
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
            <PriorityChip p={v.priority} />
            <DelayChip days={v.days} />
          </button>
        )
      })}
    </div>
  )
}

function TracksTable({ vms, showAdmin, profiles, limit = 8 }: {
  vms: TrackVM[]; showAdmin?: boolean; profiles?: Profile[]; limit?: number
}) {
  const navigate = useNavigate()
  const rows = vms.slice(0, limit)
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name?.split(' ')[0] ?? '—'
  if (!rows.length) return <Empty icon={<FileText size={30} />} title="Aún no hay notas registradas" sub="Registra tu primera nota desde la pestaña Notas." />
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Nota</th><th>Grupo</th>{showAdmin && <th>Admin</th>}<th>Prioridad</th>
            <th>Paso actual</th><th>Avance</th><th>Estado</th><th>Días</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className="rowlink" onClick={() => navigate(`/tracks/${v.id}`)}>
              <td className="font-bold">{v.note_number}</td>
              <td>{v.system_groups?.name}</td>
              {showAdmin && <td className="text-[var(--muted)]">{nameOf(v.admin_id)}</td>}
              <td><PriorityChip p={v.priority} /></td>
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
  const { vms, steps, profiles, loading, isStaff, profile } = useDashboardData()

  const stats = useMemo(() => {
    const active = vms.filter((v) => v.status === 'en_progreso')
    const done = vms.filter((v) => v.status === 'completada')
    const na = vms.filter((v) => v.status === 'no_aplica')
    const delayed = active.filter((v) => v.level !== 'ok')
    const byLevel = { yellow: 0, orange: 0, red: 0 }
    for (const v of delayed) byLevel[v.level as 'yellow' | 'orange' | 'red']++
    const uniqueActive = new Set(active.map((v) => v.note_number)).size
    const uniqueTotal = new Set(vms.map((v) => v.note_number)).size
    const relevant = vms.filter((v) => v.status !== 'no_aplica')
    const totalSteps = relevant.reduce((a, v) => a + v.progress.total, 0)
    const doneSteps = relevant.reduce((a, v) => a + v.progress.done, 0)
    const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0
    const prio = (['P1', 'P2', 'P3'] as const).map((p) => ({
      name: p,
      value: new Set(active.filter((v) => v.priority === p).map((v) => v.note_number)).size,
    }))
    return { active, done, na, delayed, byLevel, uniqueActive, uniqueTotal, pct, prio }
  }, [vms])

  const adminBars = useMemo(() => {
    if (!isStaff) return []
    return profiles
      .filter((p) => p.role === 'admin')
      .map((p) => {
        const mine = vms.filter((v) => v.admin_id === p.id)
        return {
          name: p.full_name?.split(' ')[0] ?? p.email.split('@')[0],
          'En progreso': mine.filter((v) => v.status === 'en_progreso').length,
          Completada: mine.filter((v) => v.status === 'completada').length,
          'No aplica': mine.filter((v) => v.status === 'no_aplica').length,
        }
      })
      .filter((r) => r['En progreso'] + r.Completada + r['No aplica'] > 0)
  }, [isStaff, profiles, vms])

  const adminRows = useMemo(() => {
    if (!isStaff) return []
    return profiles
      .filter((p) => p.role === 'admin')
      .map((p) => {
        const mine = vms.filter((v) => v.admin_id === p.id)
        const act = mine.filter((v) => v.status === 'en_progreso')
        const del = act.filter((v) => v.level !== 'ok')
        const worst = del.reduce((m, v) => Math.max(m, v.days), 0)
        const rel = mine.filter((v) => v.status !== 'no_aplica')
        const tot = rel.reduce((a, v) => a + v.progress.total, 0)
        const don = rel.reduce((a, v) => a + v.progress.done, 0)
        return {
          p, total: mine.length, act: act.length,
          done: mine.filter((v) => v.status === 'completada').length,
          delayed: del.length, worst,
          pct: tot ? Math.round((don / tot) * 100) : 0,
        }
      })
  }, [isStaff, profiles, vms])

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

  const title = isStaff ? 'Panorama general del equipo' : 'Mi panel de seguimiento'
  const sub = isStaff
    ? 'Visibilidad consolidada del trabajo de todos los administradores'
    : `Seguimiento de tus notas y sistemas asignados`

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

      {/* KPIs */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <StatCard label="Notas únicas activas" value={stats.uniqueActive} sub={`${stats.uniqueTotal} registradas en total`}
          icon={<FileText size={19} />} color="#93c5fd" />
        <StatCard label="Tracks en progreso" value={stats.active.length} sub="Sistemas pendientes por remediar"
          icon={<Activity size={19} />} color="#4d8dff" />
        <StatCard label="Completados" value={stats.done.length} sub="Implementados hasta Producción"
          icon={<CheckCircle2 size={19} />} color="#34d399" />
        <StatCard label="Con demora" value={stats.delayed.length}
          sub={<span>
            <span style={{ color: DELAY_META.yellow.fg }}>{stats.byLevel.yellow} amarillo</span> ·{' '}
            <span style={{ color: DELAY_META.orange.fg }}>{stats.byLevel.orange} naranja</span> ·{' '}
            <span style={{ color: DELAY_META.red.fg }}>{stats.byLevel.red} rojo</span>
          </span>}
          icon={<AlertTriangle size={19} />} color={stats.delayed.length ? '#fca5a5' : '#34d399'} />
        <StatCard label="No aplicaron" value={stats.na.length} sub="Notas no implementables"
          icon={<XCircle size={19} />} color="#a8b6d4" />
      </div>

      {/* Charts row */}
      <div className="grid-charts">
        <Panel title="Actividad · pasos completados (últimos 30 días)" icon={<TrendingUp size={15} />} bodyClass="p-2 pt-3">
          <ActivityArea data={activitySeries(steps)} />
        </Panel>
        <Panel title="Avance de implementación" icon={<Clock size={15} />} bodyClass="p-4 flex flex-col items-center justify-center gap-2">
          <ProgressGauge pct={stats.pct} />
          <div className="text-[11.5px] text-[var(--muted)]">Restante: <b className="text-[var(--text)]">{100 - stats.pct}%</b></div>
        </Panel>
        <Panel title="Notas activas por prioridad" icon={<PieIcon size={15} />} bodyClass="p-4 flex items-center justify-center">
          <PriorityDonut data={stats.prio} centerLabel="activas" />
        </Panel>
      </div>

      {/* Delays + per-admin or recent */}
      <div className={isStaff ? 'grid-split' : 'grid-split-23'}>
        <Panel title="Demoras — requieren atención" icon={<AlertTriangle size={15} />} bodyClass="p-0">
          <DelayedList vms={vms} showAdmin={isStaff} profiles={profiles} />
        </Panel>
        {isStaff ? (
          <Panel title="Tracks por administrador" icon={<BarChart3 size={15} />} bodyClass="p-2 pt-3">
            {adminBars.length
              ? <AdminStackedBars data={adminBars} />
              : <Empty icon={<Users size={30} />} title="Sin administradores con notas" sub="Cuando los administradores registren notas, aquí verás su carga de trabajo." />}
          </Panel>
        ) : (
          <Panel title="Mis tracks recientes" icon={<FileText size={15} />} bodyClass="p-0">
            <TracksTable vms={vms} />
          </Panel>
        )}
      </div>

      {/* Staff: motivos de atraso */}
      {isStaff && (
        <Panel title="Motivos de atraso" icon={<AlarmClock size={15} />} bodyClass="p-4"
          actions={<span className="text-[11.5px] text-[var(--muted)]">
            {delayStats.total} paso{delayStats.total === 1 ? '' : 's'} con demora documentada
          </span>}>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
            <CategoryBars data={delayStats.rows} />
            <div className="flex flex-col justify-center gap-1.5 border-l border-[var(--border)] pl-4">
              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--muted)]">Principal motivo</div>
              {delayStats.top ? (
                <>
                  <div className="text-[15px] font-extrabold" style={{ color: delayStats.top.color }}>{delayStats.top.label}</div>
                  <div className="text-[12px] text-[var(--muted)]">
                    {delayStats.top.value} de {delayStats.total} demoras
                    {delayStats.total ? ` (${Math.round((delayStats.top.value / delayStats.total) * 100)}%)` : ''}
                  </div>
                </>
              ) : (
                <div className="text-[13px] text-[var(--muted)]">Sin demoras documentadas por el equipo.</div>
              )}
              <div className="text-[11px] text-[var(--muted)] mt-1.5">
                Cuenta pasos activos donde un administrador documentó una demora.
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Staff: per-admin table + recent tracks */}
      {isStaff && (
        <>
          <Panel title="Detalle por administrador" icon={<Users size={15} />} bodyClass="p-0">
            {adminRows.length ? (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Administrador</th><th>Tracks</th><th>Activos</th><th>Completados</th>
                      <th>Con demora</th><th>Peor demora</th><th>Avance</th>
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
                        <td>{r.delayed > 0
                          ? <DelayChip days={r.worst} />
                          : <span className="text-xs" style={{ color: '#34d399' }}>Sin demoras</span>}
                        </td>
                        <td className="text-[var(--muted)]">{r.worst > 0 ? `${r.worst} días` : '—'}</td>
                        <td><ProgressBar pct={r.pct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon={<Users size={30} />} title="Sin administradores registrados" sub="Crea administradores desde la consola de Usuarios." />}
          </Panel>
          <Panel title="Tracks recientes (todos los administradores)" icon={<FileText size={15} />} bodyClass="p-0">
            <TracksTable vms={vms} showAdmin profiles={profiles} limit={10} />
          </Panel>
        </>
      )}

      {!isStaff && vms.some((v) => v.status === 'en_progreso') && (
        <div className="text-[11px] text-[var(--muted)] flex items-center gap-2 px-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: DELAY_META.yellow.fg }} /> 5+ días hábiles sin seguimiento
          <span className="w-2 h-2 rounded-full inline-block ml-2" style={{ background: DELAY_META.orange.fg }} /> 10+ hábiles
          <span className="w-2 h-2 rounded-full inline-block ml-2" style={{ background: DELAY_META.red.fg }} /> 15+ hábiles
          <span className="ml-3">Fecha de corte: {fmtDate(new Date().toISOString())}</span>
        </div>
      )}
    </div>
  )
}
