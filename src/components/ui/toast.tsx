"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string
  message: string | React.ReactNode
  type?: 'success' | 'error' | 'info' | 'warning'
  onDismiss?: () => void
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ id, message, type = 'info', onDismiss, className, ...props }, ref) => {
    const typeStyles = {
      success: 'bg-green-500 text-white border-green-600',
      error: 'bg-destructive text-destructive-foreground border-destructive',
      info: 'bg-blue-500 text-white border-blue-600',
      warning: 'bg-yellow-500 text-white border-yellow-600',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all',
          typeStyles[type],
          className
        )}
        {...props}
      >
        <div className="flex-1 text-sm font-medium">{message}</div>
        <button
          className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none group-hover:opacity-100"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
)
Toast.displayName = "Toast"

export { Toast }
