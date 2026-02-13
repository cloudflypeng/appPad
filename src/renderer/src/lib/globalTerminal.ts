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
const pendingExecRequests = new Map<
  string,
  {
    resolve: (result: TerminalExecResult) => void
    timeoutId: number
  }
>()

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
} {
  return {
    appendEvent: APP_TERMINAL_APPEND_EVENT,
    openEvent: APP_TERMINAL_OPEN_EVENT,
    execEvent: APP_TERMINAL_EXEC_EVENT,
    execResultEvent: APP_TERMINAL_EXEC_RESULT_EVENT
  }
}

export async function executeWithGlobalTerminal(command: string): Promise<TerminalExecResult> {
  openGlobalTerminal()
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

  const requestId = `exec-${Date.now()}-${nextExecRequestId++}`
  const timeoutMs = 1000 * 60 * 60

  return await new Promise<TerminalExecResult>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      pendingExecRequests.delete(requestId)
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
    window.dispatchEvent(new CustomEvent<TerminalExecRequest>(APP_TERMINAL_EXEC_EVENT, { detail: payload }))
  })
}
