import { ElectronAPI } from '@electron-toolkit/preload'

type BrewStatus = {
  installed: boolean
  brewPath: string | null
  version: string | null
}

type BrewActionResult = {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: string
  status: BrewStatus
}

type AppAPI = {
  getBrewStatus: () => Promise<BrewStatus>
  installBrew: () => Promise<BrewActionResult>
  updateBrew: () => Promise<BrewActionResult>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
