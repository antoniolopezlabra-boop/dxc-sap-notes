import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './ctx/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Notas from './pages/Notas'
import TrackDetail from './pages/TrackDetail'
import Sistemas from './pages/Sistemas'
import Usuarios from './pages/Usuarios'
import Perfil from './pages/Perfil'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/notas" element={<Notas />} />
            <Route path="/tracks/:id" element={<TrackDetail />} />
            <Route path="/sistemas" element={<Sistemas />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
