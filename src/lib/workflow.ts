import type { Env, NoteTrack, TrackStep, TrackStatus } from './types'

export const ENV_LABELS: Record<Env, string> = {
  DEV: 'Desarrollo',
  QAS: 'Calidad',
  PRE: 'Pre Producción',
  SBX: 'Sandbox',
  PRD: 'Producción',
}

export const ENV_ORDER: Env[] = ['DEV', 'QAS', 'PRE', 'SBX', 'PRD']

// Paso del flujo cuya finalización implica que la nota quedó implementada en ese ambiente.
export const IMPL_STEP_BY_ENV: Record<Env, string> = {
  DEV: 'impl_dev',
  QAS: 'impl_qa',
  PRE: 'impl_pre',
  SBX: 'impl_sbx',
  PRD: 'impl_prd',
}

// Ambientes considerados "productivos" para el filtro rápido del dashboard de cobertura.
export const PRODUCTIVE_ENVS: Env[] = ['PRD']

// Catálogo de motivos de demora que el administrador puede documentar en un paso.
export interface DelayReasonDef { key: string; label: string; chart: string }
export const DELAY_REASONS: DelayReasonDef[] = [
  { key: 'tqs_sin_seguimiento', label: 'TQS — no ha dado seguimiento', chart: '#4d8dff' },
  { key: 'admin_sin_seguimiento', label: 'Admin — no le he dado seguimiento', chart: '#d97706' },
  { key: 'kof_sin_autorizar', label: 'KOF aún no ha autorizado', chart: '#ef4444' },
  { key: 'falta_permisos', label: 'Falta de permisos', chart: '#8b5cf6' },
  { key: 'espera_sarox', label: 'En espera de SAROX', chart: '#059669' },
]

export const DELAY_REASON_LABEL: Record<string, string> = Object.fromEntries(
  DELAY_REASONS.map((r) => [r.key, r.label]),
)
export const DELAY_REASON_COLOR: Record<string, string> = Object.fromEntries(
  DELAY_REASONS.map((r) => [r.key, r.chart]),
)

export function delayReasonLabel(key: string | null | undefined): string {
  if (!key) return '—'
  return DELAY_REASON_LABEL[key] ?? key
}

// El catálogo de pasos del flujo vive como fuente única en el servidor:
// función SQL public.note_step_catalog(envs) + public.reconcile_group_tracks(group).
// Se invoca al crear una nota (Notas.tsx) y al cambiar sistemas (Sistemas.tsx),
// de modo que los pasos de cada track siempre reflejan los ambientes vigentes.

// ── Demoras (en DÍAS HÁBILES, lun–vie) ───────────────────
// Debe coincidir con la función SQL public.sap_business_days usada por el
// motor de alertas: cuenta los días entre semana posteriores a `from` hasta hoy.
export type DelayLevel = 'ok' | 'yellow' | 'orange' | 'red'

export function businessDaysBetween(from: Date, to: Date): number {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + 1) // desde el día siguiente al último avance
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  let count = 0
  while (d <= end) {
    const dow = d.getDay() // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export function daysStuck(track: Pick<NoteTrack, 'status' | 'last_progress_at'>): number {
  if (track.status !== 'en_progreso') return 0
  return businessDaysBetween(new Date(track.last_progress_at), new Date())
}

export function delayLevel(days: number): DelayLevel {
  if (days >= 15) return 'red'
  if (days >= 10) return 'orange'
  if (days >= 5) return 'yellow'
  return 'ok'
}

export const DELAY_META: Record<DelayLevel, { label: string; fg: string; bg: string; bd: string }> = {
  ok: { label: 'En tiempo', fg: '#6ee7b7', bg: 'rgba(5,150,105,.12)', bd: 'rgba(16,185,129,.4)' },
  yellow: { label: 'Demora', fg: '#fcd34d', bg: 'rgba(217,119,6,.14)', bd: 'rgba(245,158,11,.45)' },
  orange: { label: 'Demora alta', fg: '#fdba74', bg: 'rgba(234,88,12,.16)', bd: 'rgba(249,115,22,.5)' },
  red: { label: 'Crítico', fg: '#fca5a5', bg: 'rgba(239,68,68,.16)', bd: 'rgba(239,68,68,.55)' },
}

export const PRIORITY_META: Record<string, { fg: string; bg: string; bd: string; chart: string }> = {
  P1: { fg: '#fca5a5', bg: 'rgba(239,68,68,.14)', bd: 'rgba(239,68,68,.5)', chart: '#ef4444' },
  P2: { fg: '#fcd34d', bg: 'rgba(217,119,6,.14)', bd: 'rgba(245,158,11,.45)', chart: '#d97706' },
  P3: { fg: '#93c5fd', bg: 'rgba(77,141,255,.12)', bd: 'rgba(77,141,255,.45)', chart: '#4d8dff' },
}

export const STATUS_META: Record<string, { label: string; fg: string; bg: string; bd: string; chart: string }> = {
  en_progreso: { label: 'En progreso', fg: '#93c5fd', bg: 'rgba(77,141,255,.12)', bd: 'rgba(77,141,255,.45)', chart: '#4d8dff' },
  completada: { label: 'Completada', fg: '#6ee7b7', bg: 'rgba(5,150,105,.12)', bd: 'rgba(16,185,129,.4)', chart: '#059669' },
  no_aplica: { label: 'No aplica', fg: '#a8b6d4', bg: 'rgba(100,116,139,.16)', bd: 'rgba(100,116,139,.5)', chart: '#64748b' },
}

// Progreso de un track a partir de sus pasos. Un track "no aplica" es un
// cierre definitivo: su proceso concluyó, así que el avance es 100% aunque
// el resto de los pasos ya no se ejecuten.
export function trackProgress(
  steps: Pick<TrackStep, 'status'>[],
  trackStatus?: TrackStatus,
): { done: number; total: number; pct: number } {
  const total = steps.length
  const done = steps.filter((s) => s.status === 'completado').length
  if (trackStatus === 'no_aplica') return { done, total, pct: 100 }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d.length === 10 ? d + 'T12:00:00' : d)
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
