import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent/85 animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
