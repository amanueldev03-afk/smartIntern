import { useCallback, useEffect, useMemo, useState } from 'react'
import * as studentApi from '@/services/studentApi'
import type { CareerInterest, Skill } from '@/services/studentApi'
import { mapApiErrors, flattenApiErrors } from '@/utils/apiErrors'
import { SectionCard, ErrorBanner, SuccessBanner, inputClassName } from './components/ProfileForm'
import { Plus, Search, Sparkles, X, Check } from 'lucide-react'

// Prominent Ethiopian university & industry focus areas for quick discovery
const ETHIOPIAN_QUICK_SKILLS = [
  'Telebirr & CBE Birr Payment Integration',
  'Chapa & SantimPay Gateway',
  'Amharic NLP & Ethiopic Script Processing',
  'Ethiopic OCR & Text Recognition',
  'Telecom & GSM Networks (Ethio Telecom/Safaricom)',
  'MicroTik & Enterprise Networking',
  'IFRS & Ethiopian Tax Compliance (ERCA/MOR)',
  'Electrical & Power Grid Engineering (EEP/EEU)',
  'Civil & Structural Engineering (ERA Standards)',
  'Public Health Informatics (DHIS2 Ethiopia)',
  'Python',
  'React',
  'Flutter',
  'Django',
]

const ETHIOPIAN_QUICK_INTERESTS = [
  'FinTech & Mobile Money Solutions',
  'Telecom & Network Infrastructure',
  'Health Informatics & MedTech',
  'Renewable Energy & Power Engineering',
  'Civil Infrastructure & Urban Planning',
  'Full Stack Development',
  'Machine Learning',
  'Cybersecurity',
]

