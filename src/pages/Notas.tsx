import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, FileText, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { NoteTrack, TrackStep, SystemGroup, SystemRow, Profile, Priority } from '../lib/types'
import { daysStuck, trackProgress, fmtDate } from '../lib/workflow'
import {
  Panel, Modal, Spinner, Empty, ErrorBox, PriorityChip, StatusChip, DelayChip, ProgressBar,
} from '../components/ui'

interface VM extends NoteTrack {
  days: number
  progress: { done: number; total: number; pct: number }
  currentTitle: string
}

export default function Notas() {
  const { profile, session } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'superuser' || profile?.role === 'supervisor'

  const [tracks, setTracks] = useState<NoteTrack[]>([])
  const [steps, setSteps] = useState<TrackStep[]>([])
  const [groups, setGroups] = useState<SystemGroup[]>([])
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const [searchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [fStatus, setFStatus] = useState('')
  const [fPrio, setFPrio] = useState('')
  const [fGroup, setFGroup] = useState('')

  const load = useCallback(async () => {
    const [t, s, g, sys, p] = await Promise.all([
      supabase.from('note_tracks').select('*, system_groups(name)').order('created_at', { ascending: false }),
      supabase.from('track_steps').select('id, track_id, step_order, title, status'),
      supabase.from('system_groups').select('*').order('name'),
      supabase.from('systems').select('*'),
      isStaff ? supabase.from('profiles').select('*') : Promise.resolve({ data: [] }),
    ])
    setTracks((t.data as NoteTrack[]) ?? [])
    setSteps((s.data as TrackStep[]) ?? [])
    setGroups((g.data as SystemGroup[]) ?? [])
    setSystems((sys.data as SystemRow[]) ?? [])
    setProfiles((p.data as Profile[]) ?? [])
    setLoading(false)
  }, [isStaff])

  useEffect(() => { if (profile) load() }, [profile, load])

  const vms: VM[] = useMemo(() => {
    const byTrack = new Map<string, TrackStep[]>()
    for (const s of steps) {
      const arr = byTrack.get(s.track_id) ?? []
      arr.push(s)
      byTrack.set(s.track_id, arr)
    }
    return tracks.map((t) => {
      const ts = (byTrack.get(t.id) ?? []).sort((a, b) => a.step_order - b.step_order)
      const current = ts.find((s) => s.status === 'en_curso')
      return {
        ...t,
        days: daysStuck(t),
        progress: trackProgress(ts),
        currentTitle: t.status === 'completada' ? 'Concluido' : t.status === 'no_aplica' ? 'No aplicó' : current?.title ?? '—',
      }
    })
  }, [tracks, steps])

  const filtered = vms.filter((v) =>
    (!q || v.note_number.toLowerCase().includes(q.toLowerCase().trim()))
    && (!fStatus || v.status === fStatus)
    && (!fPrio || v.priority === fPrio)
    && (!fGroup || v.group_id === fGroup))

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? '—'

  if (loading) return <Spinner label="Cargando notas…" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="m-0 text-[19px] font-extrabold">Notas SAP</h1>
          <p className="m-0 text-xs text-[var(--muted)]">
            {isStaff ? 'Seguimientos de todos los administradores' : 'Registra y da seguimiento a la implementación de tus notas'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> Registrar nota
          </button>
        )}
      </div>

      <Panel bodyClass="p-3">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input className="input pl-9" placeholder="Buscar número de nota…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Estado: todos</option>
            <option value="en_progreso">En progreso</option>
            <option value="completada">Completada</option>
            <option value="no_aplica">No aplica</option>
          </select>
          <select className="input w-auto" value={fPrio} onChange={(e) => setFPrio(e.target.value)}>
            <option value="">Prioridad: todas</option>
            <option>P1</option><option>P2</option><option>P3</option>
          </select>
          <select className="input w-auto max-w-[220px]" value={fGroup} onChange={(e) => setFGroup(e.target.value)}>
            <option value="">Grupo: todos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <span className="text-xs text-[var(--muted)] ml-auto">{filtered.length} de {vms.length} tracks</span>
        </div>
      </Panel>

      <Panel bodyClass="p-0">
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nota</th><th>Grupo de sistemas</th>{isStaff && <th>Administrador</th>}
                  <th>Prioridad</th><th>Inicio</th><th>Paso actual</th><th>Avance</th><th>Estado</th><th>Días sin avance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="rowlink" onClick={() => navigate(`/tracks/${v.id}`)}>
                    <td className="font-bold">{v.note_number}</td>
                    <td>{v.system_groups?.name}</td>
                    {isStaff && <td className="text-[var(--muted)]">{nameOf(v.admin_id)}</td>}
                    <td><PriorityChip p={v.priority} /></td>
                    <td className="text-[var(--muted)]">{fmtDate(v.start_date)}</td>
                    <td className="max-w-[230px] truncate text-[var(--muted)]">{v.currentTitle}</td>
                    <td><ProgressBar pct={v.progress.pct} /></td>
                    <td><StatusChip s={v.status} /></td>
                    <td>{v.status === 'en_progreso' ? <DelayChip days={v.days} showOk /> : <span className="text-[var(--muted)] text-xs">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<FileText size={32} />} title={vms.length ? 'Sin resultados con estos filtros' : 'Aún no hay notas registradas'}
            sub={vms.length ? 'Ajusta la búsqueda o los filtros.' : isAdmin ? 'Usa "Registrar nota" para iniciar el primer seguimiento.' : 'Los administradores aún no registran notas.'} />
        )}
      </Panel>

      {showNew && (
        <NewNoteModal
          groups={groups.filter((g) => g.admin_id === session?.user.id)}
          systems={systems}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}

function NewNoteModal({ groups, systems, onClose, onSaved }: {
  groups: SystemGroup[]
  systems: SystemRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const { session } = useAuth()
  const [noteNumber, setNoteNumber] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function save() {
    setError('')
    const num = noteNumber.trim()
    if (!num) { setError('Captura el número de la nota SAP.'); return }
    if (!selected.size) { setError('Selecciona al menos un grupo de sistemas al que aplica la nota.'); return }
    setBusy(true)
    try {
      const uid = session!.user.id
      for (const gid of selected) {
        const startIso = new Date(startDate + 'T08:00:00').toISOString()
        const { error: tErr } = await supabase.from('note_tracks').insert({
          admin_id: uid,
          group_id: gid,
          note_number: num,
          priority,
          start_date: startDate,
          observations: obs.trim() || null,
          last_progress_at: startIso,
        })
        if (tErr) throw tErr
        // Los pasos se generan desde el catálogo único en el servidor, según los
        // ambientes vigentes del grupo. Misma función que re-sincroniza al cambiar sistemas.
        const { error: rErr } = await supabase.rpc('reconcile_group_tracks', { p_group_id: gid })
        if (rErr) throw rErr
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Registrar nota SAP" onClose={onClose} width={620}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="lbl">Número de nota SAP *</label>
            <input className="input" placeholder="Ej. 0003465548" value={noteNumber}
              onChange={(e) => setNoteNumber(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="lbl">Prioridad *</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="P1">P1 — Crítica</option>
              <option value="P2">P2 — Alta</option>
              <option value="P3">P3 — Media</option>
            </select>
          </div>
        </div>

        <div>
          <label className="lbl">Fecha de inicio del seguimiento *</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <label className="lbl">Grupos de sistemas a los que aplica * <span className="font-normal normal-case">(se creará un track independiente por grupo)</span></label>
          {groups.length ? (
            <div className="flex flex-wrap gap-2 mt-1">
              {groups.map((g) => {
                const on = selected.has(g.id)
                const sids = systems.filter((s) => s.group_id === g.id).map((s) => s.sid).join(', ')
                return (
                  <button key={g.id} onClick={() => toggle(g.id)} title={sids}
                    className="px-3.5 py-2 rounded-lg text-[12.5px] font-bold cursor-pointer transition-all flex items-center gap-2"
                    style={{
                      background: on ? 'rgba(77,141,255,.16)' : '#0a142b',
                      border: `1px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                      color: on ? '#bcd6ff' : 'var(--muted)',
                    }}>
                    <Layers size={13} /> {g.name}
                    <span className="font-normal text-[10.5px] opacity-75">{sids}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <ErrorBox msg="No tienes grupos de sistemas registrados. Ve a la pestaña Sistemas y registra primero tu landscape." />
          )}
        </div>

        <div>
          <label className="lbl">Observaciones adicionales (opcional)</label>
          <textarea className="input resize-y min-h-[70px]" placeholder="Contexto, referencia de Focus Run, comentarios…"
            value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>

        {error && <ErrorBox msg={error} />}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !groups.length}>
            {busy ? 'Creando tracks…' : `Crear ${selected.size || ''} track${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
