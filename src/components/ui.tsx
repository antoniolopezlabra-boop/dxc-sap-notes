import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'
import { DELAY_META, PRIORITY_META, STATUS_META, delayLevel } from '../lib/workflow'

export function Panel({
  title, icon, actions, children, className = '', bodyClass = '',
}: {
  title?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <div className={`panel ${className}`}>
      {title != null && (
        <div className="panel-head">
          <div className="flex items-center gap-2">
            {icon && <span className="text-[var(--blue)]">{icon}</span>}
            <span className="panel-title">{title}</span>
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClass || 'p-4'}>{children}</div>
    </div>
  )
}

export function StatCard({
  label, value, sub, icon, color = 'var(--blue)',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  color?: string
}) {
  return (
    <div className="panel p-4 flex items-center gap-3.5">
      {icon && (
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(77,141,255,.08)', border: '1px solid var(--border)', color }}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold tracking-wide text-[var(--muted)] uppercase">{label}</div>
        <div className="text-[24px] font-extrabold leading-7" style={{ color }}>{value}</div>
        {sub && <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function Chip({ fg, bg, bd, children, style }: {
  fg: string; bg: string; bd: string; children: ReactNode; style?: CSSProperties
}) {
  return (
    <span className="chip" style={{ color: fg, background: bg, borderColor: bd, ...style }}>
      {children}
    </span>
  )
}

export function PriorityChip({ p }: { p: string }) {
  const m = PRIORITY_META[p] ?? PRIORITY_META.P3
  return <Chip fg={m.fg} bg={m.bg} bd={m.bd}>{p}</Chip>
}

export function StatusChip({ s }: { s: string }) {
  const m = STATUS_META[s] ?? STATUS_META.en_progreso
  return <Chip fg={m.fg} bg={m.bg} bd={m.bd}>{m.label}</Chip>
}

export function DelayChip({ days, showOk = false }: { days: number; showOk?: boolean }) {
  const lvl = delayLevel(days)
  if (lvl === 'ok' && !showOk) return <span className="text-[var(--muted)] text-xs">{days} d háb.</span>
  const m = DELAY_META[lvl]
  return (
    <Chip fg={m.fg} bg={m.bg} bd={m.bd}>
      {lvl === 'ok' ? m.label : `${m.label} · ${days} d háb.`}
    </Chip>
  )
}

export function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  const c = color ?? (pct >= 100 ? '#059669' : '#4d8dff')
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-[7px] rounded-full flex-1 overflow-hidden" style={{ background: '#0a142b', border: '1px solid #1a2c50' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: c }} />
      </div>
      <span className="text-[11.5px] font-bold w-9 text-right" style={{ color: c }}>{pct}%</span>
    </div>
  )
}

export function Modal({
  title, onClose, children, width = 560,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="panel w-full" style={{ maxWidth: width }}>
        <div className="panel-head">
          <span className="panel-title">{title}</span>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white cursor-pointer p-1">
            <X size={17} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--muted)]">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--border)] border-t-[var(--blue)] animate-spin" />
      <span className="text-xs">{label}</span>
    </div>
  )
}

export function Empty({ icon, title, sub }: { icon?: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-[var(--muted)] opacity-60">{icon}</div>}
      <div className="font-semibold text-[var(--text)]">{title}</div>
      {sub && <div className="text-xs text-[var(--muted)] max-w-[380px]">{sub}</div>}
    </div>
  )
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg px-3.5 py-2.5 text-[13px] font-medium"
      style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#fca5a5' }}>
      {msg}
    </div>
  )
}
