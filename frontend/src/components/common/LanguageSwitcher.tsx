import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { setApiLanguage } from '@/services/api'

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'toggle'
  className?: string
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'dropdown',
  className = '',
}) => {
  const { i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Normalize language code to 'en' or 'am'
  const currentLang = i18n.language?.startsWith('am') ? 'am' : 'en'

  const handleLanguageChange = (lang: 'en' | 'am') => {
    i18n.changeLanguage(lang)
    document.documentElement.lang = lang
    setApiLanguage(lang)
    setIsOpen(false)
  }

  // Ensure Accept-Language header is synced on mount
  useEffect(() => {
    setApiLanguage(currentLang)
    document.documentElement.lang = currentLang
  }, [currentLang])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (variant === 'toggle') {
    return (
      <div
        className={`inline-flex items-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 p-1 border border-neutral-200/80 dark:border-neutral-700/80 text-xs font-bold ${className}`}
      >
        <button
          type="button"
          onClick={() => handleLanguageChange('en')}
          className={`px-2.5 py-1.5 rounded-xl transition-all duration-200 ${
            currentLang === 'en'
              ? 'bg-white dark:bg-neutral-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
          aria-label="Switch to English"
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => handleLanguageChange('am')}
          className={`px-2.5 py-1.5 rounded-xl transition-all duration-200 ${
            currentLang === 'am'
              ? 'bg-white dark:bg-neutral-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
          style={{ fontFamily: "'Noto Sans Ethiopic', sans-serif" }}
          aria-label="Switch to Amharic"
        >
          አማ
        </button>
      </div>
    )
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-800/80 hover:bg-primary-50 dark:hover:bg-neutral-700/80 text-neutral-700 dark:text-neutral-200 shadow-sm hover:scale-105 transition-all duration-200"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Language selector"
      >
        <Globe className="w-3.5 h-3.5 text-primary-500" />
        <span
          style={currentLang === 'am' ? { fontFamily: "'Noto Sans Ethiopic', sans-serif" } : undefined}
        >
          {currentLang === 'am' ? 'አማ' : 'EN'}
        </span>
        <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 shadow-soft py-1.5 z-50 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => handleLanguageChange('en')}
            className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium transition-colors ${
              currentLang === 'en'
                ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-bold'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
            }`}
          >
            <span>English (EN)</span>
            {currentLang === 'en' && <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />}
          </button>
          <button
            type="button"
            onClick={() => handleLanguageChange('am')}
            className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium transition-colors ${
              currentLang === 'am'
                ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-bold'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
            }`}
            style={{ fontFamily: "'Noto Sans Ethiopic', sans-serif" }}
          >
            <span>አማርኛ (አማ)</span>
            {currentLang === 'am' && <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />}
          </button>
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
