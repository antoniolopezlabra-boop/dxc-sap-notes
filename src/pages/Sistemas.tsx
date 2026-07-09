import { useCallback, useEffect, useState } from 'react'
import { Plus, Server, Trash2, Pencil, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { SystemGroup, SystemRow, Env } from '../lib/types'
import { ENV_LABELS, ENV_ORDER } from '../lib/workflow'
import { Panel, Modal, Spinner, Empty, ErrorBox } from '../components/ui'

export default function Sistemas() {
  const { session, profile } = useAuth()
  const [groups, setGroups] = useState<SystemGroup[]>([])
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [trackCounts, setTrackCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [g, s, t] = await Promise.all([
      supabase.from('system_groups').select('*').order('name'),
      supabase.from('systems').select('*').order('sid'),
      supabase.from('note_tracks').select('id, group_id'),
    ])
    setGroups((g.data as SystemGroup[]) ?? [])
    setSystems((s.data as SystemRow[]) ?? [])
    const counts: Record<string, number> = {}
    for (const row of (t.data ?? []) as { group_id: string }[]) {
      counts[row.group_id] = (counts[row.group_id] ?? 0) + 1
    }
    setTrackCounts(counts)
    setLoading(false)
  }, [])

  useEffect(() => { if (profile) load() }, [profile, load])

  if (profile && profile.role !== 'admin') {
    return <div className="max-w-[560px] mx-auto mt-10"><ErrorBox msg="Esta sección es exclusiva de administradores." /></div>
  }
  if (loading) return <Spinner label="Cargando sistemas…" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="m-0 text-[19px] font-extrabold">Mis grupos de sistemas</h1>
          <p className="m-0 text-xs text-[var(--muted)]">
            Landscape a tu cargo. Los pasos del flujo de cada nota se generan según los ambientes del grupo.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={15} /> Nuevo grupo
        </button>
      </div>

      {error && <ErrorBox msg={error} />}

      {groups.length ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} systems={systems.filter((s) => s.group_id === g.id)}
              trackCount={trackCounts[g.id] ?? 0} onChanged={load} setError={setError} />
          ))}
        </div>
      ) : (
        <Panel bodyClass="p-0">
          <Empty icon={<Server size={32} />} title="Sin grupos de sistemas"
            sub="Registra tu primer grupo (Ej. S4-HANA con S4D, S4Q, S4R, S4Y, S4P) para poder dar seguimiento a notas." />
        </Panel>
      )}

      {showNew && (
        <NewGroupModal onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load() }}
          adminId={session!.user.id} />
      )}
    </div>
  )
}

