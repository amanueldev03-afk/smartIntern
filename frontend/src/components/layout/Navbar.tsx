import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Sparkles,
  Sun,
  Moon,
  Type,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logoutUser } from '@/features/auth/authSlice'
import { useTheme } from '@/contexts/ThemeContext'
import { useLargeText } from '@/contexts/AccessibilityContext'
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher'
import { NotificationBell } from '@/components/common/NotificationBell'
import { Button } from '@/components/ui/button'

interface NavbarProps {
  className?: string
}

export default function Navbar({ className = '' }: NavbarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { isAuthenticated, user, isLoading } = useAppSelector((state) => state.auth)
  const { theme, toggleTheme } = useTheme()
  const { isLargeText, toggleLargeText } = useLargeText()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refresh_token')
    await dispatch(logoutUser(refreshToken))
    navigate('/login')
  }

  const navLinks = isAuthenticated
    ? [
        { path: '/dashboard', label: t('nav.dashboard', 'Dashboard') },
        { path: '/recommendations', label: t('nav.aiMatches', 'AI Matches') },
        { path: '/internships', label: t('nav.browseInternships', 'Browse Internships') },
        { path: '/saved', label: t('nav.saved', 'Saved') },
        { path: '/profile', label: t('nav.profile', 'Profile') },
      ]
    : [
        { path: '/', label: 'Home' },
        { path: '/login', label: t('nav.signIn', 'Sign In') },
        { path: '/register', label: 'Register' },
      ]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const fullName =
    user?.first_name || user?.last_name
      ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      : user?.username || user?.email?.split('@')[0] || 'User'

  const userInitial = fullName.charAt(0).toUpperCase()

  return (
    <header
      className={`sticky top-0 z-40 bg-white/90 dark:bg-[#0c0c0e]/90 backdrop-blur-xl border-b border-neutral-200/80 dark:border-neutral-800/80 transition-colors duration-200 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20">
          {/* Left: Brand + Desktop Links */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link
              to={isAuthenticated ? '/dashboard' : '/'}
              className="flex items-center gap-2.5 group transition-transform duration-200 hover:scale-105"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-secondary-500 text-white flex items-center justify-center font-black text-base shadow-glow group-hover:rotate-6 transition-all duration-300">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 bg-clip-text text-transparent">
                  InternMatch
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 -mt-1">
                  UIL Career Engine
                </span>
              </div>
            </Link>

            {isAuthenticated && (
              <nav className="hidden xl:flex items-center gap-1.5" aria-label="Main Navigation">
                {navLinks.map((link) => {
                  const active = isActive(link.path)
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                        active
                          ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-glow'
                          : 'text-neutral-600 hover:text-primary-600 hover:bg-primary-50/70 dark:text-neutral-300 dark:hover:text-primary-400 dark:hover:bg-neutral-800/80'
                      }`}
                    >
                      {link.label}
                    </Link>
                  )
                })}
              </nav>
            )}
          </div>

          {/* Right: Accessibility Toggle + Language Switcher + Theme Toggle + User Info / Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Accessibility: Large Text Toggle */}
            <button
              type="button"
              onClick={toggleLargeText}
              aria-label={
                isLargeText
                  ? t('accessibility.normalText', 'Switch to default text size')
                  : t('accessibility.largeText', 'Switch to large text size')
              }
              aria-pressed={isLargeText}
              title={
                isLargeText
                  ? `${t('accessibility.largeText', 'Large Text')}: ON`
                  : `${t('accessibility.largeText', 'Large Text')}: OFF`
              }
              className={`p-2 sm:p-2.5 rounded-2xl text-xs font-bold border transition-all duration-200 flex items-center gap-1.5 ${
                isLargeText
                  ? 'bg-primary-100 dark:bg-primary-950/60 border-primary-400 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'bg-white/80 dark:bg-neutral-800/80 border-neutral-200/80 dark:border-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              <Type className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <span className="hidden sm:inline text-[11px] font-semibold">
                {isLargeText ? 'A+' : 'A'}
              </span>
            </button>

            {/* Language Switcher */}
            <LanguageSwitcher variant="dropdown" />

            {/* Dark/Light Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 sm:p-2.5 rounded-2xl text-neutral-600 hover:bg-primary-50 hover:text-primary-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-primary-400 border border-neutral-200/70 dark:border-neutral-800 transition-all duration-200"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-indigo-500" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>

            {/* User Profile info or Sign In */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <NotificationBell />
                <Link
                  to="/profile"
                  className="hidden sm:flex items-center gap-2 p-1.5 pr-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 hover:bg-primary-50 dark:hover:bg-neutral-700/80 border border-neutral-200/70 dark:border-neutral-700/60 transition-all duration-200"
                >
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    {userInitial}
                  </div>
                  <span className="text-xs font-bold text-neutral-900 dark:text-white max-w-[100px] truncate">
                    {fullName}
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="p-2 sm:px-3 sm:py-2 text-xs font-bold rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:border-error-300 hover:text-error-600 dark:hover:border-error-700 dark:hover:text-error-400 transition-all duration-200 shadow-sm disabled:opacity-50"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4 sm:hidden" />
                  <span className="hidden sm:inline">
                    {isLoading ? '...' : t('nav.signOut', 'Sign out')}
                  </span>
                </button>
              </div>
            ) : (
              <Link to="/login">
                <Button size="sm" className="rounded-xl text-xs font-bold shadow-glow">
                  {t('nav.signIn', 'Sign In')}
                </Button>
              </Link>
            )}

            {/* Mobile Menu Button */}
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {isAuthenticated && mobileMenuOpen && (
          <nav className="xl:hidden py-3 border-t border-neutral-200/80 dark:border-neutral-800/80 flex flex-wrap gap-2 animate-fade-in">
            {navLinks.map((link) => {
              const active = isActive(link.path)
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-glow'
                      : 'text-neutral-600 bg-neutral-100/90 dark:text-neutral-300 dark:bg-neutral-800/90 hover:bg-primary-50 dark:hover:bg-neutral-700'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </header>
  )
}
