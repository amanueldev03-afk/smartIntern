import type { CVData, CVStatus } from '@/services/studentApi'

type ExtractedEducation = {
  institution?: string
  degree?: string
  field?: string
  field_of_study?: string
  years?: string
  start_date?: string
  end_date?: string
}

type ExtractedExperience = {
  role?: string
  title?: string
  company?: string
  description?: string
  start_date?: string
  end_date?: string
}

type ExtractedProject = {
  name?: string
  description?: string
  technologies?: string[]
}

type ExtractedCertification = {
  name?: string
  issuer?: string | null
  date?: string | null
}

type ExtractedLanguage = {
  name?: string
  proficiency?: string | null
}

export interface ParsedCVData {
  skills: string[]
  education: Array<Record<string, unknown>>
  experience: Array<Record<string, unknown>>
  projects: Array<Record<string, unknown>>
  certifications: ExtractedCertification[]
  languages: ExtractedLanguage[]
  hasContent: boolean
}

function asObjectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is Record<string, unknown> => v !== null && typeof v === 'object')
    .map((v) => v as unknown as T)
}

function normalizeCertification(raw: unknown): ExtractedCertification | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    return { name: trimmed, issuer: null, date: null }
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const name = typeof obj.name === 'string' ? obj.name.trim() : ''
    if (!name) return null
    const issuer = typeof obj.issuer === 'string' && obj.issuer.trim() ? obj.issuer.trim() : null
    const date = typeof obj.date === 'string' && obj.date.trim() ? obj.date.trim() : null
    return { name, issuer, date }
  }
  return null
}

function normalizeLanguage(raw: unknown): ExtractedLanguage | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    return { name: trimmed, proficiency: null }
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const name = typeof obj.name === 'string' ? obj.name.trim() : ''
    if (!name) return null
    const proficiency =
      typeof obj.proficiency === 'string' && obj.proficiency.trim()
        ? obj.proficiency.trim()
        : null
    return { name, proficiency }
  }
  return null
}

export function toParsedCVData(
  cvStatus: CVStatus | null,
  profileCvData: CVData | undefined,
): ParsedCVData {
  if (cvStatus && cvStatus.processing_status === 'COMPLETED') {
    return {
      skills: cvStatus.extracted_skills ?? [],
      education: asObjectArray(cvStatus.extracted_education),
      experience: asObjectArray(cvStatus.extracted_experience),
      projects: asObjectArray(cvStatus.extracted_projects),
      certifications: (cvStatus.extracted_certifications ?? [])
        .map(normalizeCertification)
        .filter((c): c is ExtractedCertification => c !== null),
      languages: (cvStatus.extracted_languages ?? [])
        .map(normalizeLanguage)
        .filter((l): l is ExtractedLanguage => l !== null),
      hasContent: true,
    }
  }
  if (profileCvData?.has_cv) {
    return {
      skills: profileCvData.merged_skills ?? [],
      education: asObjectArray(profileCvData.extracted_education),
      experience: asObjectArray(profileCvData.extracted_experience),
      projects: asObjectArray(profileCvData.extracted_projects),
      certifications: (profileCvData.extracted_certifications ?? [])
        .map(normalizeCertification)
        .filter((c): c is ExtractedCertification => c !== null),
      languages: (profileCvData.extracted_languages ?? [])
        .map(normalizeLanguage)
        .filter((l): l is ExtractedLanguage => l !== null),
      hasContent: true,
    }
  }
  return {
    skills: [],
    education: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
    hasContent: false,
  }
}

function listValue(item: unknown): Array<string> {
  if (!Array.isArray(item)) return []
  return item.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

export default function ExtractedCVContent({
  cvStatus,
  cvData,
}: {
  cvStatus?: CVStatus | null
  cvData?: CVData | null
}) {
  const parsed = toParsedCVData(cvStatus ?? null, cvData ?? undefined)

  if (!parsed.hasContent) {
    return null
  }

  return (
    <div className="space-y-6">
      {parsed.skills.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2.5">Parsed Skills</h4>
          <div className="flex flex-wrap gap-2">
            {parsed.skills.map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold rounded-xl text-sm border border-primary-200/60 dark:border-primary-800/60 shadow-xs"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.education.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2.5">Parsed Education</h4>
          <div className="space-y-3">
            {parsed.education.map((raw, idx) => {
              const item = (raw || {}) as ExtractedEducation
              return (
                <div key={idx} className="p-4 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl border border-neutral-200/80 dark:border-dark-border text-sm">
                  {item.degree && <div className="font-bold text-neutral-900 dark:text-white">{item.degree}</div>}
                  {(item.institution || item.field || item.field_of_study) && (
                    <div className="text-xs font-semibold text-primary-600 dark:text-primary-400 mt-0.5">
                      {[item.institution, item.field_of_study || item.field].filter(Boolean).join(' — ')}
                    </div>
                  )}
                  {item.years && <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-medium">{item.years}</div>}
                  {(item.start_date || item.end_date) && (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
                      {item.start_date ?? ''}
                      {item.start_date && item.end_date ? ' → ' : ''}
                      {item.end_date ?? ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {parsed.experience.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2.5">Parsed Experience</h4>
          <div className="space-y-3">
            {parsed.experience.map((raw, idx) => {
              const item = (raw || {}) as ExtractedExperience
              return (
                <div key={idx} className="p-4 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl border border-neutral-200/80 dark:border-dark-border text-sm">
                  <div className="font-bold text-neutral-900 dark:text-white">
                    {String(item.role ?? item.title ?? '') || '—'}
                  </div>
                  {(item.company || item.start_date || item.end_date) && (
                    <div className="text-xs font-semibold text-primary-600 dark:text-primary-400 mt-0.5">
                      {[item.company, [item.start_date, item.end_date].filter(Boolean).join(' → ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                  {item.description && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1.5 leading-relaxed">{String(item.description)}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {parsed.projects.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2.5">
            Parsed Projects
            <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
              ({parsed.projects.length})
            </span>
          </h4>
          <div className="space-y-3">
            {parsed.projects.map((raw, idx) => {
              const item = (raw || {}) as ExtractedProject
              const techs = listValue(item.technologies)
              return (
                <div
                  key={idx}
                  className="p-4 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl border border-neutral-200/80 dark:border-dark-border text-sm"
                >
                  <div className="font-bold text-neutral-900 dark:text-white">
                    {item.name?.trim() || `Project ${idx + 1}`}
                  </div>
                  {item.description && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1.5 whitespace-pre-line leading-relaxed">
                      {String(item.description)}
                    </p>
                  )}
                  {techs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {techs.map((t, ti) => (
                        <span
                          key={ti}
                          className="px-2.5 py-0.5 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800/60 rounded-lg text-xs font-semibold"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {parsed.certifications.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2.5">Parsed Certifications</h4>
          <div className="space-y-2">
            {parsed.certifications.map((cert, idx) => (
              <div
                key={idx}
                className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
              >
                <div>
                  <div className="font-bold text-emerald-900 dark:text-emerald-200">{cert.name}</div>
                  {cert.issuer && (
                    <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mt-0.5">Issued by {cert.issuer}</div>
                  )}
                </div>
                {cert.date && (
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    {cert.date}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed.languages.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-2.5">Parsed Languages</h4>
          <div className="flex flex-wrap gap-2">
            {parsed.languages.map((lang, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold rounded-xl text-sm border border-sky-200/60 dark:border-sky-800/60"
              >
                {lang.name}
                {lang.proficiency ? (
                  <span className="ml-1.5 text-sky-500 dark:text-sky-400 font-normal">— {lang.proficiency}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}