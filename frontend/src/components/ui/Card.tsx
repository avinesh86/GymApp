import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  padding?: boolean
}

export function Card({ children, className = '', onClick, padding = true }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-lg border border-gray-100 shadow-sm',
        padding ? 'p-4' : '',
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow duration-150' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: React.ReactNode
  className?: string
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`border-b border-gray-100 pb-3 mb-4 ${className}`}>
      {children}
    </div>
  )
}
