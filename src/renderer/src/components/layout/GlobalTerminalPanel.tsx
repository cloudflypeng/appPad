import { useEffect, useRef, useState } from 'react'
import { Minimize2, TerminalSquare } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Button } from '@/components/ui/button'
import { getGlobalTerminalEvents, type TerminalExecResult } from '@/lib/globalTerminal'

const OUTPUT_PAUSE_WATERMARK = 512 * 1024
const OUTPUT_RESUME_WATERMARK = 128 * 1024
const EXEC_BEGIN_MARKER_PREFIX = '__APPPAD_EXEC_BEGIN__'
const EXEC_DONE_MARKER_PREFIX = '__APPPAD_EXEC_DONE__'
const TERMINAL_EVENTS = getGlobalTerminalEvents()
const TERMINAL_SHELL_STORAGE_KEY = 'appPad.terminal.shell'

type TerminalShellChoice = 'zsh' | 'bash'

type ExecRequest = {
  requestId: string
  command: string
}

type ActiveExecState = {
  requestId: string
  beginMarker: string
  doneMarker: string
  started: boolean
  partial: string
  outputFilterPartial: string
  captured: string
}

function encodeBinaryToBase64(data: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(data)
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data, 'binary').toString('base64')
  }
  return ''
}

function getMarkerTailLength(input: string, marker: string): number {
  const upper = Math.min(input.length, marker.length - 1)
  for (let len = upper; len > 0; len -= 1) {
    if (input.endsWith(marker.slice(0, len))) return len
  }
  return 0
}

