import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks further clicks. */
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 border-transparent',
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 border-slate-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 active:bg-red-100 border-red-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200 border-transparent',
}

// Touch targets stay at or above 44px even at the smallest size — reception
// works on tablets, often standing up (spec §36).
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-12 px-4 text-base gap-2',
  lg: 'min-h-14 px-6 text-lg gap-2.5',
  xl: 'min-h-16 px-8 text-xl gap-3',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      // Disabling while loading is the first line of defence against a
      // double-submitted registration (spec §20).
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-xl border font-semibold',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
