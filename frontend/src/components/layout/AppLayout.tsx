import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import AppSidebar from './AppSidebar'

export default function AppLayout() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  return (
    <div className="min-h-screen bg-neutral-50/70 dark:bg-[#09090b] text-neutral-900 dark:text-neutral-100 flex flex-col lg:flex-row antialiased transition-colors duration-300">
      <AppSidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />

      <div
        className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'lg:pl-24' : 'lg:pl-[17.5rem]'
        }`}
      >
        <main className="min-h-screen p-2 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
