import type { ReactNode } from 'react'

export const inputClassName =
  'input-base w-full rounded-xl border-2 border-neutral-300 dark:border-neutral-700 px-4 py-2.5 text-sm text-neutral-900 dark:text-white ' +
  'placeholder-neutral-400 dark:placeholder-neutral-500 bg-white dark:bg-neutral-900 ' +
  'focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 ' +
  'transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-neutral-100 dark:disabled:bg-neutral-800'

const errorClassName =
  'input-base w-full rounded-xl border-2 border-error-300 dark:border-error-700 px-4 py-2.5 text-sm text-neutral-900 dark:text-white ' +
  'placeholder-neutral-400 dark:placeholder-neutral-500 bg-white dark:bg-neutral-900 ' +
  'focus:border-error-500 dark:focus:border-error-500 focus:outline-none focus:ring-2 focus:ring-error-500/20 ' +
  'transition-all duration-200'

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="card-gradient bg-white dark:bg-dark-card rounded-2xl shadow-glow border-2 border-neutral-200 dark:border-dark-border p-6 space-y-5 hover:shadow-medium transition-all duration-300">
      <div>
        <h3 className="text-base font-bold gradient-text dark:text-white">{title}</h3>
        {description && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 font-medium">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | undefined
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1 text-xs text-error-600 dark:text-error-400 font-semibold">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({
  id,
  name,
  type = 'text',
  value,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  id?: string
  name?: string
  type?: string
  value: string | number
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void
  error?: string | undefined
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={error ? errorClassName : inputClassName}
    />
  )
}

export function Select({
  id,
  name,
  value,
  onChange,
  error,
  disabled,
  options,
  placeholder,
}: {
  id?: string
  name?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  error?: string | undefined
  disabled?: boolean
  options: Array<{ value: string; label: string }>
  placeholder?: string
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={error ? errorClassName : inputClassName}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function TextArea({
  id,
  name,
  value,
  onChange,
  rows = 3,
  error,
  disabled,
}: {
  id?: string
  name?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  rows?: number
  error?: string | undefined
  disabled?: boolean
}) {
  return (
    <textarea
      id={id}
      name={name}
      rows={rows}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={error ? errorClassName : inputClassName}
    />
  )
}

export function ErrorBanner({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null
  return (
    <div role="alert" className="rounded-xl bg-error-50 dark:bg-error-900/20 p-4 border-2 border-error-200 dark:border-error-800 animate-scale-in">
      <ul className="list-disc list-inside space-y-1">
        {messages.map((message, idx) => (
          <li key={idx} className="text-sm text-error-700 dark:text-error-300 font-semibold">
            {message}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="status" className="rounded-xl bg-success-50 dark:bg-success-900/20 p-4 border-2 border-success-200 dark:border-success-800 animate-scale-in">
      <p className="text-sm text-success-700 dark:text-success-300 font-semibold">{message}</p>
    </div>
  )
}