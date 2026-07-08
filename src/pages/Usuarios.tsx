import { useCallback, useEffect, useState } from 'react'
import {
  Plus, KeyRound, Lock, Unlock, Trash2, ArrowLeftRight, Users as UsersIcon, Copy, ShieldCheck, Eye,
} from 'lucide-react'
import { adminCall } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import type { AdminUser, Role } from '../lib/types'
import { fmtDateTime } from '../lib/workflow'
import { Panel, Modal, Spinner, Empty, ErrorBox, Chip } from '../components/ui'

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let p = ''
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return `Dxc.${p}`
}

const ROLE_META: Record<Role, { label: string; fg: string; bg: string; bd: string }> = {
  superuser: { label: 'Súper usuario', fg: '#fcd34d', bg: 'rgba(217,119,6,.14)', bd: 'rgba(245,158,11,.45)' },
  supervisor: { label: 'Supervisor', fg: '#93c5fd', bg: 'rgba(77,141,255,.12)', bd: 'rgba(77,141,255,.45)' },
  admin: { label: 'Administrador', fg: '#6ee7b7', bg: 'rgba(5,150,105,.12)', bd: 'rgba(16,185,129,.4)' },
}

export default function Usuarios() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [resetFor, setResetFor] = useState<AdminUser | null>(null)
  const [transferFor, setTransferFor] = useState<AdminUser | null>(null)
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const { users } = await adminCall<{ users: AdminUser[] }>({ action: 'list_users' })
      setUsers(users)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (profile?.role === 'superuser') load() }, [profile, load])

  if (profile && profile.role !== 'superuser') {
    return <div className="max-w-[560px] mx-auto mt-10"><ErrorBox msg="Esta consola es exclusiva del súper usuario." /></div>
  }
  if (loading) return <Spinner label="Cargando usuarios…" />

  async function act(body: Record<string, unknown>, okMsg?: string) {
    setError('')
    try {
      await adminCall(body)
      if (okMsg) console.log(okMsg)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="m-0 text-[19px] font-extrabold">Gestión de usuarios y permisos</h1>
          <p className="m-0 text-xs text-[var(--muted)]">
            Alta de administradores y supervisores, credenciales, bloqueos y traspaso de grupos de sistemas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={15} /> Nuevo usuario
        </button>
      </div>

      {error && <ErrorBox msg={error} />}

      <Panel bodyClass="p-0">
        {users.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Usuario</th><th>Rol</th><th>Estado</th><th>Grupos de sistemas</th>
                  <th>Último acceso</th><th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const rm = ROLE_META[u.role]
                  const isSelf = u.id === profile?.id
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="font-bold flex items-center gap-1.5">
                          {u.role === 'superuser' && <ShieldCheck size={13} style={{ color: '#fcd34d' }} />}
                          {u.full_name ?? '—'} {isSelf && <span className="text-[10.5px] text-[var(--muted)] font-medium">(tú)</span>}
                        </div>
                        <div className="text-[11.5px] text-[var(--muted)]">{u.email}</div>
                      </td>
                      <td><Chip fg={rm.fg} bg={rm.bg} bd={rm.bd}>{rm.label}</Chip></td>
                      <td>
                        {u.status === 'active'
                          ? <Chip fg="#6ee7b7" bg="rgba(5,150,105,.12)" bd="rgba(16,185,129,.4)">Activo</Chip>
                          : <Chip fg="#fca5a5" bg="rgba(239,68,68,.14)" bd="rgba(239,68,68,.5)">Bloqueado</Chip>}
                      </td>
                      <td>
                        {u.role === 'admin' ? (
                          <div className="flex flex-wrap gap-1 max-w-[260px]">
                            {u.groups.length
                              ? u.groups.map((g) => (
                                <span key={g.id} className="chip" style={{ color: '#bcd6ff', background: 'rgba(77,141,255,.1)', borderColor: 'rgba(77,141,255,.3)' }}>{g.name}</span>
                              ))
                              : <span className="text-xs text-[var(--muted)]">Sin grupos</span>}
                          </div>
                        ) : <span className="text-xs text-[var(--muted)]"><Eye size={11} className="inline mr-1" />Visibilidad global</span>}
                      </td>
                      <td className="text-[var(--muted)] text-xs">{u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : 'Nunca'}</td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <IconBtn title="Restablecer contraseña" onClick={() => setResetFor(u)}><KeyRound size={14} /></IconBtn>
                          {u.role === 'admin' && u.groups.length > 0 && (
                            <IconBtn title="Traspasar grupo de sistemas" onClick={() => setTransferFor(u)}><ArrowLeftRight size={14} /></IconBtn>
                          )}
                          {!isSelf && (u.status === 'active'
                            ? <IconBtn title="Bloquear" onClick={() => act({ action: 'block', user_id: u.id })}><Lock size={14} /></IconBtn>
                            : <IconBtn title="Desbloquear" onClick={() => act({ action: 'unblock', user_id: u.id })}><Unlock size={14} /></IconBtn>)}
                          {!isSelf && (
                            <IconBtn title="Eliminar" danger onClick={() => setDeleteFor(u)}><Trash2 size={14} /></IconBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={<UsersIcon size={32} />} title="Sin usuarios" />}
      </Panel>

      {showNew && <NewUserModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
      {resetFor && <ResetModal user={resetFor} onClose={() => setResetFor(null)} />}
      {transferFor && (
        <TransferModal user={transferFor}
          admins={users.filter((u) => u.role === 'admin' && u.status === 'active' && u.id !== transferFor.id)}
          onClose={() => setTransferFor(null)}
          onSaved={() => { setTransferFor(null); load() }} />
      )}
      {deleteFor && (
        <Modal title="Eliminar usuario" onClose={() => setDeleteFor(null)} width={470}>
          <p className="mt-0 text-[13.5px] text-[var(--muted)]">
            Se eliminará la cuenta de <b className="text-[var(--text)]">{deleteFor.full_name ?? deleteFor.email}</b> y
            <b style={{ color: '#fca5a5' }}> todos sus grupos, sistemas y seguimientos de notas</b>.
            Si quieres conservar su trabajo, primero traspasa sus grupos a otro administrador.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setDeleteFor(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={async () => {
              await act({ action: 'delete', user_id: deleteFor.id })
              setDeleteFor(null)
            }}>Eliminar definitivamente</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function IconBtn({ title, onClick, children, danger }: {
  title: string; onClick: () => void; children: React.ReactNode; danger?: boolean
}) {
  return (
    <button title={title} onClick={onClick}
      className={`p-2 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-[var(--border)] ${danger ? 'text-[var(--muted)] hover:text-[#fca5a5] hover:bg-[rgba(239,68,68,.08)]' : 'text-[var(--muted)] hover:text-white hover:bg-[#12234a]'}`}>
      {children}
    </button>
  )
}

function CredsBox({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false)
  const text = `Sistema: SAP Notes Control Center\nUsuario: ${email}\nContraseña inicial: ${password}`
  return (
    <div className="rounded-lg p-4" style={{ background: 'rgba(5,150,105,.08)', border: '1px solid rgba(16,185,129,.4)' }}>
      <div className="font-bold mb-2" style={{ color: '#6ee7b7' }}>✓ Usuario creado — comparte estas credenciales</div>
      <div className="font-mono text-[12.5px] whitespace-pre-wrap">{text}</div>
      <button className="btn btn-ghost mt-3" onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}>
        <Copy size={13} /> {copied ? '¡Copiado!' : 'Copiar credenciales'}
      </button>
    </div>
  )
}

function NewUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('admin')
  const [password, setPassword] = useState(genPassword())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)

  async function save() {
    setError('')
    if (!email.trim() || !password.trim()) { setError('Correo y contraseña inicial son requeridos.'); return }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setBusy(true)
    try {
      await adminCall({ action: 'create_user', email: email.trim().toLowerCase(), password, full_name: fullName.trim(), role })
      setCreated(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nuevo usuario" onClose={created ? onSaved : onClose} width={520}>
      {created ? (
        <div className="flex flex-col gap-4">
          <CredsBox email={email.trim().toLowerCase()} password={password} />
          <p className="m-0 text-xs text-[var(--muted)]">
            {role === 'admin'
              ? 'En su primer ingreso, el administrador completará sus datos y registrará sus grupos de sistemas.'
              : 'El supervisor tendrá visibilidad de todo el equipo sin permisos de gestión.'}
            {' '}Podrá cambiar su contraseña desde “Mi perfil”.
          </p>
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={onSaved}>Listo</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="lbl">Correo electrónico *</label>
            <input className="input" type="email" placeholder="usuario@dxc.com" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="lbl">Nombre completo (opcional)</label>
            <input className="input" placeholder="Ej. Juan Pérez García" value={fullName}
              onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Rol *</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="admin">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="superuser">Súper usuario</option>
              </select>
            </div>
            <div>
              <label className="lbl">Contraseña inicial *</label>
              <div className="flex gap-2">
                <input className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="btn btn-ghost px-3" title="Generar" onClick={() => setPassword(genPassword())}>
                  <KeyRound size={14} />
                </button>
              </div>
            </div>
          </div>
          <p className="m-0 text-[11.5px] text-[var(--muted)]">
            Administrador: da seguimiento a sus propios sistemas y notas. Supervisor: ve el panorama de todo el
            equipo, sin gestionar usuarios. Súper usuario: control total.
          </p>
          {error && <ErrorBox msg={error} />}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ResetModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState(genPassword())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function save() {
    setError('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setBusy(true)
    try {
      await adminCall({ action: 'reset_password', user_id: user.id, password })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Restablecer contraseña · ${user.email}`} onClose={onClose} width={480}>
      {done ? (
        <div className="flex flex-col gap-4">
          <CredsBox email={user.email} password={password} />
          <div className="flex justify-end"><button className="btn btn-primary" onClick={onClose}>Listo</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="lbl">Nueva contraseña *</label>
            <div className="flex gap-2">
              <input className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn btn-ghost px-3" title="Generar" onClick={() => setPassword(genPassword())}>
                <KeyRound size={14} />
              </button>
            </div>
          </div>
          {error && <ErrorBox msg={error} />}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Restablecer'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function TransferModal({ user, admins, onClose, onSaved }: {
  user: AdminUser
  admins: AdminUser[]
  onClose: () => void
  onSaved: () => void
}) {
  const [groupId, setGroupId] = useState(user.groups[0]?.id ?? '')
  const [toId, setToId] = useState(admins[0]?.id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setError('')
    if (!groupId || !toId) { setError('Selecciona el grupo y el administrador destino.'); return }
    setBusy(true)
    try {
      await adminCall({ action: 'transfer_group', group_id: groupId, to_admin_id: toId })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={`Traspasar grupo de ${user.full_name ?? user.email}`} onClose={onClose} width={500}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[12.5px] text-[var(--muted)]">
          El grupo, sus sistemas y todos los seguimientos de notas ligados a él pasarán al administrador destino.
        </p>
        <div>
          <label className="lbl">Grupo de sistemas a traspasar *</label>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {user.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Administrador destino *</label>
          <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
            {admins.length
              ? admins.map((a) => <option key={a.id} value={a.id}>{a.full_name ?? a.email}</option>)
              : <option value="">No hay otros administradores activos</option>}
          </select>
        </div>
        {error && <ErrorBox msg={error} />}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !admins.length}>
            {busy ? 'Traspasando…' : 'Traspasar grupo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