export default function SkillsInterestsSection({
  onSaved,
}: {
  onSaved: () => void
}) {
  const [mySkills, setMySkills] = useState<Skill[]>([])
  const [myInterests, setMyInterests] = useState<CareerInterest[]>([])
  const [skillChoices, setSkillChoices] = useState<Skill[]>([])
  const [interestChoices, setInterestChoices] = useState<CareerInterest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Skill states
  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [skillSearchQuery, setSkillSearchQuery] = useState('')
  const [pendingSkillId, setPendingSkillId] = useState<number | string | null>(null)

  // Interest states
  const [selectedInterestId, setSelectedInterestId] = useState('')
  const [interestSearchQuery, setInterestSearchQuery] = useState('')
  const [pendingInterestId, setPendingInterestId] = useState<number | string | null>(null)

  const [errors, setErrors] = useState<ReturnType<typeof mapApiErrors> | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [skills, interests, skillCat, interestCat] = await Promise.all([
      studentApi.getStudentSkills(),
      studentApi.getStudentInterests(),
      studentApi.getSkillChoices(),
      studentApi.getInterestChoices(),
    ])
    setMySkills(skills)
    setMyInterests(interests)
    setSkillChoices(skillCat)
    setInterestChoices(interestCat)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refresh().catch(() => {
      setIsLoading(false)
      setErrors({
        fieldErrors: {},
        nonFieldErrors: [
          'Failed to load skills and interests from the catalogue. Please try again.',
        ],
      })
    })
  }, [refresh])

  const addableSkills = useMemo(
    () => skillChoices.filter((s) => !mySkills.some((mine) => mine.id === s.id || mine.name.toLowerCase() === s.name.toLowerCase())),
    [skillChoices, mySkills]
  )

  const filteredSkills = useMemo(() => {
    if (!skillSearchQuery.trim()) return addableSkills
    const q = skillSearchQuery.toLowerCase()
    return addableSkills.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.category && s.category.toLowerCase().includes(q))
    )
  }, [addableSkills, skillSearchQuery])

  const addableInterests = useMemo(
    () => interestChoices.filter((i) => !myInterests.some((mine) => mine.id === i.id || mine.name.toLowerCase() === i.name.toLowerCase())),
    [interestChoices, myInterests]
  )

  const filteredInterests = useMemo(() => {
    if (!interestSearchQuery.trim()) return addableInterests
    const q = interestSearchQuery.toLowerCase()
    return addableInterests.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q))
    )
  }, [addableInterests, interestSearchQuery])

  // Does the search query already exist exactly in mySkills?
  const skillAlreadyAdded = useMemo(() => {
    const q = skillSearchQuery.trim().toLowerCase()
    return q.length > 0 && mySkills.some((s) => s.name.toLowerCase() === q)
  }, [skillSearchQuery, mySkills])

  // Does the interest search query already exist exactly in myInterests?
  const interestAlreadyAdded = useMemo(() => {
    const q = interestSearchQuery.trim().toLowerCase()
    return q.length > 0 && myInterests.some((i) => i.name.toLowerCase() === q)
  }, [interestSearchQuery, myInterests])

  const guard = async (
    action: () => Promise<void>
  ): Promise<boolean> => {
    setErrors(null)
    setSuccess(null)
    try {
      await action()
      setSuccess('Profile updated successfully.')
      onSaved()
      return true
    } catch (error) {
      setErrors(mapApiErrors(error))
      return false
    }
  }

  const handleAddSkillById = async (id: number) => {
    setPendingSkillId(id)
    await guard(async () => {
      await studentApi.addStudentSkill(id)
      await refresh()
    })
    setPendingSkillId(null)
    setSelectedSkillId('')
  }

  const handleAddCustomSkill = async (customName: string) => {
    const trimmed = customName.trim()
    if (!trimmed) return
    setPendingSkillId(trimmed)
    await guard(async () => {
      await studentApi.addStudentSkill(trimmed)
      await refresh()
    })
    setPendingSkillId(null)
    setSkillSearchQuery('')
    setSelectedSkillId('')
  }

  const handleRemoveSkill = async (skillId: number) => {
    setPendingSkillId(skillId)
    await guard(async () => {
      await studentApi.removeStudentSkill(skillId)
      await studentApi.getStudentSkills().then(setMySkills)
    })
    setPendingSkillId(null)
  }

  const handleAddInterestById = async (id: number) => {
    setPendingInterestId(id)
    await guard(async () => {
      await studentApi.addStudentInterest(id)
      await refresh()
    })
    setPendingInterestId(null)
    setSelectedInterestId('')
  }

  const handleAddCustomInterest = async (customName: string) => {
    const trimmed = customName.trim()
    if (!trimmed) return
    setPendingInterestId(trimmed)
    await guard(async () => {
      await studentApi.addStudentInterest(trimmed)
      await refresh()
    })
    setPendingInterestId(null)
    setInterestSearchQuery('')
    setSelectedInterestId('')
  }

  const handleRemoveInterest = async (interestId: number) => {
    setPendingInterestId(interestId)
    await guard(async () => {
      await studentApi.removeStudentInterest(interestId)
      await studentApi.getStudentInterests().then(setMyInterests)
    })
    setPendingInterestId(null)
  }

  const errorMessage = useMemo(() => (errors ? flattenApiErrors(errors) : []), [errors])

  if (isLoading) {
    return (
      <SectionCard title="Skills & Interests">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading Ethiopian & technical catalogue...</p>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Skills & Technologies"
        description="Select from over 200+ Ethiopian context & international tech skills, or type a custom skill below to save it to your profile and catalogue."
      >
        <ErrorBanner messages={errorMessage} />
        <SuccessBanner message={success} />

        {/* Selected skills badges */}
        <div className="flex flex-wrap gap-2.5">
          {mySkills.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No skills added yet. Select or type below.</p>
          )}
          {mySkills.map((skill) => (
            <span
              key={skill.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold rounded-xl text-sm border border-primary-200/60 dark:border-primary-800/60 shadow-xs"
            >
              {skill.name}
              <button
                type="button"
                aria-label={`Remove skill ${skill.name}`}
                disabled={pendingSkillId === skill.id}
                onClick={() => handleRemoveSkill(skill.id)}
                className="text-primary-400 hover:text-error-600 dark:hover:text-error-400 disabled:opacity-50 transition-colors ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Search and Custom Add bar */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
            Search or Type Any Skill
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={skillSearchQuery}
                onChange={(e) => setSkillSearchQuery(e.target.value)}
                placeholder="Search skill (e.g. Telebirr, React, Python, IFRS)..."
                className={`${inputClassName} pl-9`}
              />
              {skillSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSkillSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* If search query entered and not already in profile, show direct Add/Save button */}
            {skillSearchQuery.trim() && !skillAlreadyAdded && (
              <button
                type="button"
                onClick={() => handleAddCustomSkill(skillSearchQuery)}
                disabled={Boolean(pendingSkillId)}
                className="btn-primary shrink-0 px-4 py-2.5 rounded-xl shadow-glow text-sm font-semibold inline-flex items-center gap-1.5 transition-all duration-200 hover:scale-105 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                Add &quot;{skillSearchQuery.trim().slice(0, 20)}...&quot;
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1">
            <select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className={inputClassName}
              disabled={filteredSkills.length === 0}
              aria-label="Select skill from catalogue"
            >
              <option value="">
                {filteredSkills.length === 0
                  ? skillSearchQuery
                    ? 'No matching catalogue skills (click Add above)'
                    : 'All catalogue skills added'
                  : `-- Choose from catalogue (${filteredSkills.length} available) --`}
              </option>
              {filteredSkills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name} {skill.category ? `(${skill.category})` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => handleAddSkillById(Number(selectedSkillId))}
            disabled={!selectedSkillId || Boolean(pendingSkillId)}
            className="btn-secondary shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Add Selected
          </button>
        </div>

        {/* Ethiopian Context Quick Suggestions */}
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Popular Ethiopian Tech & Engineering Skills:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ETHIOPIAN_QUICK_SKILLS.map((item) => {
              const alreadyHas = mySkills.some((s) => s.name.toLowerCase() === item.toLowerCase())
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => !alreadyHas && handleAddCustomSkill(item)}
                  disabled={alreadyHas || Boolean(pendingSkillId)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    alreadyHas
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700 cursor-default'
                      : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400'
                  }`}
                >
                  {alreadyHas ? <Check className="w-3 h-3 inline mr-1 text-emerald-500" /> : '+ '}
                  {item}
                </button>
              )
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Career Interests"
        description="Select or type your target career fields. Custom interests are saved to your profile and added to the platform catalogue for future interns."
      >
        {/* Selected interests badges */}
        <div className="flex flex-wrap gap-2.5">
          {myInterests.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No career interests added yet.</p>
          )}
          {myInterests.map((interest) => (
            <span
              key={interest.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold rounded-xl text-sm border border-teal-200/60 dark:border-teal-800/60 shadow-xs"
            >
              {interest.name}
              <button
                type="button"
                aria-label={`Remove interest ${interest.name}`}
                disabled={pendingInterestId === interest.id}
                onClick={() => handleRemoveInterest(interest.id)}
                className="text-teal-400 hover:text-error-600 dark:hover:text-error-400 disabled:opacity-50 transition-colors ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Search and Custom Add Bar */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
            Search or Type Any Career Interest
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={interestSearchQuery}
                onChange={(e) => setInterestSearchQuery(e.target.value)}
                placeholder="Search career interest (e.g. FinTech, MedTech, Power Engineering)..."
                className={`${inputClassName} pl-9`}
              />
              {interestSearchQuery && (
                <button
                  type="button"
                  onClick={() => setInterestSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {interestSearchQuery.trim() && !interestAlreadyAdded && (
              <button
                type="button"
                onClick={() => handleAddCustomInterest(interestSearchQuery)}
                disabled={Boolean(pendingInterestId)}
                className="btn-accent shrink-0 px-4 py-2.5 rounded-xl shadow-glow text-sm font-semibold inline-flex items-center gap-1.5 transition-all duration-200 hover:scale-105 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                Add &quot;{interestSearchQuery.trim().slice(0, 20)}...&quot;
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1">
            <select
              value={selectedInterestId}
              onChange={(e) => setSelectedInterestId(e.target.value)}
              className={inputClassName}
              disabled={filteredInterests.length === 0}
              aria-label="Select interest from catalogue"
            >
              <option value="">
                {filteredInterests.length === 0
                  ? interestSearchQuery
                    ? 'No matching catalogue interests (click Add above)'
                    : 'All catalogue interests added'
                  : `-- Choose from catalogue (${filteredInterests.length} available) --`}
              </option>
              {filteredInterests.map((interest) => (
                <option key={interest.id} value={interest.id}>
                  {interest.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => handleAddInterestById(Number(selectedInterestId))}
            disabled={!selectedInterestId || Boolean(pendingInterestId)}
            className="btn-secondary shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Add Selected
          </button>
        </div>

        {/* Ethiopian Context Quick Suggestions */}
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-teal-500" />
            <span>Target Ethiopian Career Pathways:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ETHIOPIAN_QUICK_INTERESTS.map((item) => {
              const alreadyHas = myInterests.some((i) => i.name.toLowerCase() === item.toLowerCase())
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => !alreadyHas && handleAddCustomInterest(item)}
                  disabled={alreadyHas || Boolean(pendingInterestId)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    alreadyHas
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700 cursor-default'
                      : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400'
                  }`}
                >
                  {alreadyHas ? <Check className="w-3 h-3 inline mr-1 text-emerald-500" /> : '+ '}
                  {item}
                </button>
              )
            })}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}