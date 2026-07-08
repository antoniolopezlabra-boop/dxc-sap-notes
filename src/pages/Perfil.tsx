import { useState } from 'react'
import { KeyRound, Save, UserCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../ctx/AuthContext'
import { Panel, ErrorBox } from '../components/ui'

export default function Perfil() {
  const { profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [position, setPosition] = useState(profile?.position ?? '')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [msgData, setMsgData] = useState('')
  const [msgPw, setMsgPw] = useState('')
  const [errData, setErrData] = useState('')
  const [errPw, setErrPw] = useState('')
  const [busy, setBusy] = useState(false)

  const roleLabel = profile
    ? { superuser: 'Súper usuario', supervisor: 'Supervisor', admin: 'Administrador' }[profile.role]
    : ''

  async function saveData() {
    setErrData(''); setMsgData(''); setBusy(true)
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName.trim() || null, position: position.trim() || null })
      .eq('id', profile!.id)
    setBusy(false)
    if (error) { setErrData(error.message); return }
    await refreshProfile()
    setMsgData('Datos actualizados correctamente.')
  }

  async function changePassword() {
    setErrPw(''); setMsgPw('')
    if (pw1.length < 8) { setErrPw('La nueva contraseña debe tener al menos 8 caracteres.'); return }
    if (pw1 !== pw2) { setErrPw('Las contraseñas no coinciden.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) { setErrPw(error.message); return }
    setPw1(''); setPw2('')
    setMsgPw('Contraseña actualizada correctamente.')
  }

  return (
    <div className="max-w-[640px] mx-auto flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-[19px] font-extrabold">Mi perfil</h1>
        <p className="m-0 text-xs text-[var(--muted)]">{profile?.email} · {roleLabel}</p>
      </div>

      <Panel title="Datos personales" icon={<UserCircle2 size={15} />}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="lbl">Nombre completo</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="lbl">Puesto</label>
            <input className="input" value={position} onChange={(e) => setPosition(e.target.value)}
              placeholder="Ej. SAP BASIS Administrator" />
          </div>
          {errData && <ErrorBox msg={errData} />}
          {msgData && <div className="text-[12.5px] font-semibold" style={{ color: '#6ee7b7' }}>{msgData}</div>}
          <button className="btn btn-primary self-start" onClick={saveData} disabled={busy}>
            <Save size={14} /> Guardar datos
          </button>
        </div>
      </Panel>

      <Panel title="Cambiar contraseña" icon={<KeyRound size={15} />}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Nueva contraseña</label>
              <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Confirmar contraseña</label>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
          </div>
          {errPw && <ErrorBox msg={errPw} />}
          {msgPw && <div className="text-[12.5px] font-semibold" style={{ color: '#6ee7b7' }}>{msgPw}</div>}
          <button className="btn btn-primary self-start" onClick={changePassword} disabled={busy || !pw1}>
            <KeyRound size={14} /> Actualizar contraseña
          </button>
        </div>
      </Panel>
    </div>
  )
}
