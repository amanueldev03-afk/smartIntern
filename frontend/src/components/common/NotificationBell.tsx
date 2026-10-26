import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  MessageSquare,
  ShieldCheck,
  FileText,
  Truck,
  GraduationCap,
  Sparkles,
  X,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'

export interface AppNotification {
  id: string
  title: string
  message: string
  notification_type: 'CHAT' | 'VERIFICATION' | 'CLEARANCE_LETTER' | 'LOGISTICS' | 'DEFENSE' | 'COHORT' | 'GENERAL'
  link?: string
  is_read: boolean
  created_at: string
  actor_name?: string
  actor_role?: string
}

interface NotificationBellProps {
  className?: string
  onNotificationClick?: (notification: AppNotification) => void
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  className = '',
  onNotificationClick,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all')
  const [loading, setLoading] = useState(false)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (isOpen) return
    try {
      const res = await api.get('/v1/notifications/unread-count/')
      if (typeof res.data?.unread_count === 'number') {
        setUnreadCount(res.data.unread_count)
      }
    } catch {
      // silent fallback
    }
  }, [isOpen])

  // Fetch full notifications list
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/v1/notifications/')
      const items = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : [])
      setNotifications(items)
      const trueUnread = items.filter((n: AppNotification) => !n.is_read).length
      setUnreadCount(trueUnread)
    } catch {
      // silent fallback
    } finally {
      setLoading(false)
    }
  }, [isOpen])

  // Initial and periodic polling for unread count
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 10000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // When dropdown opens, fetch notification list
  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen, fetchNotifications])

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Mark single notification as read
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      await api.post(`/v1/notifications/${id}/mark-read/`)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      try {
        await api.post(`/v1/notifications/${id}/read/`)
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch {
        // silent
      }
    }
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    setIsMarkingAll(true)
    try {
      await api.post('/v1/notifications/mark-all-read/')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // silent
    } finally {
      setIsMarkingAll(false)
    }
  }

  // Handle click on notification row - marks as read, removes number badge, and redirects to direct message
  const handleItemClick = async (notification: AppNotification) => {
    if (!notification.is_read) {
      // Optimistically decrement count and mark as read immediately
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
      handleMarkAsRead(notification.id)
    }
    // Dispatch universal custom event so active dashboard immediately opens the relevant modal
    window.dispatchEvent(
      new CustomEvent('smartintern:notification-action', {
        detail: notification,
      })
    )
    if (onNotificationClick) {
      onNotificationClick(notification)
    }
    setIsOpen(false)

    const currentPath = window.location.pathname
    const isDean = currentPath.startsWith('/dean')

    if (notification.notification_type === 'CHAT') {
      if (isDean) {
        if (notification.link && notification.link.includes('student=')) {
          navigate(notification.link)
        } else {
          navigate('/dean/dashboard?tab=students&chat=true')
        }
      } else {
        navigate('/student/dashboard?chat=true')
      }
      return
    }

    if (notification.link) {
      if (notification.link.startsWith('/')) {
        navigate(notification.link)
      } else {
        window.location.href = notification.link
      }
    } else {
      // Fallback default routing by role and notification type
      if (
        notification.notification_type === 'CLEARANCE_LETTER' ||
        notification.notification_type === 'VERIFICATION'
      ) {
        navigate(isDean ? '/dean/dashboard?tab=students' : '/student/dashboard?tab=track1&letter=internship')
      } else if (notification.notification_type === 'LOGISTICS') {
        navigate(isDean ? '/dean/dashboard?tab=students' : '/student/dashboard?tab=logistics')
      } else if (notification.notification_type === 'DEFENSE') {
        navigate(isDean ? '/dean/dashboard?tab=defense' : '/student/dashboard?tab=channel')
      }
    }
  }

  // Notification Icon Helper
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'CHAT':
        return <MessageSquare className="w-4 h-4 text-emerald-500" />
      case 'VERIFICATION':
        return <ShieldCheck className="w-4 h-4 text-amber-500" />
      case 'CLEARANCE_LETTER':
        return <FileText className="w-4 h-4 text-blue-500" />
      case 'LOGISTICS':
        return <Truck className="w-4 h-4 text-indigo-500" />
      case 'DEFENSE':
        return <GraduationCap className="w-4 h-4 text-purple-500" />
      default:
        return <Sparkles className="w-4 h-4 text-primary-500" />
    }
  }

  // Format relative time helper
  const formatTimeAgo = (dateStr: string) => {
    try {
      const now = new Date()
      const d = new Date(dateStr)
      const diffSecs = Math.floor((now.getTime() - d.getTime()) / 1000)
      if (diffSecs < 60) return 'Just now'
      const diffMins = Math.floor(diffSecs / 60)
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      const diffDays = Math.floor(diffHours / 24)
      if (diffDays < 7) return `${diffDays}d ago`
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return 'Recently'
    }
  }

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Interactive Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        className="relative p-2.5 rounded-xl bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700/60 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/40"
      >
        <Bell className="w-5 h-5 transition-transform duration-200 active:rotate-12" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 text-[11px] font-extrabold text-white bg-rose-500 rounded-full ring-2 ring-white dark:ring-neutral-900 shadow-md animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-[#14151a] rounded-2xl shadow-2xl border border-neutral-200/90 dark:border-neutral-800/90 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3.5 bg-neutral-50/80 dark:bg-neutral-900/80 border-b border-neutral-200/70 dark:border-neutral-800/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-500" />
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={isMarkingAll}
                  title="Mark all as read"
                  className="p-1.5 text-xs text-neutral-500 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium hidden sm:inline">Mark all</span>
                </button>
              )}
              <button
                type="button"
                onClick={fetchNotifications}
                title="Refresh"
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tab Filter: All vs Unread */}
          <div className="flex items-center px-3.5 py-2 bg-neutral-50/90 dark:bg-neutral-900/60 border-b border-neutral-200/60 dark:border-neutral-800/60 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterTab === 'all'
                  ? 'bg-white dark:bg-neutral-800 text-primary-600 dark:text-primary-400 shadow-sm border border-neutral-200/80 dark:border-neutral-700/80'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('unread')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterTab === 'unread'
                  ? 'bg-white dark:bg-neutral-800 text-rose-600 dark:text-rose-400 shadow-sm border border-neutral-200/80 dark:border-neutral-700/80'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-xs">
                <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-primary-500" />
                Loading alerts...
              </div>
            ) : (filterTab === 'unread' ? notifications.filter(n => !n.is_read) : notifications).length === 0 ? (
              <div className="py-12 px-6 text-center text-neutral-500 dark:text-neutral-400">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  {filterTab === 'unread' ? 'No unread alerts!' : 'All caught up!'}
                </p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                  {filterTab === 'unread'
                    ? 'All your institutional notifications have been reviewed.'
                    : 'No unseen notifications right now.'}
                </p>
              </div>
            ) : (
              (filterTab === 'unread' ? notifications.filter(n => !n.is_read) : notifications).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all relative ${
                    n.is_read
                      ? 'bg-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-700 dark:text-neutral-300'
                      : 'bg-primary-50/80 dark:bg-primary-950/40 border-l-4 border-primary-500 hover:bg-primary-100/70 dark:hover:bg-primary-900/40 text-neutral-900 dark:text-white font-medium'
                  }`}
                >
                  {/* Left Icon with unread badge */}
                  <div className="relative shrink-0">
                    <div className={`p-2 rounded-xl mt-0.5 shadow-sm ${
                      !n.is_read 
                        ? 'bg-primary-100 dark:bg-primary-900/60 text-primary-600 dark:text-primary-300 ring-1 ring-primary-500/20' 
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                    }`}>
                      {getNotificationIcon(n.notification_type)}
                    </div>
                    {!n.is_read && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white dark:ring-neutral-900 animate-pulse" />
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className={`text-xs truncate ${!n.is_read ? 'font-bold text-neutral-900 dark:text-white' : 'font-semibold text-neutral-700 dark:text-neutral-300'}`}>
                          {n.title}
                        </p>
                        {!n.is_read && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-rose-500 text-white shadow-xs">
                            NEW
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-400 shrink-0 font-medium">
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className={`text-[11px] line-clamp-2 mt-0.5 leading-relaxed ${
                      !n.is_read ? 'text-neutral-700 dark:text-neutral-200 font-medium' : 'text-neutral-500 dark:text-neutral-400'
                    }`}>
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-neutral-100 dark:border-neutral-800/60">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 dark:text-primary-400 group-hover:underline">
                        {n.notification_type === 'CHAT' && '💬 Open Chat →'}
                        {n.notification_type === 'CLEARANCE_LETTER' && '📄 View Clearance Letter →'}
                        {n.notification_type === 'VERIFICATION' && '✓ View Clearance Pass →'}
                        {n.notification_type === 'LOGISTICS' && '🚚 View Logistics Pass →'}
                        {n.notification_type === 'DEFENSE' && '🎓 View Defense →'}
                        {!['CHAT', 'CLEARANCE_LETTER', 'VERIFICATION', 'LOGISTICS', 'DEFENSE'].includes(n.notification_type) && 'Inspect Details →'}
                      </span>
                      <ExternalLink className="w-3 h-3 text-primary-500" />
                    </div>
                  </div>

                  {/* Unread indicator / Quick mark read */}
                  {!n.is_read && (
                    <div className="absolute right-3 top-3.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(n.id, e)}
                        title="Mark as read"
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2.5 bg-neutral-50/60 dark:bg-neutral-900/60 border-t border-neutral-200/60 dark:border-neutral-800/60 text-center">
              <span className="text-[10px] text-neutral-400">
                Institutional real-time notification alerts
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
