import type { Env, NoteTrack, TrackStep } from './types'

export const ENV_LABELS: Record<Env, string> = {
  DEV: 'Desarrollo',
  QAS: 'Calidad',
  PRE: 'Pre Producción',
  SBX: 'Sandbox',
  PRD: 'Producción',
}

export const ENV_ORDER: Env[] = ['DEV', 'QAS', 'PRE', 'SBX', 'PRD']

export interface StepDef {
  key: string
  title: string
  description: string
  requires?: 'transport_order' | 'sarox'
}

// Flujo canónico de implementación de una Nota SAP.
// Los pasos ligados a un ambiente solo se generan si el grupo lo tiene.
export function buildSteps(envs: Set<Env>): StepDef[] {
  const steps: StepDef[] = []
  steps.push({
    key: 'snote',
    title: 'Evaluación en SNOTE',
    description:
      'Verificar en la SNOTE si la nota es implementable en este sistema. Si no aplica, adjuntar evidencia de la SNOTE, indicar el motivo y finalizar el seguimiento.',
  })
  if (envs.has('DEV')) {
    steps.push({
      key: 'impl_dev',
      title: 'Implementación en Desarrollo',
      description:
        'Implementar la nota vía SNOTE en el ambiente de Desarrollo. Capturar el número de la Orden de Transporte (OT) generada.',
      requires: 'transport_order',
    })
  }
  steps.push({
    key: 'sarox',
    title: 'Solicitud de SAROX (TQS → KOF)',
    description:
      'El TQS solicita el SAROX al cliente KOF para rastrear la OT. Capturar el número SAROX proporcionado.',
    requires: 'sarox',
  })
  steps.push({
    key: 'release_ot',
    title: 'Liberación de la OT en Desarrollo',
    description:
      'Colocar el SAROX en la short description de la Orden de Transporte y liberar la OT en Desarrollo.',
  })
  if (envs.has('QAS')) {
    steps.push({
      key: 'kit_qa',
      title: 'VoBo y KIT para Calidad (KOF)',
      description:
        'El TQS solicita a KOF la autorización y la creación del KIT correspondiente para implementar la OT en el ambiente de Calidad.',
    })
    steps.push({
      key: 'impl_qa',
      title: 'Implementación en Calidad',
      description:
        'Implementar la OT en el ambiente de Calidad y compartir la evidencia con el cliente.',
    })
  }
  if (envs.has('PRE')) {
    steps.push({
      key: 'kit_pre',
      title: 'VoBo, KIT y QA Approval para Pre Producción',
      description:
        'Solicitar a KOF el VoBo y KIT para Pre Producción, además de la liberación de la OT mediante el QA Approval en la STMS del lado de KOF.',
    })
    steps.push({
      key: 'impl_pre',
      title: 'Implementación en Pre Producción',
      description: 'Implementar la OT en el ambiente Pre Productivo.',
    })
  }
  if (envs.has('SBX') || envs.has('PRD')) {
    steps.push({
      key: 'vobo_prd',
      title: 'VoBo para Sandbox / Producción',
      description:
        'Solicitar el visto bueno de KOF para implementar la OT en Sandbox y/o Producción.',
    })
  }
  if (envs.has('SBX')) {
    steps.push({
      key: 'impl_sbx',
      title: 'Implementación en Sandbox',
      description: 'Implementar la OT en el ambiente Sandbox.',
    })
  }
  if (envs.has('PRD')) {
    steps.push({
      key: 'impl_prd',
      title: 'Implementación en Producción',
      description:
        'Implementar la OT en el ambiente Productivo. Con este paso concluye el track de la nota.',
    })
  }
  return steps
}

// ── Demoras ──────────────────────────────────────────────
export type DelayLevel = 'ok' | 'yellow' | 'orange' | 'red'

export function daysStuck(track: Pick<NoteTrack, 'status' | 'last_progress_at'>): number {
  if (track.status !== 'en_progreso') return 0
  const ms = Date.now() - new Date(track.last_progress_at).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
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

// Progreso de un track a partir de sus pasos
export function trackProgress(steps: Pick<TrackStep, 'status'>[]): { done: number; total: number; pct: number } {
  const total = steps.length
  const done = steps.filter((s) => s.status === 'completado').length
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
