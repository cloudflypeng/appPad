export type TerminalExecResult = {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: string
}

const APP_TERMINAL_APPEND_EVENT = 'app:terminal-append'
const APP_TERMINAL_OPEN_EVENT = 'app:terminal-open'
const APP_TERMINAL_EXEC_EVENT = 'app:terminal-exec'
const APP_TERMINAL_EXEC_RESULT_EVENT = 'app:terminal-exec-result'
const APP_TERMINAL_READY_EVENT = 'app:terminal-ready'
const APP_TERMINAL_DISPOSED_EVENT = 'app:terminal-disposed'

type TerminalExecRequest = {
  requestId: string
  command: string
}

type TerminalExecResponse = {
  requestId: string
  result: TerminalExecResult
}

let nextExecRequestId = 1
let resultListenerBound = false
let terminalStateListenerBound = false
let terminalReady = false
const queuedExecDispatches = new Map<string, TerminalExecRequest>()
const pendingExecRequests = new Map<
  string,
  {
    resolve: (result: TerminalExecResult) => void
    timeoutId: number
  }
>()

function dispatchExecRequest(payload: TerminalExecRequest): void {
  window.dispatchEvent(new CustomEvent<TerminalExecRequest>(APP_TERMINAL_EXEC_EVENT, { detail: payload }))
}

function flushQueuedExecDispatches(): void {
  if (!terminalReady || queuedExecDispatches.size === 0) return
  for (const [requestId, payload] of queuedExecDispatches.entries()) {
    if (!pendingExecRequests.has(requestId)) {
      queuedExecDispatches.delete(requestId)
      continue
    }
    dispatchExecRequest(payload)
    queuedExecDispatches.delete(requestId)
  }
}

export function openGlobalTerminal(): void {
  window.dispatchEvent(new CustomEvent(APP_TERMINAL_OPEN_EVENT))
}

export function appendToGlobalTerminal(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(APP_TERMINAL_APPEND_EVENT, { detail: message }))
}

export function getGlobalTerminalEvents(): {
  appendEvent: string
  openEvent: string
  execEvent: string
  execResultEvent: string
  readyEvent: string
  disposedEvent: string
} {
  return {
    appendEvent: APP_TERMINAL_APPEND_EVENT,
    openEvent: APP_TERMINAL_OPEN_EVENT,
    execEvent: APP_TERMINAL_EXEC_EVENT,
    execResultEvent: APP_TERMINAL_EXEC_RESULT_EVENT,
    readyEvent: APP_TERMINAL_READY_EVENT,
    disposedEvent: APP_TERMINAL_DISPOSED_EVENT
  }
}

export async function executeWithGlobalTerminal(command: string): Promise<TerminalExecResult> {
  if (!resultListenerBound) {
    window.addEventListener(APP_TERMINAL_EXEC_RESULT_EVENT, (event: Event) => {
      const custom = event as CustomEvent<TerminalExecResponse>
      const payload = custom.detail
      if (!payload?.requestId) return
      const pending = pendingExecRequests.get(payload.requestId)
      if (!pending) return
      window.clearTimeout(pending.timeoutId)
      pendingExecRequests.delete(payload.requestId)
      pending.resolve(payload.result)
    })
    resultListenerBound = true
  }

  if (!terminalStateListenerBound) {
    window.addEventListener(APP_TERMINAL_READY_EVENT, () => {
      terminalReady = true
      flushQueuedExecDispatches()
    })
    window.addEventListener(APP_TERMINAL_DISPOSED_EVENT, () => {
      terminalReady = false
    })
    terminalStateListenerBound = true
  }

  openGlobalTerminal()

  const requestId = `exec-${Date.now()}-${nextExecRequestId++}`
  const timeoutMs = 1000 * 60 * 30

  return await new Promise<TerminalExecResult>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      pendingExecRequests.delete(requestId)
      queuedExecDispatches.delete(requestId)
      resolve({
        success: false,
        code: null,
        stdout: '',
        stderr: '',
        error: `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for terminal command completion.`
      })
    }, timeoutMs)

    pendingExecRequests.set(requestId, { resolve, timeoutId })

    const payload: TerminalExecRequest = { requestId, command }
    if (terminalReady) {
      dispatchExecRequest(payload)
    } else {
      queuedExecDispatches.set(requestId, payload)
    }
  })
}
