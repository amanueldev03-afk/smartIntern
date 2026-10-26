import { useEffect, useMemo, useState } from 'react'
import * as studentApi from '@/services/studentApi'
import * as authApi from '@/services/authApi'
import type { User } from '@/types'
import {
  mapApiErrors,
  firstFieldError,
  flattenApiErrors,
} from '@/utils/apiErrors'
import {
  CURRENT_YEAR_LABELS,
  EDUCATION_LEVEL_LABELS,
  FIELD_OF_STUDY_LABELS,
  choiceOptions,
} from '@/constants/profileChoices'
import {
  SectionCard,
  FormField,
  Input,
  Select,
  TextArea,
  ErrorBanner,
  SuccessBanner,
} from './components/ProfileForm'

const emptyForm = {
  phone: '',
  country: '',
  city: '',
  date_of_birth: '',
  bio: '',
  education_level: '',
  current_year: '',
  field_of_study: '',
  university: '',
  student_id_number: '',
  gpa: '',
}

type FormState = typeof emptyForm

export default function PersonalEducationSection({
  onSaved,
}: {
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [errors, setErrors] = useState<ReturnType<typeof mapApiErrors> | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function normalizeChoice(val: string | null | undefined, choices: Record<string, string>): string {
    if (!val) return ''
    const trimmed = val.trim()
    if (choices[trimmed]) return trimmed
    const lower = trimmed.toLowerCase()
    if (choices[lower]) return lower
    for (const [code, label] of Object.entries(choices)) {
      if (label.toLowerCase() === lower || code.toLowerCase() === lower.replace(/ /g, '_')) {
        return code
      }
    }
    return trimmed
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      studentApi.getStudentMe(),
      authApi.getCurrentUser(),
    ])
      .then(([studentData, userData]) => {
        if (cancelled) return
        const initialUni = studentData.university || userData?.university_name || ''
        const initialPhone = studentData.phone || userData?.phone_number || ''
        const initialDob = studentData.date_of_birth ? studentData.date_of_birth.split('T')[0] : ''
        const initialYear = normalizeChoice(studentData.current_year, CURRENT_YEAR_LABELS)
        const initialEdu = normalizeChoice(studentData.education_level, EDUCATION_LEVEL_LABELS)
        const initialFos = normalizeChoice(studentData.field_of_study, FIELD_OF_STUDY_LABELS)

        setForm({
          phone: initialPhone,
          country: studentData.country || 'Ethiopia',
          city: studentData.city ?? '',
          date_of_birth: initialDob,
          bio: studentData.bio ?? '',
          education_level: initialEdu,
          current_year: initialYear,
          field_of_study: initialFos,
          university: initialUni,
          student_id_number: studentData.student_id_number ?? '',
          gpa: studentData.gpa !== null && studentData.gpa !== undefined ? String(studentData.gpa) : '',
        })
        setUser(userData)
      })
      .catch(() => {
        if (!cancelled) setErrors({ fieldErrors: {}, nonFieldErrors: ['Failed to load your profile. Please try again.'] })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors(null)
    setSuccess(null)
  }

  const handleSave = async () => {
    if (isSaving) return
    setErrors(null)
    setSuccess(null)

    // Validate GPA if provided
    if (form.gpa) {
      const gpaNum = parseFloat(form.gpa)
      if (isNaN(gpaNum) || gpaNum < 0 || gpaNum > 4.0) {
        setErrors({
          fieldErrors: { gpa: ['Cumulative GPA must be a valid number between 0.00 and 4.00.'] },
          nonFieldErrors: [],
        })
        return
      }
    }

    setIsSaving(true)
    try {
      const payload: studentApi.StudentMeInput = {
        phone: form.phone,
        country: form.country,
        city: form.city,
        date_of_birth: form.date_of_birth ? form.date_of_birth.split('T')[0] : null,
        bio: form.bio,
        education_level: form.education_level,
        current_year: form.current_year,
        field_of_study: form.field_of_study,
        university: form.university,
      }
      if (form.student_id_number && form.student_id_number.trim()) {
        payload.student_id_number = form.student_id_number.trim()
      }
      if (form.gpa !== '') {
        const gpaVal = parseFloat(form.gpa)
        payload.gpa = !isNaN(gpaVal) ? gpaVal : null
      }

      await studentApi.updateStudentMe(payload)
      setSuccess('Personal and education details saved.')
      onSaved()
    } catch (error) {
      setErrors(mapApiErrors(error))
    } finally {
      setIsSaving(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setErrors({ fieldErrors: {}, nonFieldErrors: ['Profile photo must be a JPEG, PNG, GIF, or WebP image.'] })
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setErrors({ fieldErrors: {}, nonFieldErrors: ['Profile photo must be less than 5MB.'] })
      return
    }

    setIsUploadingPhoto(true)
    setErrors(null)
    setSuccess(null)
    try {
      const updatedUser = await authApi.updateUser({ profile_photo: file })
      setUser(updatedUser)
      setSuccess('Profile photo updated successfully.')
      onSaved()
    } catch (error) {
      console.error('Profile photo upload error:', error)
      setErrors(mapApiErrors(error))
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  // Helper to get full URL for profile photo
  const getProfilePhotoUrl = (user: User | null) => {
    // Use the full URL from backend if available
    if (user?.profile_photo_url) {
      return user.profile_photo_url
    }
    // Fallback to constructing URL from relative path
    if (user?.profile_photo) {
      if (user.profile_photo.startsWith('http://') || user.profile_photo.startsWith('https://')) {
        return user.profile_photo
      }
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
      const baseUrl = apiBaseUrl.replace('/api', '')
      return `${baseUrl}/media/${user.profile_photo}`
    }
    return null
  }

  const errorMessage = useMemo(() => (errors ? flattenApiErrors(errors) : []), [errors])

  if (isLoading) {
    return (
      <SectionCard title="Personal & Education">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading your details...</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Personal & Education"
      description="These fields power the AI matching engine. Education choices are fixed lists — pick a canonical value."
    >
      <ErrorBanner messages={errorMessage} />
      <SuccessBanner message={success} />

      {/* Profile Photo Section */}
      <div className="mb-6">
        <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">Profile Photo</label>
        <div className="flex items-center gap-4">
          {getProfilePhotoUrl(user) ? (
            <img
              src={getProfilePhotoUrl(user)}
              alt="Profile"
              className="w-20 h-20 rounded-2xl object-cover border-2 border-neutral-200 dark:border-neutral-700 shadow-glow"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border-2 border-neutral-300 dark:border-neutral-700 shadow-glow">
              <span className="text-neutral-400 dark:text-neutral-500 text-2xl font-bold">?</span>
            </div>
          )}
          <div>
            <input
              type="file"
              id="profile-photo"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handlePhotoUpload}
              disabled={isUploadingPhoto}
              className="hidden"
            />
            <label
              htmlFor="profile-photo"
              className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer shadow-glow transition-all duration-200 hover:scale-105 ${
                isUploadingPhoto
                  ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                  : 'btn-primary'
              }`}
            >
              {isUploadingPhoto ? 'Uploading...' : user?.profile_photo ? 'Change Photo' : 'Upload Photo'}
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 font-medium">JPEG, PNG, GIF, or WebP (max 5MB)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Phone" htmlFor="me-phone" error={firstFieldError(errors, 'phone')}>
          <Input
            id="me-phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            error={firstFieldError(errors, 'phone')}
          />
        </FormField>
        <FormField label="Country" htmlFor="me-country" error={firstFieldError(errors, 'country')}>
          <Input
            id="me-country"
            name="country"
            value={form.country}
            onChange={handleChange}
            error={firstFieldError(errors, 'country')}
          />
        </FormField>
        <FormField label="City" htmlFor="me-city" error={firstFieldError(errors, 'city')}>
          <Input
            id="me-city"
            name="city"
            value={form.city}
            onChange={handleChange}
            error={firstFieldError(errors, 'city')}
          />
        </FormField>
        <FormField label="Date of birth" htmlFor="me-dob" error={firstFieldError(errors, 'date_of_birth')}>
          <Input
            id="me-dob"
            name="date_of_birth"
            type="date"
            value={form.date_of_birth}
            onChange={handleChange}
            error={firstFieldError(errors, 'date_of_birth')}
          />
        </FormField>
        <FormField label="Education level" htmlFor="me-edu-level" error={firstFieldError(errors, 'education_level')}>
          <Select
            id="me-edu-level"
            name="education_level"
            value={form.education_level}
            onChange={handleChange}
            placeholder="Select education level"
            options={choiceOptions(EDUCATION_LEVEL_LABELS)}
            error={firstFieldError(errors, 'education_level')}
          />
        </FormField>
        <FormField label="Current year" htmlFor="me-current-year" error={firstFieldError(errors, 'current_year')}>
          <Select
            id="me-current-year"
            name="current_year"
            value={form.current_year}
            onChange={handleChange}
            placeholder="Select current year"
            options={choiceOptions(CURRENT_YEAR_LABELS)}
            error={firstFieldError(errors, 'current_year')}
          />
        </FormField>
        <FormField label="Field of study" htmlFor="me-field" error={firstFieldError(errors, 'field_of_study')}>
          <Select
            id="me-field"
            name="field_of_study"
            value={form.field_of_study}
            onChange={handleChange}
            placeholder="Select field of study"
            options={choiceOptions(FIELD_OF_STUDY_LABELS)}
            error={firstFieldError(errors, 'field_of_study')}
          />
        </FormField>
        <FormField label="University" htmlFor="me-university" error={firstFieldError(errors, 'university')}>
          <Input
            id="me-university"
            name="university"
            value={form.university}
            onChange={handleChange}
            error={firstFieldError(errors, 'university')}
          />
        </FormField>
        <FormField label="University ID Number *" htmlFor="me-student-id" error={firstFieldError(errors, 'student_id_number')}>
          <Input
            id="me-student-id"
            name="student_id_number"
            value={form.student_id_number}
            onChange={handleChange}
            placeholder="e.g. UGR/1234/14"
            error={firstFieldError(errors, 'student_id_number')}
          />
        </FormField>
        <FormField label="Cumulative GPA (0.00 - 4.00)" htmlFor="me-gpa" error={firstFieldError(errors, 'gpa')}>
          <Input
            id="me-gpa"
            name="gpa"
            type="number"
            value={form.gpa}
            onChange={handleChange}
            placeholder="e.g. 3.75"
            error={firstFieldError(errors, 'gpa')}
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Bio" htmlFor="me-bio" error={firstFieldError(errors, 'bio')}>
            <TextArea
              id="me-bio"
              name="bio"
              rows={3}
              value={form.bio}
              onChange={handleChange}
              error={firstFieldError(errors, 'bio')}
            />
          </FormField>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary inline-flex items-center px-5 py-2.5 rounded-xl shadow-glow text-sm font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Updates your profile instantly.</span>
      </div>
    </SectionCard>
  )
}