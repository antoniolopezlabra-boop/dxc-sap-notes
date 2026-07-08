import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ShieldCheck, Bell, LogOut, User } from 'lucide-react'
import { useAuth } from '../ctx/AuthContext'
import { supabase } from '../lib/supabase'
import { daysStuck, delayLevel } from '../lib/workflow'
import { Spinner } from './ui'

export default function Layout() {
  const { session, profile, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [delayed, setDelayed] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) {
      navigate('/login', { replace: true })
      return
    }
    if (profile) {
      if (profile.status === 'blocked') {
        signOut().then(() => navigate('/login?blocked=1', { replace: true }))
        return
      }
      if (profile.role === 'admin' && !profile.onboarded) {
        navigate('/onboarding', { replace: true })
      }
    }
  }, [session, profile, loading, navigate, signOut])

  useEffect(() => {
    if (!session || !profile) return
    supabase
      .from('note_tracks')
      .select('id, status, last_progress_at')
      .eq('status', 'en_progreso')
      .then(({ data }) => {
        const n = (data ?? []).filter((t) => delayLevel(daysStuck(t)) !== 'ok').length
        setDelayed(n)
      })
  }, [session, profile])

  if (loading || !session || !profile) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner label="Iniciando sesión…" />
      </div>
    )
  }

  const isAdmin = profile.role === 'admin'
  const isSuper = profile.role === 'superuser'
  const initials = (profile.full_name || profile.email)
    .split(/[\s.@]+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

  const roleLabel = { superuser: 'Súper usuario', supervisor: 'Supervisor', admin: 'Administrador' }[profile.role]

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)]"
        style={{ background: 'rgba(7,13,29,.82)', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-[1440px] mx-auto px-5 h-[58px] flex items-center gap-2">
          <div className="flex items-center gap-2.5 mr-6 select-none">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(145deg,#2f7bff,#153e8f)', boxShadow: '0 4px 14px rgba(47,111,237,.4)' }}>
              <ShieldCheck size={20} color="#fff" />
            </div>
            <div className="leading-tight">
              <div className="font-extrabold text-[15px] tracking-wide">SAP NOTES</div>
              <div className="text-[9.5px] text-[var(--muted)] font-semibold tracking-[.14em] uppercase">Control Center · DXC</div>
            </div>
          </div>

          <nav className="flex items-center flex-1">
            <NavLink to="/" end className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
            <NavLink to="/notas" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Notas</NavLink>
            {isAdmin && (
              <NavLink to="/sistemas" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Sistemas</NavLink>
            )}
            {isSuper && (
              <NavLink to="/usuarios" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Usuarios</NavLink>
            )}
          </nav>

          <button title={`${delayed} tracks con demora`} onClick={() => navigate('/')}
            className="relative p-2 rounded-lg hover:bg-[#12234a] cursor-pointer text-[var(--muted)] hover:text-white transition-colors">
            <Bell size={17} />
            {delayed > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: '#ef4444', color: '#fff' }}>
                {delayed}
              </span>
            )}
          </button>

          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-[#12234a] cursor-pointer transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold"
                style={{ background: 'linear-gradient(145deg,#2f7bff,#153e8f)', color: '#fff' }}>
                {initials}
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className="text-[12.5px] font-semibold max-w-[160px] truncate">{profile.full_name || profile.email}</div>
                <div className="text-[10.5px] text-[var(--muted)]">{roleLabel}</div>
              </div>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-[110%] z-50 panel py-1.5 w-48">
                  <button onClick={() => { setMenuOpen(false); navigate('/perfil') }}
                    className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#12234a] cursor-pointer flex items-center gap-2.5">
                    <User size={14} /> Mi perfil
                  </button>
                  <button onClick={async () => { setMenuOpen(false); await signOut(); navigate('/login') }}
                    className="w-full text-left px-4 py-2 text-[13px] hover:bg-[#12234a] cursor-pointer flex items-center gap-2.5 text-[#fca5a5]">
                    <LogOut size={14} /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border)] py-3 text-center text-[11px] text-[var(--muted)]">
        SAP Notes Control Center · Seguimiento de implementación de Notas SAP · DXC Operaciones
      </footer>
    </div>
  )
}
