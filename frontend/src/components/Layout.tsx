import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { api } from '../api/client'

interface SidebarAccount {
  id: string
  name: string
  legal_business_name: string
}

interface LayoutProps {
  children: React.ReactNode
  accounts?: SidebarAccount[]
  onSync?: () => void
  syncing?: boolean
}

const navItem = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
const navActive = 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
const navInactive = 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'

export default function Layout({ children, accounts: propAccounts = [], onSync, syncing }: LayoutProps) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarAccounts, setSidebarAccounts] = useState<SidebarAccount[]>(propAccounts)
  const [hovered, setHovered] = useState<string | null>(null)

  // Sync with parent whenever the account list changes (e.g. after a data sync)
  useEffect(() => {
    setSidebarAccounts(propAccounts)
  }, [propAccounts.map(a => a.id).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const moveAccount = async (id: string, dir: 'up' | 'down') => {
    const idx = sidebarAccounts.findIndex(a => a.id === id)
    if (idx === -1) return
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === sidebarAccounts.length - 1) return

    const next = [...sidebarAccounts]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setSidebarAccounts(next)

    try {
      await api.reorderAccounts(next.map((a, i) => ({ id: a.id, sort_order: i })))
    } catch {
      setSidebarAccounts(sidebarAccounts) // revert on failure
    }
  }

  const hideAccount = async (id: string) => {
    setSidebarAccounts(prev => prev.filter(a => a.id !== id))
    try {
      await api.excludeAccount(id)
    } catch {
      // restore on failure
      setSidebarAccounts(sidebarAccounts)
    }
  }

  const AccountList = () => (
    <div className="pt-3 pb-1">
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
        Accounts
      </p>
      {sidebarAccounts.map((a, idx) => (
        <div
          key={a.id}
          className="group relative"
          onMouseEnter={() => setHovered(a.id)}
          onMouseLeave={() => setHovered(null)}
        >
          <NavLink
            to={`/accounts/${a.id}`}
            className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive} pr-16`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
            <span className="truncate">{a.legal_business_name}</span>
          </NavLink>
          {/* Reorder + hide controls — visible on hover */}
          {hovered === a.id && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                onClick={e => { e.preventDefault(); moveAccount(a.id, 'up') }}
                disabled={idx === 0}
                title="Move up"
                className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/>
                </svg>
              </button>
              <button
                onClick={e => { e.preventDefault(); moveAccount(a.id, 'down') }}
                disabled={idx === sidebarAccounts.length - 1}
                title="Move down"
                className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              <button
                onClick={e => { e.preventDefault(); hideAccount(a.id) }}
                title="Hide account"
                className="p-0.5 rounded text-zinc-400 hover:text-red-500 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )

  const Nav = () => (
    <nav className="space-y-0.5">
      <NavLink to="/" end className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        onClick={() => setMobileMenuOpen(false)}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
        </svg>
        Cockpit
      </NavLink>

      {sidebarAccounts.length > 0 && <AccountList />}

      <NavLink to="/categorize" className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        onClick={() => setMobileMenuOpen(false)}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
        </svg>
        Categorize
      </NavLink>
    </nav>
  )

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-56 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Phoenix Finance</span>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          <Nav />
        </div>

        <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
          {onSync && (
            <button onClick={onSync} disabled={syncing}
              className={`${navItem} ${navInactive} w-full disabled:opacity-40`}>
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button onClick={toggle}
            className={`${navItem} ${navInactive} w-full`}>
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14A7 7 0 0012 5z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
              </svg>
            )}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button onClick={handleLogout}
            className={`${navItem} ${navInactive} w-full`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Sign out — {user}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3
          bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-20">
          <button onClick={() => setMobileMenuOpen(true)} className="p-1 text-zinc-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Phoenix Finance</span>
          <div className="flex items-center gap-2">
            {onSync && (
              <button onClick={onSync} disabled={syncing}
                className="p-1 text-zinc-500 disabled:opacity-40 transition-opacity">
                <svg className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
            )}
            <button onClick={toggle} className="p-1 text-zinc-500">
              {theme === 'dark'
                ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14A7 7 0 0012 5z"/></svg>
                : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
              }
            </button>
          </div>
        </header>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-30 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative w-64 bg-white dark:bg-zinc-900 flex flex-col h-full shadow-xl">
              <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-zinc-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="flex-1 p-3 overflow-y-auto"><Nav /></div>
              <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                <button onClick={toggle} className={`${navItem} ${navInactive} w-full`}>
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={handleLogout} className={`${navItem} ${navInactive} w-full`}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
