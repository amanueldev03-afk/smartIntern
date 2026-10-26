import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import { getDashboardPathForRole } from './routeUtils'

interface RoleRouteProps {
  children: React.ReactNode
  allowedRoles: string[]
}

export default function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { isAuthenticated, isInitialized, user, role } = useAppSelector((state) => state.auth)
  const location = useLocation()

  // Show loading state while auth is initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="text-sm text-gray-500">Checking authorization...</span>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const rawRole = role || user?.role || ''
  const currentRole = rawRole.toLowerCase()
  const normalizedAllowedRoles = allowedRoles.map((r) => r.toLowerCase())

  // Check explicit role match
  const isPermitted = normalizedAllowedRoles.includes(currentRole)

  // Check if user has required role
  if (!currentRole || !isPermitted) {
    const targetDashboard = getDashboardPathForRole(currentRole)
    if (location.pathname !== targetDashboard) {
      return <Navigate to={targetDashboard} replace />
    }
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
