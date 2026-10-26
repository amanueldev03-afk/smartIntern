import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface AccessibilityContextType {
  isLargeText: boolean
  toggleLargeText: () => void
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined)

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [isLargeText, setIsLargeText] = useState<boolean>(() => {
    return localStorage.getItem('accessibility_large_text') === 'true'
  })

  useEffect(() => {
    const root = document.documentElement
    if (isLargeText) {
      root.classList.add('large-text')
    } else {
      root.classList.remove('large-text')
    }
    localStorage.setItem('accessibility_large_text', String(isLargeText))
  }, [isLargeText])

  const toggleLargeText = () => {
    setIsLargeText((prev) => !prev)
  }

  return (
    <AccessibilityContext.Provider value={{ isLargeText, toggleLargeText }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useLargeText() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    const isLarge = typeof document !== 'undefined' && document.documentElement.classList.contains('large-text')
    return {
      isLargeText: isLarge,
      toggleLargeText: () => {
        if (typeof document !== 'undefined') {
          const root = document.documentElement
          const next = !root.classList.contains('large-text')
          root.classList.toggle('large-text', next)
          localStorage.setItem('accessibility_large_text', String(next))
        }
      },
    }
  }
  return context
}
