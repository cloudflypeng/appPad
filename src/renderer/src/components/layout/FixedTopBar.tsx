import { useEffect, useState, type RefObject } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'

type FixedTopBarProps = {
  title: string
  description?: string
  containerRef: RefObject<HTMLDivElement | null>
}

function FixedTopBar({
  title,
  description,
  containerRef
}: FixedTopBarProps): React.JSX.Element {
  const [rect, setRect] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useEffect(() => {
    const updateRect = (): void => {
      const target = containerRef.current
      if (!target) return
      const next = target.getBoundingClientRect()
      setRect((prev) => {
        if (prev.left === next.left && prev.width === next.width) {
          return prev
        }
        return { left: next.left, width: next.width }
      })
    }

    updateRect()

    const target = containerRef.current
    const resizeObserver = new ResizeObserver(() => {
      updateRect()
    })

    if (target) {
      resizeObserver.observe(target)
    }

    window.addEventListener('resize', updateRect)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateRect)
    }
  }, [containerRef])

  return (
    <header
      className="fixed top-0 z-40 flex h-20 w-full items-center justify-between px-6 bg-background/80 backdrop-blur md:px-8 select-none"
      style={{ left: rect.left, width: rect.width }}
    >
      <div className="flex items-center">
        <SidebarTrigger />
        <div className="ml-4">
          <h1 className="text-sm font-medium leading-tight">{title}</h1>
          {description ? (
            <p className="text-xs text-muted-foreground leading-tight">{description}</p>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default FixedTopBar
