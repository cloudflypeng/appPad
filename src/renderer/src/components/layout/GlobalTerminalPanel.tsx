import { useEffect, useRef, useState } from 'react'
import { Minimize2, TerminalSquare } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Button } from '@/components/ui/button'
import { getGlobalTerminalEvents } from '@/lib/globalTerminal'

const PROMPT = '$ '

function GlobalTerminalPanel(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [running, setRunning] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const inputRef = useRef('')
  const runningRef = useRef(false)
  const openPanel = (): void => {
    setExpanded(true)
    setTimeout(() => fitRef.current?.fit(), 220)
  }

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0b1020',
        foreground: '#e6edf3'
      }
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    term.writeln('Global terminal ready.')
    term.write(PROMPT)

    const runCommand = async (command: string): Promise<void> => {
      setExpanded(true)
      setRunning(true)
      runningRef.current = true
      try {
        const result = await window.api.executeTerminalCommand(command)
        if (result.stdout.length > 0) term.writeln(result.stdout)
        if (result.stderr.length > 0) term.writeln(result.stderr)
        if (!result.success) {
          term.writeln(`[exit ${result.code ?? 'unknown'}] ${result.error ?? 'command failed'}`)
        } else if (result.stdout.length === 0 && result.stderr.length === 0) {
          term.writeln('[exit 0] command completed with no output')
        }
      } catch (error) {
        term.writeln(error instanceof Error ? error.message : 'command execution failed')
      } finally {
        runningRef.current = false
        setRunning(false)
        inputRef.current = ''
        term.write(PROMPT)
      }
    }

    const disposeData = term.onData((data) => {
      if (runningRef.current) return

      if (data === '\r') {
        term.write('\r\n')
        const command = inputRef.current.trim()
        if (!command) {
          term.write(PROMPT)
          return
        }
        void runCommand(command)
        return
      }

      if (data === '\u007f') {
        if (inputRef.current.length > 0) {
          inputRef.current = inputRef.current.slice(0, -1)
          term.write('\b \b')
        }
        return
      }

      if (data >= ' ') {
        inputRef.current += data
        term.write(data)
      }
    })

    const resizeHandler = (): void => {
      fitRef.current?.fit()
    }

    const events = getGlobalTerminalEvents()

    const appendHandler = (event: Event): void => {
      const custom = event as CustomEvent<string>
      if (!custom.detail || !termRef.current) return
      setExpanded(true)
      const normalized = custom.detail.replace(/\r?\n/g, '\r\n')
      termRef.current.write(normalized)
      if (!normalized.endsWith('\r\n')) {
        termRef.current.write('\r\n')
      }
    }

    const openHandler = (): void => {
      openPanel()
    }

    window.addEventListener(events.appendEvent, appendHandler as EventListener)
    window.addEventListener(events.openEvent, openHandler as EventListener)
    window.addEventListener('resize', resizeHandler)

    return () => {
      window.removeEventListener(events.appendEvent, appendHandler as EventListener)
      window.removeEventListener(events.openEvent, openHandler as EventListener)
      window.removeEventListener('resize', resizeHandler)
      disposeData.dispose()
      fit.dispose()
      term.dispose()
      fitRef.current = null
      termRef.current = null
    }
  }, [])

  return (
    <>
      {!expanded ? (
        <Button
          size="icon"
          className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full shadow-lg"
          onClick={openPanel}
          title="Open terminal"
        >
          <TerminalSquare className="h-4 w-4" />
        </Button>
      ) : null}
      <aside
        className={`fixed bottom-4 right-4 z-50 w-[min(560px,calc(100vw-2rem))] transition-transform duration-300 ease-out ${
          expanded ? 'translate-x-0' : 'translate-x-[calc(100%+2rem)]'
        }`}
      >
        <div className="overflow-hidden rounded-xl border bg-[#0b1020] shadow-2xl">
          <div className="flex h-10 items-center justify-between border-b border-white/10 px-3 text-white/90">
            <div className="flex items-center gap-2 text-sm">
              <TerminalSquare className="h-4 w-4" />
              <span>{running ? 'Running command...' : 'Terminal'}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => setExpanded(false)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-2">
            <div
              ref={containerRef}
              className="h-72 w-full overflow-hidden"
              onClick={() => termRef.current?.focus()}
            />
          </div>
        </div>
      </aside>
    </>
  )
}

export default GlobalTerminalPanel
