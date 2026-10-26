import * as React from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import { 
  LayoutDashboard, 
  Search, 
  Heart, 
  History, 
  User, 
  Settings,
  Bell,
  LogOut,
  Menu,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAppSelector } from "@/hooks/redux"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Discover", href: "/internships", icon: Search },
  { name: "Saved", href: "/saved", icon: Heart },
  { name: "History", href: "/history", icon: History },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function StudentLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const location = useLocation()
  const user = useAppSelector((state) => state.auth.user)

  const getProfilePhotoUrl = (user: any) => {
    if (user?.profile_photo_url) {
      return user.profile_photo_url
    }
    if (user?.profile_photo) {
      if (user.profile_photo.startsWith('http://') || user.profile_photo.startsWith('https://')) {
        return user.profile_photo
      }
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
      const baseUrl = apiBaseUrl.replace('/api', '')
      return `${baseUrl}/media/${user.profile_photo}`
    }
    return null
  }

  const fullName = user?.first_name || user?.last_name
    ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
    : user?.username || 'Student'

  return (
    <div className="flex h-screen bg-gradient-to-br from-neutral-50 to-primary-50/30 dark:from-dark-bg dark:to-neutral-900/30">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform card-gradient border-r border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-card transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-neutral-200 dark:border-dark-border px-6">
            <Link to="/dashboard" className="flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-glow group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold gradient-text dark:text-white">
                AI Internships
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-6">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 transform hover:scale-105 ${
                    isActive
                      ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-glow"
                      : "text-neutral-600 hover:bg-primary-50 hover:text-primary-700 dark:text-neutral-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-400"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-white' : ''}`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-neutral-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              {getProfilePhotoUrl(user) ? (
                <img
                  src={getProfilePhotoUrl(user)}
                  alt="Profile"
                  className="h-10 w-10 rounded-full object-cover border-2 border-white dark:border-neutral-700 shadow-glow"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white font-bold shadow-glow">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                  {fullName}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {user?.email}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-primary-600 hover:bg-primary-50 dark:text-neutral-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-400 rounded-xl transition-all duration-200">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top navbar */}
        <header className="flex h-16 items-center justify-between border-b border-neutral-200 dark:border-dark-border bg-white/80 dark:bg-dark-card/80 backdrop-blur-lg px-4 lg:px-6 shadow-sm animate-slide-up">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30 dark:hover:text-primary-400 rounded-xl transition-all duration-200"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold gradient-text dark:text-white">
              {navigation.find((item) => item.href === location.pathname)?.name ||
                "Dashboard"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative text-neutral-600 hover:bg-primary-50 hover:text-primary-600 dark:text-neutral-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-400 rounded-xl transition-all duration-200">
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-gradient-to-r from-error-500 to-error-600 text-white text-xs shadow-glow">
                3
              </Badge>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