function GroupCard({ group, systems, trackCount, onChanged, setError }: {
  group: SystemGroup
  systems: SystemRow[]
  trackCount: number
  onChanged: () => void
  setError: (m: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [adding, setAdding] = useState(false)
  const [newSid, setNewSid] = useState('')
  const [newEnv, setNewEnv] = useState<Env>('DEV')
  const [confirmDel, setConfirmDel] = useState(false)

  async function rename() {
    if (!name.trim()) return
    const { error } = await supabase.from('system_groups').update({ name: name.trim() }).eq('id', group.id)
    if (error) { setError(error.message); return }
    setEditing(false)
    onChanged()
  }

  async function addSystem() {
    if (!newSid.trim()) return
    const { error } = await supabase.from('systems')
      .insert({ group_id: group.id, sid: newSid.trim().toUpperCase(), environment: newEnv })
    if (error) { setError(error.message); return }
    // Re-sincroniza los pasos de los tracks del grupo con los ambientes vigentes.
    const { error: rErr } = await supabase.rpc('reconcile_group_tracks', { p_group_id: group.id })
    if (rErr) { setError(rErr.message); return }
    setNewSid(''); setAdding(false)
    onChanged()
  }

  async function removeSystem(id: string) {
    const { error } = await supabase.from('systems').delete().eq('id', id)
    if (error) { setError(error.message); return }
    const { error: rErr } = await supabase.rpc('reconcile_group_tracks', { p_group_id: group.id })
    if (rErr) { setError(rErr.message); return }
    onChanged()
  }

  async function removeGroup() {
    const { error } = await supabase.from('system_groups').delete().eq('id', group.id)
    if (error) { setError(error.message); return }
    onChanged()
  }

  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Server size={16} className="text-[var(--blue)] shrink-0" />
        {editing ? (
          <>
            <input className="input flex-1 py-1.5" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="text-[#34d399] cursor-pointer p-1" onClick={rename}><Check size={16} /></button>
            <button className="text-[var(--muted)] cursor-pointer p-1" onClick={() => { setEditing(false); setName(group.name) }}><X size={16} /></button>
          </>
        ) : (
          <>
            <span className="font-extrabold text-[15px] flex-1">{group.name}</span>
            <button className="text-[var(--muted)] hover:text-white cursor-pointer p-1" title="Renombrar" onClick={() => setEditing(true)}>
              <Pencil size={13} />
            </button>
            <button className="text-[var(--muted)] hover:text-[#fca5a5] cursor-pointer p-1" title="Eliminar grupo" onClick={() => setConfirmDel(true)}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {systems.map((s) => (
          <span key={s.id} className="chip group/sys"
            style={{ color: '#bcd6ff', background: 'rgba(77,141,255,.1)', borderColor: 'rgba(77,141,255,.35)' }}>
            <b>{s.sid}</b> · {ENV_LABELS[s.environment]}
            <button className="cursor-pointer opacity-50 hover:opacity-100 hover:text-[#fca5a5] ml-0.5"
              title="Quitar sistema" onClick={() => removeSystem(s.id)}>
              <X size={11} />
            </button>
          </span>
        ))}
        {!systems.length && <span className="text-xs text-[var(--muted)]">Sin sistemas registrados</span>}
      </div>

      {adding ? (
        <div className="flex gap-2 items-center">
          <input className="input w-[110px] uppercase py-1.5" placeholder="SID" value={newSid}
            onChange={(e) => setNewSid(e.target.value)} autoFocus />
          <select className="input flex-1 py-1.5" value={newEnv} onChange={(e) => setNewEnv(e.target.value as Env)}>
            {ENV_ORDER.map((env) => <option key={env} value={env}>{ENV_LABELS[env]} ({env})</option>)}
          </select>
          <button className="text-[#34d399] cursor-pointer p-1" onClick={addSystem}><Check size={16} /></button>
          <button className="text-[var(--muted)] cursor-pointer p-1" onClick={() => setAdding(false)}><X size={16} /></button>
        </div>
      ) : (
        <button className="btn btn-ghost self-start py-1.5 px-3 text-[12px]" onClick={() => setAdding(true)}>
          <Plus size={12} /> Agregar ambiente
        </button>
      )}

      <div className="text-[11px] text-[var(--muted)] border-t border-[var(--border)] pt-2.5">
        {trackCount} track{trackCount === 1 ? '' : 's'} de notas ligados a este grupo
      </div>

      {confirmDel && (
        <Modal title="Eliminar grupo de sistemas" onClose={() => setConfirmDel(false)} width={460}>
          <p className="mt-0 text-[13.5px] text-[var(--muted)]">
            Se eliminará el grupo <b className="text-[var(--text)]">{group.name}</b>, sus {systems.length} sistemas
            y <b style={{ color: '#fca5a5' }}>{trackCount} track{trackCount === 1 ? '' : 's'} de seguimiento</b> ligados a él.
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
            <button className="btn btn-danger" onClick={removeGroup}>Eliminar definitivamente</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NewGroupModal({ onClose, onSaved, adminId }: {
  onClose: () => void
  onSaved: () => void
  adminId: string
}) {
  const [name, setName] = useState('')
  const [rows, setRows] = useState<{ sid: string; environment: Env }[]>([{ sid: '', environment: 'DEV' }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setError('')
    const clean = rows.filter((r) => r.sid.trim())
    if (!name.trim()) { setError('Escribe el nombre del grupo.'); return }
    if (!clean.length) { setError('Agrega al menos un sistema con su SID.'); return }
    setBusy(true)
    try {
      const { data: grp, error: gErr } = await supabase.from('system_groups')
        .insert({ admin_id: adminId, name: name.trim() }).select().single()
      if (gErr) throw gErr
      const { error: sErr } = await supabase.from('systems').insert(
        clean.map((r) => ({ group_id: grp.id, sid: r.sid.trim().toUpperCase(), environment: r.environment })),
      )
      if (sErr) throw sErr
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Nuevo grupo de sistemas" onClose={onClose} width={560}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="lbl">Nombre del grupo *</label>
          <input className="input" placeholder="Ej. S4-HANA, CPROC, GRC…" value={name}
            onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="lbl">Sistemas del landscape *</label>
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className="input w-[140px] uppercase" placeholder="SID (Ej. S4D)" value={r.sid}
                  onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, sid: e.target.value } : x))} />
                <select className="input flex-1" value={r.environment}
                  onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, environment: e.target.value as Env } : x))}>
                  {ENV_ORDER.map((env) => <option key={env} value={env}>{ENV_LABELS[env]} ({env})</option>)}
                </select>
                {rows.length > 1 && (
                  <button className="text-[var(--muted)] hover:text-[#fca5a5] cursor-pointer p-1"
                    onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button className="btn btn-ghost self-start" onClick={() => setRows((rs) => [...rs, { sid: '', environment: 'DEV' }])}>
              <Plus size={13} /> Agregar ambiente
            </button>
          </div>
        </div>
        {error && <ErrorBox msg={error} />}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Crear grupo'}</button>
        </div>
      </div>
    </Modal>
  )
}
