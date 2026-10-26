import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDataSourceHealth, type DataSourceHealthItem } from '@/services/adminApi'
import { ArrowLeft, Database, CheckCircle2, XCircle, AlertCircle, Globe } from 'lucide-react'

export default function AdminDataSourceHealth() {
  const navigate = useNavigate()
  const [sources, setSources] = useState<DataSourceHealthItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    getDataSourceHealth()
      .then((data) => { if (isCurrent) setSources(data) })
      .catch(() => { if (isCurrent) setError('Failed to load data source health.') })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [])

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
                <Database className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                Data Source <span className="gradient-text">Health</span>
              </h1>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Monitor scrapers, ingested pipelines, and crawler uptime
            </p>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/40 p-4 text-error-700 dark:text-error-300 text-xs font-medium flex items-center gap-2 animate-scale-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="card-gradient p-8 rounded-3xl animate-pulse space-y-4 text-center">
            <p className="text-xs font-semibold text-neutral-500">Loading data sources...</p>
            <div className="h-24 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl" />
          </div>
        ) : sources.length === 0 ? (
          <div className="card-gradient p-12 rounded-3xl text-center max-w-lg mx-auto shadow-card space-y-3 animate-scale-in">
            <div className="w-16 h-16 mx-auto bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center shadow-glow">
              <Database className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">No data sources configured</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              Add data sources through the platform settings to start ingesting internships.
            </p>
          </div>
        ) : (
          <div className="space-y-4 animate-slide-up">
            {sources.map((source) => (
              <div
                key={source.id}
                className="card-gradient rounded-3xl p-6 sm:p-7 shadow-soft hover:shadow-glow transition-all duration-300 transform hover:-translate-y-0.5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      {source.is_active ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-error-500 shrink-0" />
                      )}
                      <h3 className="text-base font-bold text-neutral-900 dark:text-white">{source.name}</h3>
                      <span className="rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 px-3 py-1 text-xs font-bold border border-primary-500/20">
                        {source.source_type}
                      </span>
                    </div>
                    {source.website_url && (
                      <a
                        href={source.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-primary-600 inline-flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" /> {source.website_url}
                      </a>
                    )}
                  </div>
                  <div className="text-right text-xs font-bold text-neutral-500 dark:text-neutral-400">
                    <span className="gradient-text font-black text-sm">{source.total_runs}</span> total runs
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Status</p>
                    <p className={`text-xs font-bold mt-1 ${source.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-error-600 dark:text-error-400'}`}>
                      {source.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Last Synced</p>
                    <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mt-1 truncate">
                      {source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : 'Never'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Last Run</p>
                    <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mt-1 truncate">
                      {source.last_run_status ? `${source.last_run_status} (${source.last_run_completed_at ? new Date(source.last_run_completed_at).toLocaleString() : 'running'})` : 'Never'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-neutral-700/60">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Records Created</p>
                    <p className="text-xs font-black text-neutral-900 dark:text-white mt-1">
                      {source.last_records_created}
                    </p>
                  </div>
                </div>
                {source.last_error && (
                  <p className="rounded-2xl bg-error-50 dark:bg-error-950/40 p-3 text-xs text-error-700 dark:text-error-300 font-medium border border-error-200 dark:border-error-800">
                    Last error: {source.last_error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
