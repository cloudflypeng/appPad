import type { CSSProperties } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'

type FixedTopBarProps = {
  title: string
  description?: string
}

function FixedTopBar({ title, description }: FixedTopBarProps): React.JSX.Element {
  return (
    <header
      className="sticky top-0 z-40 flex h-10 items-center justify-between border-b border-border/80 bg-background/92 px-3 shadow-[0_1px_0_hsl(var(--border)/0.85)] backdrop-blur-md transition-[padding] duration-300 md:px-5 md:peer-data-[state=collapsed]:pl-[4.5rem] select-none"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div
        className="flex min-w-0 items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <SidebarTrigger className="text-muted-foreground hover:text-foreground size-7 rounded-md border border-border/70 bg-background transition-[color,background-color,border-color] duration-200 hover:bg-accent" />
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold leading-none tracking-[0.01em]">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground hidden truncate pt-0.5 text-[11px] leading-none xl:block">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default FixedTopBar
