import * as React from 'react'

import { cn } from '@/lib/utils'

type SmoothScrollAreaProps = React.ComponentProps<'div'> & {
  contentClassName?: string
}

function SmoothScrollArea({
  className,
  contentClassName,
  children,
  ...props
}: SmoothScrollAreaProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const frameRef = React.useRef<number | null>(null)
  const targetScrollTopRef = React.useRef(0)

  const animate = React.useCallback((): void => {
    const el = containerRef.current
    if (!el) {
      frameRef.current = null
      return
    }

    const current = el.scrollTop
    const target = targetScrollTopRef.current
    const delta = target - current

    if (Math.abs(delta) < 0.5) {
      el.scrollTop = target
      frameRef.current = null
      return
    }

    el.scrollTop = current + delta * 0.16
    frameRef.current = window.requestAnimationFrame(animate)
  }, [])

  const startAnimation = React.useCallback((): void => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(animate)
  }, [animate])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    targetScrollTopRef.current = el.scrollTop

    const onWheel = (event: WheelEvent): void => {
      const max = el.scrollHeight - el.clientHeight
      if (max <= 0) return

      const next = Math.min(max, Math.max(0, targetScrollTopRef.current + event.deltaY))
      if (next === targetScrollTopRef.current) return

      event.preventDefault()
      targetScrollTopRef.current = next
      startAnimation()
    }

    const onScroll = (): void => {
      if (frameRef.current === null) {
        targetScrollTopRef.current = el.scrollTop
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [startAnimation])

  return (
    <div
      ref={containerRef}
      data-slot="smooth-scroll-area"
      className={cn(
        'overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:auto]',
        className
      )}
      {...props}
    >
      <div data-slot="smooth-scroll-content" className={cn('min-h-full', contentClassName)}>
        {children}
      </div>
    </div>
  )
}

export { SmoothScrollArea }
