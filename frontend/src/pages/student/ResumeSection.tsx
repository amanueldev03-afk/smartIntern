import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import * as studentApi from '@/services/studentApi'
import type { CVStatus, ResumeStatus, StudentProfile } from '@/services/studentApi'
import { mapApiErrors, flattenApiErrors } from '@/utils/apiErrors'
import { SectionCard, ErrorBanner, SuccessBanner } from './components/ProfileForm'
import ExtractedCVContent, { toParsedCVData } from './components/ExtractedCVContent'
import ResumePreview from './components/ResumePreview'

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 20
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

type UploadPhase = 'idle' | 'uploading' | 'polling' | 'done'

function statusBadgeClasses(status: string | null | undefined): string {
  if (status === 'COMPLETED') return 'bg-success-100 text-success-800 border border-success-200'
  if (status === 'FAILED') return 'bg-error-100 text-error-800 border border-error-200'
  if (status === 'PROCESSING' || status === 'PENDING') return 'bg-warning-100 text-warning-800 border border-warning-200'
  return 'bg-neutral-100 text-neutral-800 border border-neutral-200'
}

export default function ResumeSection({
  profile,
  onSaved,
}: {
  profile: StudentProfile | null
  onSaved: () => void
}) {
  const [status, setStatus] = useState<ResumeStatus | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [cvStatus, setCvStatus] = useState<CVStatus | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof mapApiErrors> | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const timerRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    let cancelled = false
    studentApi
      .getResumeStatus()
      .then((data) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        // If the user doesn't have a resume yet or initial request fails, default gracefully
        if (!cancelled) {
          setStatus({
            has_resume: false,
            resume_url: null,
            cv_id: null,
            processing_status: null,
            processing_error: null,
          })
        }
      })
    return () => {
      cancelled = true
      clearTimer()
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null
    setFile(chosen)
    setErrors(null)
    setSuccess(null)

    if (chosen) {
      if (chosen.size > MAX_FILE_SIZE_BYTES) {
        setErrors({
          fieldErrors: { file: ['File size exceeds 5 MB limit. Please select a smaller file.'] },
          nonFieldErrors: [],
        })
      } else if (!/\.(pdf|docx)$/i.test(chosen.name)) {
        setErrors({
          fieldErrors: { file: ['Only PDF (.pdf) and Microsoft Word (.docx) files are supported.'] },
          nonFieldErrors: [],
        })
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const dropped = e.dataTransfer.files && e.dataTransfer.files.length > 0 ? e.dataTransfer.files[0] : null
    if (dropped) {
      setFile(dropped)
      setErrors(null)
      setSuccess(null)

      if (dropped.size > MAX_FILE_SIZE_BYTES) {
        setErrors({
          fieldErrors: { file: ['File size exceeds 5 MB limit. Please select a smaller file.'] },
          nonFieldErrors: [],
        })
      } else if (!/\.(pdf|docx)$/i.test(dropped.name)) {
        setErrors({
          fieldErrors: { file: ['Only PDF (.pdf) and Microsoft Word (.docx) files are supported.'] },
          nonFieldErrors: [],
        })
      }
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setErrors(null)
    setSuccess(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (!file) return

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrors({
        fieldErrors: { file: ['File size exceeds 5 MB limit. Please select a smaller file.'] },
        nonFieldErrors: [],
      })
      return
    }

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setErrors({
        fieldErrors: { file: ['Only PDF (.pdf) and Microsoft Word (.docx) files are supported.'] },
        nonFieldErrors: [],
      })
      return
    }

    setErrors(null)
    setSuccess(null)
    setPhase('uploading')

    try {
      const uploadResult = await studentApi.uploadResume(file)
      setSuccess('Resume uploaded. Processing in background.')
      setStatus((prev) => ({
        has_resume: true,
        resume_url: uploadResult.resume_url || prev?.resume_url || null,
        cv_id: uploadResult.cv_id || prev?.cv_id || null,
        processing_status: uploadResult.processing_status || 'PENDING',
        processing_error: null,
      }))

      const poll = async (attempt: number) => {
        try {
          const cv = await studentApi.getCVStatus()
          setCvStatus(cv)
          setStatus((prev) => ({
            has_resume: true,
            resume_url: prev?.resume_url || null,
            cv_id: cv.cv_id || prev?.cv_id || null,
            processing_status: cv.processing_status,
            processing_error: cv.processing_error,
          }))

          if (cv.processing_status === 'PENDING' || cv.processing_status === 'PROCESSING') {
            if (attempt < MAX_POLLS) {
              timerRef.current = window.setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS)
              setPhase('polling')
              return
            }
          }
        } catch {
          // Continue if single poll fails
        }
        setPhase('done')
        onSaved()
      }

      await poll(0)
    } catch (error) {
      setErrors(mapApiErrors(error))
      setPhase('idle')
    }
  }

  useEffect(() => {
    return clearTimer
  }, [])

  const parsed = useMemo(
    () => toParsedCVData(cvStatus, profile?.cv_data),
    [cvStatus, profile]
  )

  const errorMessage = useMemo(() => (errors ? flattenApiErrors(errors) : []), [errors])

  const isBusy = phase === 'uploading' || phase === 'polling'
  const statusCode = cvStatus?.processing_status ?? status?.processing_status
  const haveResume =
    cvStatus !== null || status?.has_resume === true || Boolean(profile?.resume)
  const resumeUrl = status?.resume_url ?? profile?.resume
  const resumeFileName = useMemo(() => {
    if (resumeUrl) return resumeUrl.split('/').pop()?.split('?')[0] || null
    return null
  }, [resumeUrl])

  return (
    <SectionCard
      title="Resume / CV"
      description="Upload a PDF or DOCX (max 5 MB). The API content-sniffs the file — only genuine PDFs and DOCX files are accepted."
    >
      <ErrorBanner messages={errorMessage} />
      <SuccessBanner message={success} />

      {/* Current status */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${statusBadgeClasses(statusCode)} flex items-center gap-1.5`}
        >
          {statusCode === 'COMPLETED' && <CheckCircle className="w-3.5 h-3.5" />}
          {statusCode === 'FAILED' && <AlertCircle className="w-3.5 h-3.5" />}
          {(statusCode === 'PROCESSING' || statusCode === 'PENDING') && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {haveResume
            ? statusCode === 'COMPLETED'
              ? 'Processed'
              : statusCode || 'Uploaded'
            : 'No Resume Uploaded'}
        </span>
        {status?.processing_error && (
          <span className="text-xs text-error-600 dark:text-error-400">{status.processing_error}</span>
        )}
        {resumeUrl && (
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center gap-1 transition-colors"
            aria-expanded={previewOpen}
          >
            {previewOpen ? 'Hide resume preview' : 'View resume ↗'}
          </button>
        )}
        {phase === 'uploading' && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Uploading resume...</span>
        )}
        {phase === 'polling' && (
          <span className="text-xs text-primary-600 dark:text-primary-400 font-medium animate-pulse flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Analyzing resume with AI in the background...
          </span>
        )}
      </div>

      {/* Modern Drag-and-Drop Uploader */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${
          isDragging
            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/30'
            : 'border-neutral-300 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-500 bg-neutral-50/60 dark:bg-neutral-900/40 hover:bg-primary-50/20 dark:hover:bg-primary-950/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Resume file input"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          disabled={isBusy}
          className="hidden"
          id="resume-upload"
        />
        
        {!file ? (
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-950/60 flex items-center justify-center shadow-glow">
              <Upload className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <label
                htmlFor="resume-upload"
                className="cursor-pointer text-sm font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <span className="underline">Click to upload</span> or drag and drop
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
                PDF or DOCX (max 5 MB)
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-success-100 dark:bg-success-950/60 flex items-center justify-center shadow-glow">
              <FileText className="w-8 h-8 text-success-600 dark:text-success-400" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-bold text-neutral-900 dark:text-white">{file.name}</span>
              <button
                type="button"
                onClick={handleRemoveFile}
                disabled={isBusy}
                className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              {Math.ceil(file.size / 1024)} KB
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || isBusy}
          className="btn-primary inline-flex items-center justify-center px-6 py-2.5 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Resume
            </>
          )}
        </button>
      </div>

      {resumeUrl && previewOpen && (
        <div className="mt-6">
          <ResumePreview url={resumeUrl} fileName={file?.name || resumeFileName} />
        </div>
      )}

      {/* Extracted data once processing completes */}
      {statusCode === 'FAILED' && status?.processing_error && (
        <div className="rounded-xl bg-error-50 dark:bg-error-900/20 p-4 border-2 border-error-200 dark:border-error-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error-500 mt-0.5 shrink-0" />
            <p className="text-sm text-error-700 dark:text-error-300 font-medium">
              CV processing failed: {status.processing_error}. Please re-upload your CV.
            </p>
          </div>
        </div>
      )}

      {parsed.hasContent && (
        <div className="mt-6">
          <h3 className="text-base font-bold gradient-text dark:text-white mb-3">Parsed CV Data</h3>
          <ExtractedCVContent cvStatus={cvStatus} cvData={profile?.cv_data} />
        </div>
      )}
    </SectionCard>
  )
}