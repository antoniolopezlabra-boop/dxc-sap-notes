import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts'
import { PRIORITY_META, STATUS_META } from '../lib/workflow'

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

// ── Área: actividad de pasos completados por día ──
export function ActivityArea({ data }: { data: { day: string; pasos: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4d8dff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#4d8dff" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 10.5 }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tick={{ fill: AXIS, fontSize: 10.5 }} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
        <Tooltip content={<DarkTooltip />} cursor={{ stroke: '#2e4d82', strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="pasos" name="Pasos completados" stroke="#4d8dff" strokeWidth={2}
          fill="url(#gradBlue)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#0c1832' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Donut: distribución por prioridad ──
export function PriorityDonut({ data, centerLabel }: {
  data: { name: string; value: number }[]
  centerLabel: string
}) {
  const total = data.reduce((a, d) => a + d.value, 0)
  const filled = data.filter((d) => d.value > 0)
  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={filled.length ? filled : [{ name: 'Sin datos', value: 1 }]}
              dataKey="value" innerRadius={48} outerRadius={68} paddingAngle={3}
              stroke="#0c1832" strokeWidth={2} isAnimationActive={false}>
              {(filled.length ? filled : [{ name: 'Sin datos', value: 1 }]).map((d) => (
                <Cell key={d.name} fill={filled.length ? (PRIORITY_META[d.name]?.chart ?? '#64748b') : '#1a2c50'} />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[22px] font-extrabold leading-6">{total}</span>
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{centerLabel}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PRIORITY_META[d.name]?.chart ?? '#64748b' }} />
            <span className="text-[var(--muted)] w-7 font-semibold">{d.name}</span>
            <span className="font-bold">{d.value}</span>
            <span className="text-[var(--muted)]">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Barras apiladas por administrador ──
export function AdminStackedBars({ data }: {
  data: { name: string; 'En progreso': number; Completada: number; 'No aplica': number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barSize={26}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 10.5 }} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis tick={{ fill: AXIS, fontSize: 10.5 }} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(77,141,255,.05)' }} />
        <Legend wrapperStyle={{ fontSize: 11.5, color: AXIS }} iconType="circle" iconSize={8} />
        <Bar dataKey="En progreso" stackId="a" fill={STATUS_META.en_progreso.chart} stroke="#0c1832" strokeWidth={1} isAnimationActive={false} />
        <Bar dataKey="Completada" stackId="a" fill={STATUS_META.completada.chart} stroke="#0c1832" strokeWidth={1} isAnimationActive={false} />
        <Bar dataKey="No aplica" stackId="a" fill={STATUS_META.no_aplica.chart} stroke="#0c1832" strokeWidth={1}
          radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
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
