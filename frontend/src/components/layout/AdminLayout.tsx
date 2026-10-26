import * as React from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Briefcase, 
  Database, 
  Brain,
  BarChart3,
  LogOut,
  Menu,
  Shield
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher"

export function AdminLayout() {
  const { t } = useTranslation()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const location = useLocation()

  const navigation = [
    { name: t("nav.dashboard", "Dashboard"), href: "/admin/dashboard", icon: LayoutDashboard },
    { name: t("nav.students", "Student Accounts"), href: "/admin/students", icon: Users },
    { name: t("nav.users", "Users"), href: "/admin/users", icon: Users },
    { name: t("nav.companies", "Companies"), href: "/admin/companies", icon: Building2 },
    { name: t("nav.internships", "Internships"), href: "/admin/internships", icon: Briefcase },
    { name: t("nav.dataSources", "Data Sources"), href: "/admin/sources", icon: Database },
    { name: t("nav.aiMonitoring", "AI Monitor"), href: "/admin/ai-monitoring", icon: Brain },
    { name: t("nav.analytics", "Analytics"), href: "/admin/analytics", icon: BarChart3 },
  ]

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-dark-bg dark:to-neutral-900/30">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 shadow-glow ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-slate-700 px-6">
            <Link to="/admin/dashboard" className="flex items-center gap-2 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 shadow-glow group-hover:scale-110 transition-transform duration-300">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
                Admin Portal
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 transform hover:scale-105 ${
                    isActive
                      ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-glow"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-glow">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">
                  Admin
                </p>
                <p className="text-xs text-slate-400 truncate">
                  admin@example.com
                </p>
              </div>
              <Button variant="ghost" size="icon" className="text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all duration-200">
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
              className="lg:hidden hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 rounded-xl transition-all duration-200"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold gradient-text dark:text-white">
              {navigation.find((item) => item.href === location.pathname)?.name ||
                "Admin Dashboard"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-glow">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <span className="hidden sm:block text-sm font-bold text-neutral-700 dark:text-neutral-200">
                Admin
              </span>
            </div>
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
