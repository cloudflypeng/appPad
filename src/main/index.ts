import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

type BrewStatus = {
  installed: boolean
  brewPath: string | null
  version: string | null
}

type CommandResult = {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: string
}

const COMMON_BREW_PATHS = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']

function runShellCommand(command: string, timeoutMs = 1000 * 60 * 20): Promise<CommandResult> {
  return new Promise((resolve) => {
    const normalizedPath = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      process.env.PATH ?? ''
    ]
      .filter(Boolean)
      .join(':')

    const child = spawn('/bin/zsh', ['-lc', command], {
      env: {
        ...process.env,
        PATH: normalizedPath,
        HOMEBREW_NO_ENV_HINTS: '1',
        NONINTERACTIVE: '1',
        CI: '1'
      }
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finalize = (result: CommandResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finalize({
        success: false,
        code: null,
        stdout,
        stderr,
        error: `Command timed out after ${Math.round(timeoutMs / 1000)}s`
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      finalize({
        success: false,
        code: null,
        stdout,
        stderr,
        error: error.message
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      finalize({
        success: code === 0,
        code,
        stdout,
        stderr
      })
    })
  })
}

async function resolveBrewPath(): Promise<string | null> {
  for (const brewPath of COMMON_BREW_PATHS) {
    if (existsSync(brewPath)) {
      return brewPath
    }
  }

  const pathResult = await runShellCommand('command -v brew')
  const brewPath = pathResult.success ? pathResult.stdout.trim() : ''

  return brewPath || null
}

async function getBrewStatus(): Promise<BrewStatus> {
  const brewPath = await resolveBrewPath()
  if (!brewPath) {
    return {
      installed: false,
      brewPath: null,
      version: null
    }
  }

  const versionResult = await runShellCommand(`"${brewPath}" --version`)
  const versionLine = versionResult.stdout.split('\n').find((line) => line.trim().length > 0) ?? null

  return {
    installed: true,
    brewPath,
    version: versionLine
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle('brew:get-status', async () => {
    return getBrewStatus()
  })
  ipcMain.handle('brew:install', async () => {
    const command =
      'NONINTERACTIVE=1 CI=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    const result = await runShellCommand(command, 1000 * 60 * 30)
    const status = await getBrewStatus()

    return {
      ...result,
      status
    }
  })
  ipcMain.handle('brew:update', async () => {
    const brewPath = await resolveBrewPath()
    if (!brewPath) {
      return {
        success: false,
        code: null,
        stdout: '',
        stderr: '',
        error: 'Homebrew is not installed.',
        status: await getBrewStatus()
      }
    }

    const result = await runShellCommand(`"${brewPath}" update && "${brewPath}" upgrade brew`, 1000 * 60 * 15)
    const status = await getBrewStatus()

    return {
      ...result,
      status
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
