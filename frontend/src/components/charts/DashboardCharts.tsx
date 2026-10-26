import React from 'react'
import {
  CheckCircle2,
  Clock,
  Award,
  TrendingUp,
  ShieldCheck,
  Building,
  GraduationCap,
} from 'lucide-react'

// ==========================================
// 1. Technical Competency Chart (Student)
// ==========================================
interface CompetencyItem {
  skill: string
  studentScore: number // 0 - 100
  marketAverage: number // 0 - 100
}

interface TechnicalCompetencyChartProps {
  skills?: string[]
  academicYear?: number
  gpa?: number | string
}

export const TechnicalCompetencyChart: React.FC<TechnicalCompetencyChartProps> = ({
  skills = [],
  academicYear = 4,
  gpa = '3.50',
}) => {
  const defaultCompetencies: CompetencyItem[] = [
    { skill: 'Core Algorithms & DSA', studentScore: 88, marketAverage: 65 },
    { skill: 'Full-Stack Web & APIs', studentScore: 92, marketAverage: 70 },
    { skill: 'System Design & Arch', studentScore: 78, marketAverage: 58 },
    { skill: 'DevOps & Cloud Deploy', studentScore: 82, marketAverage: 52 },
    { skill: 'Database & Data Ops', studentScore: 85, marketAverage: 62 },
    { skill: 'Applied AI & ML', studentScore: 74, marketAverage: 48 },
  ]

  return (
    <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border border-neutral-200/80 dark:border-neutral-800/80 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-neutral-900 dark:text-white text-base">
              Technical Competency Index
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Evaluated against Ethiopian National High-Tech & Industry benchmarks
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gradient-to-r from-primary-600 to-indigo-600" />
            <span className="font-medium text-neutral-700 dark:text-neutral-300">Your Score</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-neutral-300 dark:bg-neutral-700" />
            <span className="text-neutral-500 dark:text-neutral-400">National Avg</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {defaultCompetencies.map((item, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {item.skill}
              </span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-primary-600 dark:text-primary-400 font-bold">
                  {item.studentScore}%
                </span>
                <span className="text-neutral-400 text-[11px]">
                  (avg: {item.marketAverage}%)
                </span>
              </div>
            </div>
            {/* SVG Dual-Bar visualization */}
            <div className="relative h-3 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              {/* National Avg Marker / Sub-bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-neutral-300 dark:bg-neutral-700 rounded-full transition-all duration-700"
                style={{ width: `${item.marketAverage}%` }}
              />
              {/* Student Score Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary-600 via-indigo-600 to-primary-500 rounded-full shadow-sm transition-all duration-1000"
                style={{ width: `${item.studentScore}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-wrap items-center justify-between text-xs text-neutral-500 gap-3">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-amber-500" />
          <span>Top 10% percentile across Ethiopian University cohorts</span>
        </div>
        <span className="font-mono text-[11px] bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-lg">
          GPA {gpa} • Year {academicYear} • {skills.length > 0 ? `${skills.length} Skills` : 'Verified'}
        </span>
      </div>
    </div>
  )
}

// ==========================================
// 2. Milestone Journey Timeline (Student)
// ==========================================
interface MilestoneStep {
  title: string
  subtitle: string
  status: 'completed' | 'active' | 'upcoming'
  date?: string
}

interface MilestoneJourneyProps {
  isVerifiedByDean?: boolean
  deanTitle?: string
  hasClearanceLetter?: boolean
  forwardedToUil?: boolean
}

export const MilestoneJourneyTimeline: React.FC<MilestoneJourneyProps> = ({
  isVerifiedByDean = false,
  deanTitle = 'Department Dean',
  hasClearanceLetter = false,
  forwardedToUil = false,
}) => {
  const steps: MilestoneStep[] = [
    {
      title: 'Profile Registration',
      subtitle: 'Complete 3rd Year Academic Credentials',
      status: 'completed',
      date: 'Completed',
    },
    {
      title: 'Dean Official Verification',
      subtitle: isVerifiedByDean
        ? `Officially signed by ${deanTitle}`
        : 'Pending verification review',
      status: isVerifiedByDean ? 'completed' : 'active',
      date: isVerifiedByDean ? 'Verified' : 'In Progress',
    },
    {
      title: 'Campus Logistics Clearance',
      subtitle: hasClearanceLetter
        ? 'Dormitory Pass, Dining Pass & Scannable QR Letter Issued'
        : 'Authorized upon Dean verification',
      status: hasClearanceLetter ? 'completed' : isVerifiedByDean ? 'active' : 'upcoming',
      date: hasClearanceLetter ? 'Pass Active' : 'Pending Letter',
    },
    {
      title: 'In-House Project Development',
      subtitle: 'Team Workspace & Sprint Milestone Submissions',
      status: forwardedToUil ? 'active' : 'upcoming',
      date: 'Track 1 Phase',
    },
    {
      title: 'Academic Score Unsealing & Defense',
      subtitle: 'Evaluation Roster Unsealed & Graded by Dean',
      status: 'upcoming',
      date: 'Final Phase',
    },
  ]

  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const progressPercent = Math.round((completedSteps / steps.length) * 100)

  return (
    <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border border-neutral-200/80 dark:border-neutral-800/80 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-neutral-900 dark:text-white text-base">
              Track 1 Institutional Clearance Journey
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Complete institutional pathway from Dean verification to defense
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-xs font-bold text-neutral-900 dark:text-white">
              {progressPercent}% Complete
            </span>
            <p className="text-[10px] text-neutral-400">Step {completedSteps} of {steps.length}</p>
          </div>
          <div className="w-12 h-12 relative flex items-center justify-center">
            {/* Native SVG Circular Progress */}
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-neutral-200 dark:text-neutral-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-500 transition-all duration-1000"
                strokeDasharray={`${progressPercent}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-[11px] font-black text-neutral-800 dark:text-neutral-200">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Stepper Flow */}
      <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
        {steps.map((step, idx) => {
          const isDone = step.status === 'completed'
          const isActive = step.status === 'active'

          return (
            <div key={idx} className="relative group">
              {/* Stepper Dot */}
              <div
                className={`absolute -left-[27px] sm:-left-[31px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  isDone
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 ring-4 ring-white dark:ring-neutral-900'
                    : isActive
                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-500/30 ring-4 ring-primary-100 dark:ring-primary-950/60 animate-pulse'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 ring-4 ring-white dark:ring-neutral-900'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Clock className="w-3 h-3" />
                )}
              </div>

              {/* Step Content */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  isActive
                    ? 'bg-primary-50/50 dark:bg-primary-950/20 border-primary-200/80 dark:border-primary-800/60 shadow-sm'
                    : isDone
                    ? 'bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800'
                    : 'bg-neutral-50/50 dark:bg-neutral-800/20 border-neutral-100 dark:border-neutral-800/40 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                    {step.title}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : isActive
                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                        : 'bg-neutral-200/60 dark:bg-neutral-700/60 text-neutral-500'
                    }`}
                  >
                    {step.date}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {step.subtitle}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ==========================================
// 3. Department Analytics Chart (Dean)
// ==========================================
interface DeanAnalyticsProps {
  totalStudents: number
  verifiedStudents: number
  eligiblePending: number
  ineligibleStudents: number
  departmentName?: string
}

export const DeanVerificationAnalyticsChart: React.FC<DeanAnalyticsProps> = ({
  totalStudents = 0,
  verifiedStudents = 0,
  eligiblePending = 0,
  ineligibleStudents = 0,
  departmentName = 'Department',
}) => {
  const verifiedPct = totalStudents > 0 ? Math.round((verifiedStudents / totalStudents) * 100) : 0
  const pendingPct = totalStudents > 0 ? Math.round((eligiblePending / totalStudents) * 100) : 0
  const ineligiblePct = totalStudents > 0 ? Math.round((ineligibleStudents / totalStudents) * 100) : 0

  return (
    <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border border-neutral-200/80 dark:border-neutral-800/80 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Building className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-neutral-900 dark:text-white text-base">
              Department Clearance Analytics
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Track 1 Verification & Eligibility distribution for {departmentName}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-xl font-mono text-xs">
          <GraduationCap className="w-4 h-4 text-primary-500" />
          <span className="font-bold text-neutral-800 dark:text-neutral-200">{totalStudents}</span>
          <span className="text-neutral-400">Total Registered</span>
        </div>
      </div>

      {/* Stacked Proportional Bar */}
      <div className="space-y-2 mb-6">
        <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            className="bg-emerald-500 h-full transition-all duration-700"
            style={{ width: `${verifiedPct}%` }}
            title={`Verified: ${verifiedStudents} (${verifiedPct}%)`}
          />
          <div
            className="bg-amber-400 h-full transition-all duration-700"
            style={{ width: `${pendingPct}%` }}
            title={`Eligible Pending: ${eligiblePending} (${pendingPct}%)`}
          />
          <div
            className="bg-rose-400 h-full transition-all duration-700"
            style={{ width: `${ineligiblePct}%` }}
            title={`Ineligible: ${ineligibleStudents} (${ineligiblePct}%)`}
          />
        </div>
        <div className="flex justify-between text-[11px] text-neutral-400">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Metric Cards Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Verified */}
        <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Verified & Cleared
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {verifiedStudents}
            </span>
            <span className="text-xs text-emerald-600/70 font-mono">
              ({verifiedPct}%)
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Logistics pass & QR letters issued
          </p>
        </div>

        {/* Pending Review */}
        <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Eligible Awaiting
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {eligiblePending}
            </span>
            <span className="text-xs text-amber-600/70 font-mono">
              ({pendingPct}%)
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Year 4+ completed 3rd year ready
          </p>
        </div>

        {/* Ineligible */}
        <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">
              Ineligible (Year &lt; 4)
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {ineligibleStudents}
            </span>
            <span className="text-xs text-rose-600/70 font-mono">
              ({ineligiblePct}%)
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            Must complete 3rd year first
          </p>
        </div>
      </div>
    </div>
  )
}
