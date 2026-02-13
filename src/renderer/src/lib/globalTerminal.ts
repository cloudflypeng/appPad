export type TerminalExecResult = {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: string
}

const APP_TERMINAL_APPEND_EVENT = 'app:terminal-append'
const APP_TERMINAL_OPEN_EVENT = 'app:terminal-open'

export function openGlobalTerminal(): void {
  window.dispatchEvent(new CustomEvent(APP_TERMINAL_OPEN_EVENT))
}

export function appendToGlobalTerminal(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(APP_TERMINAL_APPEND_EVENT, { detail: message }))
}

export function getGlobalTerminalEvents(): {
  appendEvent: string
  openEvent: string
} {
  return {
    appendEvent: APP_TERMINAL_APPEND_EVENT,
    openEvent: APP_TERMINAL_OPEN_EVENT
  }
}

export async function executeWithGlobalTerminal(command: string): Promise<TerminalExecResult> {
  openGlobalTerminal()
  appendToGlobalTerminal(`> ${command}`)

  const result = await window.api.executeTerminalCommand(command)

  if (result.stdout.length > 0) {
    appendToGlobalTerminal(result.stdout)
  }
  if (result.stderr.length > 0) {
    appendToGlobalTerminal(result.stderr)
  }
  if (!result.success) {
    appendToGlobalTerminal(`[exit ${result.code ?? 'unknown'}] ${result.error ?? 'command failed'}`)
  } else if (result.stdout.length === 0 && result.stderr.length === 0) {
    appendToGlobalTerminal('[exit 0] command completed with no output')
  }

  return result
}
