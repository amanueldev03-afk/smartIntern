import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'

type ResumePreviewProps = {
  url: string
  fileName?: string | null
}

function getFileType(url: string, fileName?: string | null): 'pdf' | 'docx' | 'image' | 'other' {
  // Inspect the server-provided URL first — it always carries the real file
  // extension regardless of any client-side display-name fallback (e.g. the
  // generic "Resume.pdf" passed in after a page reload). The display filename
  // is only consulted as a secondary hint when the URL gives no signal.
  const candidates = [url, fileName]
  for (const candidate of candidates) {
    if (!candidate) continue
    const target = candidate.toLowerCase()
    if (/\.pdf(\?|$|#)/i.test(target)) return 'pdf'
    if (/\.(docx|doc)(\?|$|#)/i.test(target)) return 'docx'
    if (/\.(png|jpe?g|webp|svg)(\?|$|#)/i.test(target)) return 'image'
  }
  return 'other'
}

export default function ResumePreview({ url, fileName }: ResumePreviewProps) {
  const fileType = getFileType(url, fileName)
  const displayName = fileName || url.split('/').pop() || 'Resume'
  const docxContainerRef = useRef<HTMLDivElement>(null)
  const [docxLoading, setDocxLoading] = useState<boolean>(false)
  const [docxError, setDocxError] = useState<string | null>(null)

  useEffect(() => {
    if (fileType === 'docx' && docxContainerRef.current && url) {
      setDocxLoading(true)
      setDocxError(null)
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load document (${res.status})`)
          return res.blob()
        })
        .then(async (blob) => {
          if (docxContainerRef.current) {
            docxContainerRef.current.innerHTML = ''
            await renderAsync(blob, docxContainerRef.current, undefined, {
              inWrapper: false,
              ignoreWidth: true,
              breakPages: true,
            })
          }
        })
        .catch((err) => {
          console.error('Docx rendering error:', err)
          setDocxError('Unable to render DOCX inline. Please download to view.')
        })
        .finally(() => {
          setDocxLoading(false)
        })
    }
  }, [fileType, url])

  if (!url) return null

  return (
    <div className="border border-neutral-200 dark:border-dark-border rounded-2xl overflow-hidden bg-white dark:bg-dark-card shadow-glow mt-4">
      <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-50 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-dark-border">
        <div className="flex items-center gap-2.5 text-sm font-bold text-neutral-800 dark:text-neutral-200 truncate">
          <svg className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate">{displayName}</span>
          <span className="text-xs uppercase px-2.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-950/60 text-primary-800 dark:text-primary-300 font-bold border border-primary-200 dark:border-primary-800">
            {fileType.toUpperCase()}
          </span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/40 dark:hover:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded-xl text-xs font-bold border border-primary-200/60 dark:border-primary-800/60 transition-colors shadow-xs"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Open / Download File ↗
        </a>
      </div>

      <div
        id="resume-preview-container"
        className="w-full bg-neutral-100 dark:bg-neutral-900/60 flex flex-col items-center justify-center p-4 overflow-auto"
        style={{ minHeight: '500px', maxHeight: '80vh' }}
      >
        {fileType === 'pdf' && (
          <embed
            src={url}
            title={displayName}
            type="application/pdf"
            className="w-full rounded-xl bg-white shadow-inner"
            style={{ height: '75vh', border: 0 }}
          />
        )}

        {fileType === 'image' && (
          <div className="flex justify-center items-center p-4">
            <img
              src={url}
              alt={displayName}
              className="max-h-[70vh] w-auto rounded-xl shadow object-contain bg-white dark:bg-dark-card"
            />
          </div>
        )}

        {fileType === 'docx' && (
          <div className="w-full bg-white dark:bg-dark-card p-6 rounded-xl shadow min-h-[500px] overflow-auto">
            {docxLoading && (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400"></div>
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Rendering Word Document...</p>
              </div>
            )}
            {docxError && (
              <div className="text-center py-10">
                <p className="text-sm font-medium text-error-600 dark:text-error-400 mb-3">{docxError}</p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="btn-primary inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-xl shadow-glow"
                >
                  Download DOCX to View ↗
                </a>
              </div>
            )}
            <div ref={docxContainerRef} className="docx-render-wrapper" />
          </div>
        )}

        {fileType === 'other' && (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-950/60 flex items-center justify-center text-primary-600 dark:text-primary-400 shadow-glow">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">{displayName}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-glow"
            >
              Download or Open Document ↗
            </a>
          </div>
        )}
      </div>
    </div>
  )
}