function findStandaloneMarkerLine(input: string, marker: string): number {
  let searchFrom = 0
  while (searchFrom < input.length) {
    const idx = input.indexOf(marker, searchFrom)
    if (idx === -1) return -1
    const prev = idx === 0 ? '' : input[idx - 1]
    const next = input[idx + marker.length] ?? ''
    const prevOk = prev === '' || prev === '\n' || prev === '\r'
    const nextOk = next === '' || next === '\n' || next === '\r'
    if (prevOk && nextOk) {
      return idx
    }
    searchFrom = idx + marker.length
  }
  return -1
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shouldFilterExecNoiseLine(line: string, beginMarker: string, doneMarker: string): boolean {
  const normalized = line.replace(/\r?\n$/, '')
  if (!normalized.trim()) return false
  if (normalized.includes('__apppad_exec_code=$?')) return true
  if (normalized.includes("printf '%s%s%s\\n'")) return true
  if (normalized.includes(beginMarker)) return true
  if (normalized.includes(doneMarker)) return true
  if (/^\s*%\s*$/.test(normalized)) return true
  if (/^\s*~\s*'\s*$/.test(normalized)) return true
  return false
}

function filterExecNoiseChunk(
  chunk: string,
  active: Pick<ActiveExecState, 'beginMarker' | 'doneMarker' | 'outputFilterPartial'>
): {
  visible: string
  partial: string
} {
  const combined = `${active.outputFilterPartial}${chunk}`
  let visible = ''
  let cursor = 0

  while (cursor < combined.length) {
    const nextLf = combined.indexOf('\n', cursor)
    if (nextLf === -1) break
    const lineWithLf = combined.slice(cursor, nextLf + 1)
    if (!shouldFilterExecNoiseLine(lineWithLf, active.beginMarker, active.doneMarker)) {
      visible += lineWithLf
    }
    cursor = nextLf + 1
  }

  return {
    visible,
    partial: combined.slice(cursor)
  }
}

function buildExecWrapper(command: string, beginMarker: string, doneMarker: string): string {
  const normalizedCommand = command.endsWith('\n') ? command : `${command}\n`
  return `printf '%s\\n' '${beginMarker}'\n${normalizedCommand}__apppad_exec_code=$?\nprintf '%s%s%s\\n' '${doneMarker}' "$__apppad_exec_code" '__'\n`
}

function getInitialTerminalShell(): TerminalShellChoice {
  if (typeof window === 'undefined') return 'zsh'
  const stored = window.localStorage.getItem(TERMINAL_SHELL_STORAGE_KEY)
  return stored === 'bash' ? 'bash' : 'zsh'
}

function toShellPath(shell: TerminalShellChoice): string {
  return shell === 'bash' ? '/bin/bash' : '/bin/zsh'
}

function GlobalTerminalPanel(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [selectedShell, setSelectedShell] = useState<TerminalShellChoice>(() => getInitialTerminalShell())

  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<number | null>(null)
  const selectedShellRef = useRef<TerminalShellChoice>(selectedShell)
  const recreateSessionRef = useRef<(() => Promise<void>) | null>(null)
  const suppressNextExitRef = useRef(false)
  const creatingSessionRef = useRef(false)
  const pumpingOutputRef = useRef(false)
  const flowPausedRef = useRef(false)
  const pendingOutputRef = useRef<string[]>([])
  const pendingBytesRef = useRef(0)
  const execQueueRef = useRef<ExecRequest[]>([])
  const activeExecRef = useRef<ActiveExecState | null>(null)
  const suppressNextPromptRef = useRef(false)
  const sessionJustStartedRef = useRef(false)
  const userInteractedRef = useRef(false)

  const openPanel = (): void => {
    setExpanded(true)
    setTimeout(() => {
      fitRef.current?.fit()
      const sessionId = sessionIdRef.current
      const dims = fitRef.current?.proposeDimensions()
      if (sessionId && dims) {
        void window.api.resizeTerminalSession(sessionId, dims.cols, dims.rows)
      }
      termRef.current?.focus()
    }, 220)
  }

  useEffect(() => {
    selectedShellRef.current = selectedShell
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TERMINAL_SHELL_STORAGE_KEY, selectedShell)
    }
  }, [selectedShell])

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: '#0b1020',
        foreground: '#e6edf3'
      }
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()
    term.focus()

    termRef.current = term
    fitRef.current = fit

    const dispatchExecResult = (requestId: string, result: TerminalExecResult): void => {
      window.dispatchEvent(
        new CustomEvent<{ requestId: string; result: TerminalExecResult }>(TERMINAL_EVENTS.execResultEvent, {
          detail: { requestId, result }
        })
      )
    }

    const failPendingExecRequests = (message: string): void => {
      if (activeExecRef.current) {
        const active = activeExecRef.current
        activeExecRef.current = null
        dispatchExecResult(active.requestId, {
          success: false,
          code: null,
          stdout: active.captured,
          stderr: '',
          error: message
        })
      }

      while (execQueueRef.current.length > 0) {
        const queued = execQueueRef.current.shift()
        if (!queued) continue
        dispatchExecResult(queued.requestId, {
          success: false,
          code: null,
          stdout: '',
          stderr: '',
          error: message
        })
      }
    }

    const setFlowPaused = async (paused: boolean): Promise<void> => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      if (flowPausedRef.current === paused) return
      const result = await window.api.setTerminalSessionFlowControl(sessionId, paused)
      if (result.success) {
        flowPausedRef.current = paused
      }
    }

    const pumpOutput = (): void => {
      if (pumpingOutputRef.current || !termRef.current) return
      pumpingOutputRef.current = true
      const writeNext = (): void => {
        if (!termRef.current) {
          pumpingOutputRef.current = false
          return
        }
        const chunk = pendingOutputRef.current.shift()
        if (!chunk) {
          pumpingOutputRef.current = false
          if (flowPausedRef.current && pendingBytesRef.current <= OUTPUT_RESUME_WATERMARK) {
            void setFlowPaused(false)
          }
          return
        }
        pendingBytesRef.current = Math.max(0, pendingBytesRef.current - chunk.length)
        termRef.current.write(chunk, () => {
          if (flowPausedRef.current && pendingBytesRef.current <= OUTPUT_RESUME_WATERMARK) {
            void setFlowPaused(false)
          }
          writeNext()
        })
      }
      writeNext()
    }

    const enqueueOutput = (data: string): void => {
      if (!data) return
      pendingOutputRef.current.push(data)
      pendingBytesRef.current += data.length
      if (!flowPausedRef.current && pendingBytesRef.current >= OUTPUT_PAUSE_WATERMARK) {
        void setFlowPaused(true)
      }
      pumpOutput()
    }

    const syncPtySize = async (): Promise<void> => {
      fit.fit()
      const sessionId = sessionIdRef.current
      const dims = fit.proposeDimensions()
      if (!sessionId || !dims) return
      await window.api.resizeTerminalSession(sessionId, dims.cols, dims.rows)
    }

    const ensureSession = async (): Promise<void> => {
      if (sessionIdRef.current || creatingSessionRef.current) return
      creatingSessionRef.current = true
      try {
        const result = await window.api.createTerminalSession({
          shell: toShellPath(selectedShellRef.current)
        })
        sessionIdRef.current = result.sessionId
        sessionJustStartedRef.current = true
        userInteractedRef.current = false
        flowPausedRef.current = false
        setSessionReady(true)
        await syncPtySize()
        term.focus()
      } catch (error) {
        setSessionReady(false)
        enqueueOutput(`${error instanceof Error ? error.message : 'failed to start terminal session'}\r\n`)
      } finally {
        creatingSessionRef.current = false
      }
    }

    const processExecOutput = (incoming: string): string => {
      const active = activeExecRef.current
      if (!active) return incoming

      const combined = `${active.partial}${incoming}`
      if (!active.started) {
        const beginIndex = findStandaloneMarkerLine(combined, active.beginMarker)
        if (beginIndex === -1) {
          const keepLen = Math.max(getMarkerTailLength(combined, active.beginMarker), active.beginMarker.length)
          active.partial = combined.slice(Math.max(0, combined.length - keepLen))
          return ''
        }
        active.started = true
        active.partial = ''
        const afterBeginRaw = combined.slice(beginIndex + active.beginMarker.length)
        const afterBegin =
          afterBeginRaw.startsWith('\r\n')
            ? afterBeginRaw.slice(2)
            : afterBeginRaw.startsWith('\n')
              ? afterBeginRaw.slice(1)
              : afterBeginRaw
        return processExecOutput(afterBegin)
      }

      const donePattern = new RegExp(`(?:^|\\r?\\n)${escapeRegExp(active.doneMarker)}(-?\\d+)__`)
      const doneMatch = donePattern.exec(combined)
      if (!doneMatch) {
        const keepLen = getMarkerTailLength(combined, active.doneMarker)
        const rawVisible = combined.slice(0, combined.length - keepLen)
        const filtered = filterExecNoiseChunk(rawVisible, active)
        active.partial = combined.slice(combined.length - keepLen)
        active.outputFilterPartial = filtered.partial
        active.captured += filtered.visible
        return filtered.visible
      }

      const markerIndex = combined.indexOf(active.doneMarker, doneMatch.index)
      const parsedCode = Number.parseInt(doneMatch[1] ?? '1', 10)
      const markerSuffixLength = active.doneMarker.length + String(doneMatch[1] ?? '').length + 2

      const rawVisibleBefore = combined.slice(0, markerIndex)
      const filteredBefore = filterExecNoiseChunk(rawVisibleBefore, active)
      active.outputFilterPartial = filteredBefore.partial
      active.captured += filteredBefore.visible
      if (
        active.outputFilterPartial &&
        !shouldFilterExecNoiseLine(active.outputFilterPartial, active.beginMarker, active.doneMarker)
      ) {
        active.captured += active.outputFilterPartial
      }
      active.outputFilterPartial = ''

      const exitCode = Number.isNaN(parsedCode) ? 1 : parsedCode
      const requestId = active.requestId
      const stdout = active.captured

      activeExecRef.current = null

      if (exitCode === 0) {
        dispatchExecResult(requestId, {
          success: true,
          code: 0,
          stdout,
          stderr: ''
        })
      } else {
        const errorMessage = `Command exited with code ${exitCode}.`
        dispatchExecResult(requestId, {
          success: false,
          code: exitCode,
          stdout,
          stderr: errorMessage,
          error: errorMessage
        })
      }

      suppressNextPromptRef.current = true
      void startNextExec()
      return filteredBefore.visible + combined.slice(markerIndex + markerSuffixLength)
    }

    const stripPostExecPromptNoise = (output: string): string => {
      if (!suppressNextPromptRef.current || !output) return output

      if (/^(?:\r?\n)*\s*%\s*$/.test(output) || /^(?:\r?\n)*\s*~\s*'\s*$/.test(output)) {
        suppressNextPromptRef.current = false
        return ''
      }

      const promptWithNewline = output.match(/^(?:\r?\n)*\s*%\s*(\r?\n)/)
      if (promptWithNewline) {
        suppressNextPromptRef.current = false
        return output.slice(promptWithNewline[0].length)
      }

      if (/\S/.test(output)) {
        suppressNextPromptRef.current = false
      }

      return output
    }

    const stripInitialPromptNoise = (output: string): string => {
      if (!output) return output
      if (!sessionJustStartedRef.current || userInteractedRef.current) return output

      const promptOnly = output.match(/^(?:\r?\n)*\s*%\s*(?:\r?\n)?$/)
      if (promptOnly) {
        return ''
      }

      const leadingPromptWithNewline = output.match(/^(?:\r?\n)*\s*%\s*(\r?\n)/)
      if (leadingPromptWithNewline) {
        sessionJustStartedRef.current = false
        return output.slice(leadingPromptWithNewline[0].length)
      }

      if (/\S/.test(output)) {
        sessionJustStartedRef.current = false
      }
      return output
    }

    const startNextExec = async (): Promise<void> => {
      if (activeExecRef.current) return
      if (execQueueRef.current.length === 0) return

      await ensureSession()
      const sessionId = sessionIdRef.current
      if (!sessionId) {
        failPendingExecRequests('Unable to create terminal session.')
        return
      }

      const next = execQueueRef.current.shift()
      if (!next) return

      const beginMarker = `${EXEC_BEGIN_MARKER_PREFIX}${next.requestId}__`
      const doneMarker = `${EXEC_DONE_MARKER_PREFIX}${next.requestId}_`
      activeExecRef.current = {
        requestId: next.requestId,
        beginMarker,
        doneMarker,
        started: false,
        partial: '',
        outputFilterPartial: '',
        captured: ''
      }

      const wrapper = buildExecWrapper(next.command, beginMarker, doneMarker)
      const writeResult = await window.api.writeTerminalSession(sessionId, wrapper)
      if (!writeResult.success) {
        activeExecRef.current = null
        dispatchExecResult(next.requestId, {
          success: false,
          code: null,
          stdout: '',
          stderr: '',
          error: 'Failed to write command to terminal session.'
        })
        void startNextExec()
      }
    }

    const recreateSession = async (): Promise<void> => {
      if (sessionIdRef.current) {
        suppressNextExitRef.current = true
        if (flowPausedRef.current) {
          await window.api.setTerminalSessionFlowControl(sessionIdRef.current, false)
        }
        await window.api.closeTerminalSession(sessionIdRef.current)
        sessionIdRef.current = null
        flowPausedRef.current = false
        setSessionReady(false)
        suppressNextExitRef.current = false
      }
      await ensureSession()
    }

    recreateSessionRef.current = recreateSession

    void ensureSession()

    const disposeData = term.onData((data) => {
      if (data.length > 0) {
        userInteractedRef.current = true
        sessionJustStartedRef.current = false
      }
      const sessionId = sessionIdRef.current
      if (!sessionId) {
        if (data === '\r') {
          term.writeln('')
          void ensureSession()
        }
        return
      }
      void window.api.writeTerminalSession(sessionId, data)
    })

    const disposeBinary = term.onBinary((data) => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      const dataBase64 = encodeBinaryToBase64(data)
      if (!dataBase64) return
      void window.api.writeTerminalSessionBinary(sessionId, dataBase64)
    })

    const unsubscribeTerminalData = window.api.onTerminalData((payload) => {
      if (payload.sessionId !== sessionIdRef.current || !termRef.current) return
      const visibleOutput = stripInitialPromptNoise(
        stripPostExecPromptNoise(processExecOutput(payload.data))
      )
      if (visibleOutput.length > 0) {
        enqueueOutput(visibleOutput)
      }
    })

    const unsubscribeTerminalExit = window.api.onTerminalExit((payload) => {
      if (payload.sessionId !== sessionIdRef.current || !termRef.current) return
      sessionIdRef.current = null
      flowPausedRef.current = false
      setSessionReady(false)
      if (suppressNextExitRef.current) {
        suppressNextExitRef.current = false
        return
      }
      failPendingExecRequests(`Terminal session exited (${payload.code ?? 'unknown'}).`)
      enqueueOutput(`\r\n[terminal exited (${payload.code ?? 'unknown'})]\r\nPress Enter to restart shell session.\r\n`)
    })

    const resizeHandler = (): void => {
      void syncPtySize()
    }

    const appendHandler = (event: Event): void => {
      const custom = event as CustomEvent<string>
      if (!custom.detail || !termRef.current) return
      setExpanded(true)
      const normalized = custom.detail.replace(/\r?\n/g, '\r\n')
      enqueueOutput(normalized.endsWith('\r\n') ? normalized : `${normalized}\r\n`)
    }

    const execHandler = (event: Event): void => {
      const custom = event as CustomEvent<ExecRequest>
      const payload = custom.detail
      if (!payload?.requestId || !payload.command) return
      setExpanded(true)
      execQueueRef.current.push(payload)
      void startNextExec()
    }

    const openHandler = (): void => {
      openPanel()
    }

    const resizeObserver = new ResizeObserver(() => {
      void syncPtySize()
    })
    resizeObserver.observe(containerRef.current)

    window.addEventListener(TERMINAL_EVENTS.appendEvent, appendHandler as EventListener)
    window.addEventListener(TERMINAL_EVENTS.openEvent, openHandler as EventListener)
    window.addEventListener(TERMINAL_EVENTS.execEvent, execHandler as EventListener)
    window.addEventListener('resize', resizeHandler)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener(TERMINAL_EVENTS.appendEvent, appendHandler as EventListener)
      window.removeEventListener(TERMINAL_EVENTS.openEvent, openHandler as EventListener)
      window.removeEventListener(TERMINAL_EVENTS.execEvent, execHandler as EventListener)
      window.removeEventListener('resize', resizeHandler)
      unsubscribeTerminalData()
      unsubscribeTerminalExit()
      disposeBinary.dispose()
      failPendingExecRequests('Terminal panel was disposed before command completion.')
      recreateSessionRef.current = null
      if (sessionIdRef.current) {
        if (flowPausedRef.current) {
          void window.api.setTerminalSessionFlowControl(sessionIdRef.current, false)
        }
        void window.api.closeTerminalSession(sessionIdRef.current)
        sessionIdRef.current = null
      }
      flowPausedRef.current = false
      pumpingOutputRef.current = false
      pendingOutputRef.current = []
      pendingBytesRef.current = 0
      setSessionReady(false)
      disposeData.dispose()
      fit.dispose()
      term.dispose()
      fitRef.current = null
      termRef.current = null
    }
  }, [])

  const switchTerminalShell = (shell: TerminalShellChoice): void => {
    if (shell === selectedShell) return
    setSelectedShell(shell)
    if (recreateSessionRef.current) {
      void recreateSessionRef.current()
    }
  }

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
              <span>{sessionReady ? 'Terminal' : 'Starting shell...'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                role="radiogroup"
                aria-label="Terminal shell"
                className="flex items-center gap-1 rounded-md border border-white/25 bg-[#121a2f] p-0.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedShell === 'zsh'}
                  onClick={() => switchTerminalShell('zsh')}
                  className={`h-6 rounded px-2 text-xs ${
                    selectedShell === 'zsh'
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  zsh
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedShell === 'bash'}
                  onClick={() => switchTerminalShell('bash')}
                  className={`h-6 rounded px-2 text-xs ${
                    selectedShell === 'bash'
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  bash
                </button>
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
