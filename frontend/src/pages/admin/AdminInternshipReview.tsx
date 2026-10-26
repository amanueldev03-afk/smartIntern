import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getInternshipReviewQueue,
  approveInternship,
  rejectInternship,
  removeInternship,
  type InternshipReviewItem,
} from '@/services/adminApi'
import {
  ArrowLeft,
  Briefcase,
  Check,
  X,
  Trash2,
  Search,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    rejected: 'bg-error-500/10 text-error-600 dark:text-error-400 border-error-500/20',
    removed: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20',
  }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold border uppercase tracking-wider ${styles[status] || styles.draft}`}>
      {status}
    </span>
  )
}

export default function AdminInternshipReview() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InternshipReviewItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectModal, setRejectModal] = useState<InternshipReviewItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { page, page_size: 20 }
      if (search) params.search = search
      if (reasonFilter) params.reason = reasonFilter
      const data = await getInternshipReviewQueue(params as any)
      setItems(data.results)
      setTotalCount(data.count)
    } catch {
      setError('Failed to load review queue.')
    } finally {
      setIsLoading(false)
    }
  }, [page, search, reasonFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleApprove = async (id: number) => {
    setActionLoading(id)
    try {
      await approveInternship(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      setTotalCount((prev) => prev - 1)
    } catch {
      setError('Approve failed.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModal) return
    setActionLoading(rejectModal.id)
    try {
      await rejectInternship(rejectModal.id, rejectReason)
      setItems((prev) => prev.filter((item) => item.id !== rejectModal.id))
      setTotalCount((prev) => prev - 1)
      setRejectModal(null)
      setRejectReason('')
    } catch {
      setError('Reject failed.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemove = async (id: number) => {
    setActionLoading(id)
    try {
      await removeInternship(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      setTotalCount((prev) => prev - 1)
    } catch {
      setError('Remove failed.')
    } finally {
      setActionLoading(null)
    }
  }

  const totalPages = Math.ceil(totalCount / 20)

  return (
    <main className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 animate-fade-in pb-16">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="card-gradient p-6 sm:p-8 rounded-3xl shadow-soft flex flex-wrap items-center justify-between gap-4 animate-slide-up">
          <div>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline mb-2 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-secondary-500 text-white flex items-center justify-center shadow-glow">
                <Briefcase className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Internship Review <span className="gradient-text">Queue</span>
              </h1>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              {totalCount} flagged opportunities awaiting administrator verification
            </p>
          </div>
        </header>

        {/* Filter Toolbar */}
        <div className="card-gradient p-4 rounded-3xl shadow-card flex flex-wrap items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchItems() }} className="flex-1 min-w-[260px] relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by role or company..."
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700 text-xs font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
          </form>

          <select
            value={reasonFilter}
            onChange={(e) => { setReasonFilter(e.target.value); setPage(1) }}
            className="px-4 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
          >
            <option value="">All Flag Reasons</option>
            <option value="broken_link">Broken Link</option>
            <option value="near_duplicate">Near Duplicate</option>
          </select>

          <Button
            size="sm"
            onClick={() => { setPage(1); fetchItems() }}
            className="rounded-2xl shadow-glow text-xs font-bold"
          >
            Filter
          </Button>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/40 p-4 text-error-700 dark:text-error-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-4 text-center">
            <p className="text-xs font-semibold text-neutral-500">Loading review queue...</p>
            <div className="h-24 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl" />
          </div>
        ) : items.length === 0 ? (
          <div className="card-gradient p-12 rounded-3xl text-center max-w-lg mx-auto shadow-card space-y-3 animate-scale-in">
            <div className="w-16 h-16 mx-auto bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shadow-glow">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">All clear!</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              No internships are currently flagged for review.
            </p>
          </div>
        ) : (
          <div className="space-y-4 animate-slide-up">
            {items.map((item) => (
              <div
                key={item.id}
                className="card-gradient rounded-3xl p-6 sm:p-7 shadow-soft hover:shadow-glow transition-all duration-300 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-black text-neutral-900 dark:text-white truncate">{item.title}</h3>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-xs font-bold text-primary-600 dark:text-primary-400">{item.organization_name}</p>

                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-neutral-400 pt-1">
                      {item.source_name && <span>Source: {item.source_name}</span>}
                      {item.data_source_name && <span>• Data Source: {item.data_source_name}</span>}
                    </div>

                    {item.invalid_urls.length > 0 && (
                      <div className="rounded-2xl bg-error-50 dark:bg-error-950/40 p-3 text-xs text-error-700 dark:text-error-300 font-medium border border-error-200 dark:border-error-800 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Invalid URLs: {item.invalid_urls.join(', ')}</span>
                      </div>
                    )}

                    {item.low_confidence_skills.length > 0 && (
                      <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-700 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Low-confidence skills: {item.low_confidence_skills.join(', ')}</span>
                      </div>
                    )}

                    {item.pending_duplicate_count > 0 && (
                      <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/40 p-3 text-xs text-orange-700 dark:text-orange-300 font-medium border border-orange-200 dark:border-orange-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{item.pending_duplicate_count} pending duplicate flag(s)</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(item.id)}
                      disabled={actionLoading === item.id}
                      className="rounded-2xl shadow-glow text-xs font-bold"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      {actionLoading === item.id ? '...' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setRejectModal(item)}
                      disabled={actionLoading === item.id}
                      className="rounded-2xl text-xs font-bold"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleRemove(item.id)}
                      disabled={actionLoading === item.id}
                      className="rounded-2xl text-xs font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between card-gradient p-4 rounded-3xl">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-bold">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-xl text-xs font-bold"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-xl text-xs font-bold"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in"
            onClick={() => setRejectModal(null)}
          >
            <div
              className="w-full max-w-md card-gradient rounded-3xl p-6 sm:p-8 shadow-glow border border-neutral-200/80 dark:border-neutral-800 space-y-4 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-neutral-900 dark:text-white">Reject Internship</h2>
                <button onClick={() => setRejectModal(null)} className="text-neutral-400 hover:text-neutral-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs font-bold text-primary-600 dark:text-primary-400">{rejectModal.title}</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason or notes for scraper team..."
                className="w-full rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700 p-3.5 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                rows={4}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setRejectModal(null)} className="rounded-2xl text-xs font-bold">
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onClick={handleReject} className="rounded-2xl text-xs font-bold">
                  Confirm Reject
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
