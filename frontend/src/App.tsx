import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Cockpit from './pages/Cockpit'
import AccountDetail from './pages/AccountDetail'
import Categorize from './pages/Categorize'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import ProjectSettings from './pages/ProjectSettings'

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Cockpit /></Guard>} />
      <Route path="/accounts/:id" element={<Guard><AccountDetail /></Guard>} />
      <Route path="/categorize" element={<Guard><Categorize /></Guard>} />
      <Route path="/projects" element={<Guard><Projects /></Guard>} />
      <Route path="/projects/settings" element={<Guard><ProjectSettings /></Guard>} />
      <Route path="/projects/:id" element={<Guard><ProjectDetail /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
