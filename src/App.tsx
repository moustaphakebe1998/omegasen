import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import Login from './pages/Login'
import AdminPage from './pages/admin'
import ManagerPage from './pages/manager'
import KitchenPage from './pages/kitchen'
import KioskPage from './pages/kiosk'
import { ToastProvider } from './components/shared/Toast'

function Guard({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const user = useAuth(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Home() {
  const user = useAuth(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'CEO') return <Navigate to="/admin" replace />
  if (user.role === 'MANAGER') return <Navigate to="/manager" replace />
  if (user.role === 'KITCHEN') return <Navigate to="/kitchen" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider />
      <Routes>
        <Route path="/login"   element={<Login />} />
        <Route path="/admin"   element={<Guard roles={['CEO']}><AdminPage /></Guard>} />
        <Route path="/manager" element={<Guard roles={['CEO','MANAGER']}><ManagerPage /></Guard>} />
        <Route path="/kitchen" element={<Guard roles={['CEO','MANAGER','KITCHEN']}><KitchenPage /></Guard>} />
        <Route path="/kiosk"   element={<KioskPage />} />
        <Route path="/"        element={<Home />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
