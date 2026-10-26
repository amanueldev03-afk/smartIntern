import { useEffect, useRef, useState } from 'react'

export interface SearchableOption {
  value: string | number
  label: string
  description?: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string | number
  onChange: (value: string | number) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  name?: string
  id?: string
  ariaLabel?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search and select...',
  disabled = false,
  error,
  id,
  ariaLabel = 'Searchable select',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query.toLowerCase()) ||
      (opt.description && opt.description.toLowerCase().includes(query.toLowerCase()))
  )

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        )
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        )
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].value)
          setIsOpen(false)
          setQuery('')
          setHighlightedIndex(-1)
        }
        break
      }
      case 'Escape': {
        e.preventDefault()
        setIsOpen(false)
        setQuery('')
        setHighlightedIndex(-1)
        break
      }
      default:
        break
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    setHighlightedIndex(-1)
    if (!isOpen) setIsOpen(true)
  }

  const handleSelect = (option: SearchableOption) => {
    onChange(option.value)
    setIsOpen(false)
    setQuery('')
    setHighlightedIndex(-1)
  }

  const selectedOption = options.find((o) => o.value === value)
  const displayValue = selectedOption?.label ?? (value as string) ?? ''

  const inputClass =
    'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 ' +
    'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none ' +
    'bg-white disabled:opacity-60 disabled:cursor-not-allowed ' +
    (error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300')

  return (
    <div className="relative" ref={menuRef}>
      <div
        className={inputClass}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-listbox` : undefined}
        aria-activedescendant={
          highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined
        }
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          value={query || (isOpen ? '' : displayValue)}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          disabled={disabled}
          placeholder={isOpen ? placeholder : ''}
          readOnly={!isOpen}
          className="bg-transparent border-0 outline-none w-full text-sm text-gray-900"
          aria-autocomplete="list"
        />
      </div>

      {isOpen && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No matching options</div>
          ) : (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                onClick={() => handleSelect(option)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  index === highlightedIndex
                    ? 'bg-indigo-100 text-indigo-900'
                    : 'text-gray-900 hover:bg-gray-100'
                }`}
              >
                <span className="font-medium">{option.label}</span>
                {option.description && (
                  <span className="ml-2 text-xs text-gray-500">({option.description})</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}