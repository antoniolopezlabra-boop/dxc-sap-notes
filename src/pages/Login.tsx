import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck, Lock, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ErrorBox } from '../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(params.get('blocked') ? 'Tu cuenta está bloqueada. Contacta al súper usuario.' : '')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      const m = error.message.toLowerCase()
      if (m.includes('banned')) setError('Tu cuenta está bloqueada. Contacta al súper usuario.')
      else if (m.includes('invalid')) setError('Credenciales inválidas. Verifica tu correo y contraseña.')
      else setError(error.message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-7 select-none">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(145deg,#2f7bff,#153e8f)', boxShadow: '0 10px 34px rgba(47,111,237,.45)' }}>
            <ShieldCheck size={34} color="#fff" />
          </div>
          <h1 className="text-[22px] font-extrabold tracking-wide m-0">SAP NOTES CONTROL CENTER</h1>
          <p className="text-[12px] text-[var(--muted)] tracking-[.18em] uppercase font-semibold mt-1 m-0">
            Seguimiento de Notas SAP · DXC Operaciones
          </p>
        </div>

        <form onSubmit={submit} className="panel p-6 flex flex-col gap-4">
          <div>
            <label className="lbl">Correo electrónico</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input className="input pl-10" type="email" required autoFocus placeholder="usuario@dxc.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="lbl">Contraseña</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input className="input pl-10" type="password" required placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          {error && <ErrorBox msg={error} />}
          <button className="btn btn-primary w-full mt-1" disabled={busy}>
            {busy ? 'Verificando…' : 'Iniciar sesión'}
          </button>
          <p className="text-[11.5px] text-[var(--muted)] text-center m-0">
            ¿Sin acceso u olvidaste tu contraseña? Contacta al súper usuario del equipo.
          </p>
        </form>
      </div>
    </div>
  )
}
