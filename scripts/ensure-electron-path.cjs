#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function resolveElectronDir() {
  try {
    const pkgPath = require.resolve('electron/package.json', { paths: [process.cwd()] })
    return path.dirname(pkgPath)
  } catch {
    return null
  }
}

function main() {
  const electronDir = resolveElectronDir()
  if (!electronDir) return

  const distDir = path.join(electronDir, 'dist')
  const pathFile = path.join(electronDir, 'path.txt')
  if (!fs.existsSync(pathFile)) return

  const currentRelative = fs.readFileSync(pathFile, 'utf8').trim()
  if (!currentRelative) return

  const currentAbsolute = path.join(distDir, currentRelative)
  if (fs.existsSync(currentAbsolute)) return

  if (process.platform !== 'darwin') return

  const appBundle = safeReadDir(distDir).find((entry) => entry.endsWith('.app'))
  if (!appBundle) return

  const macosDir = path.join(distDir, appBundle, 'Contents', 'MacOS')
  const candidates = safeReadDir(macosDir).filter((name) => {
    try {
      return fs.statSync(path.join(macosDir, name)).isFile()
    } catch {
      return false
    }
  })
  if (candidates.length === 0) return

  const executable = candidates.includes('Electron') ? 'Electron' : candidates[0]
  const repairedRelative = path.join(appBundle, 'Contents', 'MacOS', executable)
  fs.writeFileSync(pathFile, repairedRelative)
  console.warn(`[ensure-electron-path] repaired path.txt -> ${repairedRelative}`)
}

main()
