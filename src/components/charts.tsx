import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'

const GRID = '#1a2c50'
const AXIS = '#8ba3cc'

interface TipProps {
  active?: boolean
  label?: string | number
  payload?: Array<{
    name?: string | number
    value?: string | number
    color?: string
    payload?: { fill?: string }
  }>
}

function DarkTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs"
      style={{ background: '#0b1526', border: '1px solid #2e4d82', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
      {label != null && <div className="font-bold mb-1 text-[var(--text)]">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} />
          <span className="text-[var(--muted)]">{p.name}:</span>
          <span className="font-bold text-[var(--text)]">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Barras por ambiente: implementados vs pendientes ──
export function EnvCoverageBars({ data }: {
  data: { env: string; Implementados: number; Pendientes: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barSize={34}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="env" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis tick={{ fill: AXIS, fontSize: 10.5 }} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(77,141,255,.05)' }} />
        <Legend wrapperStyle={{ fontSize: 11.5, color: AXIS }} iconType="circle" iconSize={8} />
        <Bar dataKey="Implementados" stackId="a" fill="#059669" stroke="#0c1832" strokeWidth={1} isAnimationActive={false} />
        <Bar dataKey="Pendientes" stackId="a" fill="#ef4444" stroke="#0c1832" strokeWidth={1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Barras horizontales: conteo por categoría (motivos de demora) ──
export function CategoryBars({ data }: {
  data: { label: string; value: number; color: string }[]
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-[210px] text-[12px] shrink-0 truncate" style={{ color: d.value ? 'var(--text)' : 'var(--muted)' }} title={d.label}>
            {d.label}
          </div>
          <div className="flex-1 h-[22px] rounded-md overflow-hidden" style={{ background: '#0a142b', border: '1px solid #1a2c50' }}>
            <div className="h-full rounded-md flex items-center justify-end pr-2"
              style={{ width: d.value ? `${Math.max(4, (d.value / max) * 100)}%` : '0%', background: d.color, minWidth: d.value ? 24 : 0 }}>
              {d.value > 0 && <span className="text-[11px] font-extrabold" style={{ color: '#0b1220' }}>{d.value}</span>}
            </div>
          </div>
        </div>
      ))}
      {total === 0 && <div className="text-[12px] text-[var(--muted)] text-center pt-1">Sin demoras documentadas por el momento</div>}
    </div>
  )
}

// ── Gauge radial: % de avance global ──
export function ProgressGauge({ pct, size = 158, label = 'Avance global' }: {
  pct: number
  size?: number
  label?: string
}) {
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, pct) / 100)
  const color = pct >= 100 ? '#059669' : '#4d8dff'
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#132648" strokeWidth={11} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={11}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-extrabold leading-8" style={{ color }}>{pct}%</span>
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider mt-0.5">{label}</span>
      </div>
    </div>
  )
}
