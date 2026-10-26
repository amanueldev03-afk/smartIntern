import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Search,
  Sparkles,
  Bookmark,
  Send,
  User,
  Shield,
  Briefcase,
  Users,
  Database,
  Brain,
  FileText,
  Clock,
  MessagesSquare,
  ShieldAlert,
  Building,
  CheckCircle2,
  Award,
  ShieldCheck,
  Calendar,
  Cpu,
  Utensils,
  CreditCard,
  KeyRound,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Type,
  UserCheck,
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logoutUser } from '@/features/auth/authSlice'
import { useTheme } from '@/contexts/ThemeContext'
import { useLargeText } from '@/contexts/AccessibilityContext'
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher'
import { getDashboardPathForRole, getRoleBadgeLabel } from '@/routes/routeUtils'

interface NavItem {
  label: string
  path: string
  icon: React.ElementType
  badge?: string
}

interface AppSidebarProps {
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export default function AppSidebar({
  isCollapsed: externalCollapsed,
  onToggleCollapse: externalToggle,
}: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user, role } = useAppSelector((state) => state.auth)
  const { theme, toggleTheme } = useTheme()
  const { isLargeText, toggleLargeText } = useLargeText()

  const [internalCollapsed, setInternalCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed
  const toggleCollapse = externalToggle || (() => {
    setInternalCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', String(next))
      return next
    })
  })

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await dispatch(logoutUser(localStorage.getItem('refresh_token')))
    navigate('/login')
  }

  const currentRole = (role || user?.role || 'student').toLowerCase()
  const roleBadge = getRoleBadgeLabel(currentRole)

  // Configure navigation based on user role
  const getNavItems = (): NavItem[] => {
    switch (currentRole) {
      case 'admin':
        return [
          { label: 'Admin Dashboard', path: '/admin/dashboard', icon: Shield },
          { label: 'Student Accounts', path: '/admin/students', icon: Users },
          { label: 'Internship Review', path: '/admin/internships/review', icon: Briefcase },
          { label: 'Data Source Health', path: '/admin/data-sources', icon: Database },
          { label: 'AI Monitoring', path: '/admin/ai-monitoring', icon: Brain },
        ]
      case 'advisor':
        return [
          { label: 'Supervised Squads', path: '/advisor/dashboard?tab=squads', icon: Users },
          { label: 'Documentation Gate', path: '/advisor/dashboard?tab=docgate', icon: FileText },
          { label: 'Weekly Logbooks', path: '/advisor/dashboard?tab=logbooks', icon: Clock },
          { label: 'Supervisory Alerts', path: '/advisor/dashboard?tab=alerts', icon: ShieldAlert },
          { label: 'Communication Hub', path: '/advisor/dashboard?tab=channel', icon: MessagesSquare },
        ]
      case 'company_hr':
      case 'employer':
        return [
          { label: 'Active Listings', path: '/company/dashboard?tab=listings', icon: Briefcase },
          { label: 'Applicant Pipeline', path: '/company/dashboard?tab=applicants', icon: Users },
        ]
      case 'company_mentor':
      case 'mentor':
        return [
          { label: 'Mentor Portal', path: '/mentor/dashboard', icon: Building },
          { label: 'Intern Progress', path: '/mentor/dashboard', icon: CheckCircle2 },
        ]
      case 'dept_dean':
      case 'dean':
        return [
          { label: 'Dashboard', path: '/dean/dashboard?tab=overview', icon: LayoutDashboard },
          { label: 'Student Clearance & QR', path: '/dean/dashboard?tab=students', icon: Award },
          { label: 'Defense & Composite Grading', path: '/dean/dashboard?tab=defense', icon: Calendar },
        ]
      case 'uil_officer':
      case 'uil':
        return [
          { label: 'In-House Cohorts', path: '/uil/dashboard?tab=cohorts', icon: Building },
          { label: 'Squad Balancer', path: '/uil/dashboard?tab=balancer', icon: Cpu },
        ]
      case 'student_union':
      case 'union':
        return [
          { label: 'Dining Portal', path: '/union/dashboard', icon: Utensils },
          { label: 'Meal Card Tracker', path: '/logistics/meal-cards', icon: CreditCard },
        ]
      case 'dorm_admin':
      case 'dorm':
        return [
          { label: 'Housing Overview', path: '/dorm/dashboard', icon: Building },
          { label: 'Room & Key Manager', path: '/logistics/dorm-rooms', icon: KeyRound },
        ]
      case 'student':
      default:
        return [
          { label: 'Operations Dashboard', path: '/dashboard?tab=overview', icon: LayoutDashboard },
          { label: 'Track 1 In-House Software House', path: '/dashboard?tab=track1', icon: Cpu },
          { label: 'Campus Clearance & Logistics', path: '/dashboard?tab=logistics', icon: ShieldCheck },
          { label: 'Squad & Advisor Channel', path: '/dashboard?tab=channel', icon: MessagesSquare },
          { label: 'Industry Opportunities', path: '/internships', icon: Search },
          { label: 'AI Skill Matching', path: '/recommendations', icon: Sparkles, badge: 'AI' },
          { label: 'Application Tracking', path: '/applications/history', icon: Send },
          { label: 'Saved Opportunities', path: '/saved', icon: Bookmark },
          { label: 'Personal & Education Dossier', path: '/profile?tab=personal', icon: UserCheck },
          { label: 'Professional Profile & CV', path: '/profile', icon: User },
        ]
    }
  }

  const navItems = getNavItems()

  const isItemActive = (itemPath: string) => {
    const [targetPath, targetQuery] = itemPath.split('?')
    if (location.pathname !== targetPath) {
      return false
    }

    const searchParams = new URLSearchParams(location.search)
    const currentTab = searchParams.get('tab')

    if (targetQuery) {
      const targetParams = new URLSearchParams(targetQuery)
      const targetTab = targetParams.get('tab')
      if (targetTab) {
        if (currentTab) {
          return currentTab === targetTab
        }
        // If no tab in URL, check if this targetTab is the default for this route
        const defaultTabs: Record<string, string> = {
          '/dashboard': 'overview',
          '/advisor/dashboard': 'squads',
          '/company/dashboard': 'listings',
          '/dean/dashboard': 'overview',
          '/uil/dashboard': 'cohorts',
        }
        return defaultTabs[targetPath] === targetTab
      }
      const pairs = targetQuery.split('&')
      for (const pair of pairs) {
        const [k, v] = pair.split('=')
        if (searchParams.get(k) !== decodeURIComponent(v || '')) {
          return false
        }
      }
      return true
    }

    return !currentTab
  }

  const userDisplayName =
    user?.first_name || user?.last_name
      ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
      : user?.email?.split('@')[0] || 'User'

  const userInitial = userDisplayName.charAt(0).toUpperCase()

  const sidebarContent = (
    <div className="flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className={`p-4 flex items-center ${isCollapsed ? 'flex-col gap-2.5 justify-center' : 'justify-between'} border-b border-neutral-200/80 dark:border-neutral-800/80`}>
        <Link
          to={getDashboardPathForRole(currentRole)}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} group overflow-hidden`}
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 via-primary-500 to-secondary-500 text-white flex items-center justify-center font-black text-base shadow-glow group-hover:rotate-6 transition-all duration-300 flex-shrink-0">
            SI
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 animate-fade-in">
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 bg-clip-text text-transparent truncate">
                SmartIntern-ET
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 truncate">
                {roleBadge}
              </span>
            </div>
          )}
        </Link>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex w-7 h-7 rounded-xl items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-all duration-200"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Role Badge Indicator */}
      {!isCollapsed && (
        <div className="px-4 py-2.5 bg-neutral-100/60 dark:bg-neutral-900/60 border-b border-neutral-200/60 dark:border-neutral-800/60 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300 truncate">
            {roleBadge} Portal
          </span>
        </div>
      )}

      {/* Navigation List */}
      <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2 py-4 space-y-2' : 'px-3 py-4 space-y-1.5'} scrollbar-thin`}>
        {navItems.map((item) => {
          const active = isItemActive(item.path)
          const Icon = item.icon

          return (
            <Link
              key={item.label}
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              className={`group flex items-center ${
                isCollapsed ? 'justify-center w-12 h-12 mx-auto p-0 rounded-2xl' : 'gap-3 px-3 py-2.5 rounded-2xl'
              } text-xs font-bold transition-all duration-200 relative ${
                active
                  ? 'bg-gradient-to-r from-primary-600/10 via-primary-500/10 to-transparent text-primary-600 dark:text-primary-400 shadow-sm border border-primary-500/20'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60'
              }`}
            >
              {active && (
                <div className={`absolute ${isCollapsed ? 'left-0.5 top-2.5 bottom-2.5 w-1' : 'left-0 top-2 bottom-2 w-1.5'} rounded-r-full bg-primary-600 dark:bg-primary-400 shadow-glow`} />
              )}
              <Icon
                className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  active ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200'
                }`}
              />
              {!isCollapsed && (
                <span className="truncate flex-1">{item.label}</span>
              )}
              {!isCollapsed && item.badge && (
                <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded-md bg-primary-500 text-white shadow-xs">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section: Controls & Profile */}
      <div className={`p-3 border-t border-neutral-200/80 dark:border-neutral-800/80 space-y-3 bg-neutral-50/50 dark:bg-[#09090b]/50 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
        {/* Utilities: Theme, Large Text & Language */}
        <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between'}`}>
          <div className={`flex items-center ${isCollapsed ? 'flex-col gap-1.5' : 'gap-1.5'}`}>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-xl text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 border border-neutral-200/60 dark:border-neutral-800/60 shadow-xs"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
            </button>

            <button
              onClick={toggleLargeText}
              aria-label={isLargeText ? 'Switch to default text size' : 'Switch to large text size'}
              aria-pressed={isLargeText}
              className={`p-2 rounded-xl text-xs font-bold transition-all duration-200 border shadow-xs flex items-center justify-center ${
                isLargeText
                  ? 'bg-primary-100 dark:bg-primary-950/60 border-primary-400 text-primary-700 dark:text-primary-300'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-white dark:hover:bg-neutral-800 border-neutral-200/60 dark:border-neutral-800/60'
              }`}
              title={isLargeText ? 'Large Text: ON' : 'Large Text: OFF'}
            >
              <Type className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            </button>
          </div>

          {!isCollapsed ? (
            <LanguageSwitcher variant="toggle" />
          ) : (
            <LanguageSwitcher variant="dropdown" />
          )}
        </div>

        {/* User Profile Info Card */}
        <div
          className={`flex items-center gap-3 p-2 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs ${
            isCollapsed ? 'justify-center w-12 h-12 p-0' : 'w-full'
          }`}
          title={isCollapsed ? userDisplayName : undefined}
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
            {userInitial}
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                {userDisplayName}
              </div>
              <div className="text-[10px] text-neutral-400 truncate">
                {user?.email}
              </div>
            </div>
          )}

          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isCollapsed && (
          <button
            onClick={handleLogout}
            className="w-12 h-10 flex items-center justify-center text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all duration-200 mx-auto"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile Top Header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white/90 dark:bg-[#0c0c0e]/90 backdrop-blur-xl border-b border-neutral-200/80 dark:border-neutral-800/80 px-4 py-3 flex items-center justify-between shadow-xs">
        <Link to={getDashboardPathForRole(currentRole)} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary-600 via-primary-500 to-secondary-500 text-white flex items-center justify-center font-black text-xs shadow-glow">
            SI
          </div>
          <span className="font-extrabold text-sm tracking-tight gradient-text">
            SmartIntern-ET
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300">
            {roleBadge}
          </span>
        </Link>

        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-[#0c0c0e] shadow-2xl animate-slide-up flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Sticky Side Navbar */}
      <aside
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 z-30 transition-all duration-300 ease-in-out border-r border-neutral-200/80 dark:border-neutral-800/80 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-2xl shadow-soft ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="w-full h-full">{sidebarContent}</div>
      </aside>
    </>
  )
}
