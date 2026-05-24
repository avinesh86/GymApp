import React from 'react'

type BadgeVariant =
  | 'green'
  | 'blue'
  | 'cyan'
  | 'orange'
  | 'red'
  | 'grey'
  | 'purple'
  | 'yellow'
  | 'darkred'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  dot?: boolean
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  green:   'bg-green-100 text-green-700',
  blue:    'bg-blue-100 text-blue-700',
  cyan:    'bg-cyan-100 text-cyan-700',
  orange:  'bg-orange-100 text-orange-700',
  red:     'bg-red-100 text-red-700',
  grey:    'bg-gray-100 text-gray-600',
  purple:  'bg-cyan-100 text-cyan-700',
  yellow:  'bg-yellow-100 text-yellow-700',
  darkred: 'bg-red-200 text-red-900',
}

const dotClasses: Record<BadgeVariant, string> = {
  green:   'bg-green-500',
  blue:    'bg-blue-500',
  cyan:    'bg-cyan-500',
  orange:  'bg-orange-500',
  red:     'bg-red-500',
  grey:    'bg-gray-400',
  purple:  'bg-cyan-500',
  yellow:  'bg-yellow-500',
  darkred: 'bg-red-700',
}

export function Badge({
  variant = 'grey',
  children,
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[variant]}`} />
      )}
      {children}
    </span>
  )
}
