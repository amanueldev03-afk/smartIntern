import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import type { InternshipFilters } from '@/types/filters'
import {
  INTERNSHIP_TYPE_CHOICES,
  WORK_MODE_CHOICES,
  WORK_TYPE_CHOICES,
  COMPENSATION_TYPE_CHOICES,
} from '@/types/filters'

interface SearchFilterBarProps {
  filters: InternshipFilters
  onFiltersChange: (filters: InternshipFilters) => void
  isLoading?: boolean
}

export default function SearchFilterBar({ filters, onFiltersChange, isLoading }: SearchFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search || '')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    onFiltersChange({ ...filters, search: debouncedSearch || undefined })
  }, [debouncedSearch])

  const handleFilterChange = (key: keyof InternshipFilters, value: string | number | undefined) => {
    onFiltersChange({ ...filters, [key]: value || undefined })
  }

  const clearFilter = (key: keyof InternshipFilters) => {
    onFiltersChange({ ...filters, [key]: undefined })
  }

  const clearAllFilters = () => {
    setSearchInput('')
    onFiltersChange({})
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="card-gradient rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
      {/* Search Input */}
      <div>
        <label htmlFor="search" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
          Keyword Search
        </label>
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-neutral-400 absolute left-4 pointer-events-none" />
          <input
            id="search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by role title, company, technology stack..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-sm font-medium text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Internship Type */}
        <div>
          <label htmlFor="internship_type" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
            Internship Type
          </label>
          <select
            id="internship_type"
            value={filters.internship_type || ''}
            onChange={(e) => handleFilterChange('internship_type', e.target.value || undefined)}
            className="w-full px-3.5 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
            disabled={isLoading}
          >
            <option value="">All Types</option>
            {INTERNSHIP_TYPE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        {/* Work Mode */}
        <div>
          <label htmlFor="work_mode" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
            Work Mode
          </label>
          <select
            id="work_mode"
            value={filters.work_mode || ''}
            onChange={(e) => handleFilterChange('work_mode', e.target.value || undefined)}
            className="w-full px-3.5 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
            disabled={isLoading}
          >
            <option value="">All Modes</option>
            {WORK_MODE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        {/* Work Type */}
        <div>
          <label htmlFor="work_type" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
            Schedule
          </label>
          <select
            id="work_type"
            value={filters.work_type || ''}
            onChange={(e) => handleFilterChange('work_type', e.target.value || undefined)}
            className="w-full px-3.5 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
            disabled={isLoading}
          >
            <option value="">All Schedules</option>
            {WORK_TYPE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

        {/* Compensation Type */}
        <div>
          <label htmlFor="compensation_type" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
            Compensation
          </label>
          <select
            id="compensation_type"
            value={filters.compensation_type || ''}
            onChange={(e) => handleFilterChange('compensation_type', e.target.value || undefined)}
            className="w-full px-3.5 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:border-primary-500"
            disabled={isLoading}
          >
            <option value="">All</option>
            {COMPENSATION_TYPE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Additional Filters: Location & Skill */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="location" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
            Location
          </label>
          <input
            id="location"
            type="text"
            value={filters.location || ''}
            onChange={(e) => handleFilterChange('location', e.target.value || undefined)}
            placeholder="e.g., San Francisco, Berlin, Remote..."
            className="w-full px-3.5 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="skill" className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
            Required Skill
          </label>
          <input
            id="skill"
            type="text"
            value={filters.skill || ''}
            onChange={(e) => handleFilterChange('skill', e.target.value || undefined)}
            placeholder="e.g., Python, React, PyTorch..."
            className="w-full px-3.5 py-2.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border-2 border-neutral-200/80 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-primary-500"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Active Filter Chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilterCount > 0 && (
            <span className="text-xs font-bold text-neutral-400 mr-1">
              {activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}:
            </span>
          )}
          {filters.internship_type && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 text-xs rounded-xl font-bold">
              {INTERNSHIP_TYPE_CHOICES.find((c) => c.value === filters.internship_type)?.label}
              <button onClick={() => clearFilter('internship_type')} aria-label="Clear internship type filter">
                <X className="w-3.5 h-3.5 ml-0.5 hover:opacity-75" />
              </button>
            </span>
          )}
          {filters.work_mode && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 text-xs rounded-xl font-bold">
              {WORK_MODE_CHOICES.find((c) => c.value === filters.work_mode)?.label}
              <button onClick={() => clearFilter('work_mode')} aria-label="Clear work mode filter">
                <X className="w-3.5 h-3.5 ml-0.5 hover:opacity-75" />
              </button>
            </span>
          )}
          {filters.work_type && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 text-xs rounded-xl font-bold">
              {WORK_TYPE_CHOICES.find((c) => c.value === filters.work_type)?.label}
              <button onClick={() => clearFilter('work_type')} aria-label="Clear work type filter">
                <X className="w-3.5 h-3.5 ml-0.5 hover:opacity-75" />
              </button>
            </span>
          )}
          {filters.compensation_type && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 text-xs rounded-xl font-bold">
              {COMPENSATION_TYPE_CHOICES.find((c) => c.value === filters.compensation_type)?.label}
              <button onClick={() => clearFilter('compensation_type')} aria-label="Clear compensation type filter">
                <X className="w-3.5 h-3.5 ml-0.5 hover:opacity-75" />
              </button>
            </span>
          )}
          {filters.location && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary-500/10 text-secondary-700 dark:text-secondary-300 border border-secondary-500/20 text-xs rounded-xl font-bold">
              Location: {filters.location}
              <button onClick={() => clearFilter('location')} aria-label="Clear location filter">
                <X className="w-3.5 h-3.5 ml-0.5 hover:opacity-75" />
              </button>
            </span>
          )}
          {filters.skill && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs rounded-xl font-bold">
              Skill: {filters.skill}
              <button onClick={() => clearFilter('skill')} aria-label="Clear skill filter">
                <X className="w-3.5 h-3.5 ml-0.5 hover:opacity-75" />
              </button>
            </span>
          )}
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
            disabled={isLoading}
          >
            Clear All Filters
          </button>
        )}
      </div>
    </div>
  )
}
