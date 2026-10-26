import { useState, useEffect, useRef } from 'react'
import {
  Send,
  MessagesSquare,
  Loader2,
  RefreshCw,
  School,
  AlertCircle,
  CheckCheck,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/hooks/redux'

export interface TeamMessage {
  id: string
  team: string
  sender: string
  sender_name: string
  sender_role: string
  sender_email: string
  message: string
  message_type: 'GENERAL' | 'SRS_FEEDBACK' | 'ADVISORY_NOTICE' | 'SPRINT_UPDATE'
  created_at: string
}

interface TeamCommunicationHubProps {
  teamId?: string
  teamName?: string
  projectTitle?: string
  advisorName?: string
  className?: string
}

export default function TeamCommunicationHub({
  teamId: initialTeamId,
  teamName: initialTeamName,
  projectTitle: initialProjectTitle,
  advisorName: initialAdvisorName,
  className = '',
}: TeamCommunicationHubProps) {
  const currentUser = useAppSelector((state) => state.auth.user)
  const currentRole = (useAppSelector((state) => state.auth.role) || currentUser?.role || 'student').toLowerCase()

  const [teamId, setTeamId] = useState<string | undefined>(initialTeamId)
  const [teamName, setTeamName] = useState<string | undefined>(initialTeamName)
  const [projectTitle, setProjectTitle] = useState<string | undefined>(initialProjectTitle)
  const [advisorName, setAdvisorName] = useState<string | undefined>(initialAdvisorName)

  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messageType, setMessageType] = useState<'GENERAL' | 'SRS_FEEDBACK' | 'ADVISORY_NOTICE' | 'SPRINT_UPDATE'>('GENERAL')
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialTeamId) {
      setTeamId(initialTeamId)
    }
    if (initialTeamName) setTeamName(initialTeamName)
    if (initialProjectTitle) setProjectTitle(initialProjectTitle)
    if (initialAdvisorName) setAdvisorName(initialAdvisorName)
  }, [initialTeamId, initialTeamName, initialProjectTitle, initialAdvisorName])

  useEffect(() => {
    fetchChannel()
  }, [teamId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchChannel = async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (teamId) {
        const res = await api.get(`/v1/projects/teams/${teamId}/messages/`)
        const data = res.data
        setMessages(Array.isArray(data) ? data : data.results || [])
      } else {
        const res = await api.get('/v1/projects/my-channel/')
        const data = res.data
        if (data.team) {
          setTeamId(data.team.id)
          setTeamName(data.team.team_name)
          setProjectTitle(data.team.project_title)
          setAdvisorName(data.team.advisor_name)
        }
        setMessages(Array.isArray(data.messages) ? data.messages : [])
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load team messages')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = messageText.trim()
    if (!content || !teamId || isSending) return

    setIsSending(true)
    try {
      const res = await api.post(`/v1/projects/teams/${teamId}/messages/`, {
        message: content,
        message_type: messageType,
      })

      setMessages((prev) => [...prev, res.data])
      setMessageText('')
      // Reset type to general after special note
      if (messageType !== 'GENERAL') {
        setMessageType('GENERAL')
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const formatMessageTime = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getBadgeForType = (type: TeamMessage['message_type']) => {
    switch (type) {
      case 'SRS_FEEDBACK':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            SRS Feedback
          </span>
        )
      case 'ADVISORY_NOTICE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
            Advisory Notice
          </span>
        )
      case 'SPRINT_UPDATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            Sprint Update
          </span>
        )
      case 'GENERAL':
      default:
        return null
    }
  }

  return (
    <div
      className={`flex flex-col h-[600px] bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 shadow-soft overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-950/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center font-bold shadow-soft flex-shrink-0">
            <MessagesSquare className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-neutral-900 dark:text-white truncate">
                {teamName || 'Squad Collaboration Hub'}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300">
                Track 1
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {projectTitle ? `Project: ${projectTitle}` : 'Direct Student & Advisor Communication Channel'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {advisorName && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 shadow-2xs">
              <School className="w-3.5 h-3.5 text-primary-500" />
              Advisor: {advisorName}
            </div>
          )}
          <button
            onClick={fetchChannel}
            disabled={isLoading}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Refresh messages"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Message Feed Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin bg-neutral-50/20 dark:bg-[#0c0c0e]/30">
        {isLoading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-neutral-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            <span className="text-xs">Loading squad communication channel...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-rose-500 p-4 space-y-2">
            <AlertCircle className="w-6 h-6" />
            <span className="text-xs">{error}</span>
            <Button size="sm" variant="outline" onClick={fetchChannel} className="text-xs">
              Retry
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-neutral-400 p-6 space-y-2">
            <div className="w-12 h-12 rounded-3xl bg-primary-500/10 flex items-center justify-center text-primary-600 mb-1">
              <MessagesSquare className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
              No Messages in this Channel Yet
            </h3>
            <p className="text-xs max-w-sm">
              Use this channel to discuss project architecture, receive SRS feedback from your advisor, and post weekly progress updates.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAdvisor = msg.sender_role === 'advisor'
            const isSelf = String(msg.sender) === String(currentUser?.id) || (Boolean(currentUser?.email) && msg.sender_email === currentUser?.email)

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${
                  isSelf ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                {/* Sender Tag & Type Badge */}
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                    {msg.sender_name}
                  </span>
                  <span
                    className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-md ${
                      isAdvisor
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-primary-100 text-primary-800 dark:bg-primary-950 dark:text-primary-300'
                    }`}
                  >
                    {msg.sender_role}
                  </span>
                  {getBadgeForType(msg.message_type)}
                </div>

                {/* Message Bubble */}
                <div
                  className={`p-3.5 rounded-3xl text-xs shadow-xs relative transition-all duration-200 ${
                    isAdvisor
                      ? 'bg-gradient-to-br from-amber-500/10 via-primary-500/10 to-transparent border border-amber-500/30 dark:border-amber-500/20 text-neutral-900 dark:text-white rounded-tl-sm'
                      : isSelf
                      ? 'bg-primary-600 text-white rounded-tr-sm shadow-glow'
                      : 'bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-900 dark:text-white rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>

                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isSelf ? 'text-primary-200' : 'text-neutral-400'
                    }`}
                  >
                    <span>{formatMessageTime(msg.created_at)}</span>
                    {isSelf && <CheckCheck className="w-3 h-3 text-primary-200" />}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input / Composition Bar */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 sm:p-4 border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Message Type Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-neutral-400 hidden sm:inline">Type:</span>
            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value as any)}
              className="text-xs font-semibold py-1 px-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 focus:outline-none"
            >
              <option value="GENERAL">General</option>
              {currentRole === 'advisor' && <option value="SRS_FEEDBACK">SRS Feedback Note</option>}
              {currentRole === 'advisor' && <option value="ADVISORY_NOTICE">Advisory Announcement</option>}
              <option value="SPRINT_UPDATE">Sprint Update</option>
            </select>
          </div>

          <span className="text-[10px] text-neutral-400">
            {messageText.length > 0 ? `${messageText.length} chars` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={
              !teamId
                ? 'Join a squad to send messages...'
                : currentRole === 'advisor'
                ? 'Post advisory feedback or guidance note to squad...'
                : 'Send question or progress update to advisor...'
            }
            value={messageText}
            disabled={!teamId || isSending}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/70 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />

          <Button
            type="submit"
            disabled={!teamId || !messageText.trim() || isSending}
            className="rounded-2xl px-4 py-2.5 text-xs font-bold shadow-glow"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1.5" /> Send
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
