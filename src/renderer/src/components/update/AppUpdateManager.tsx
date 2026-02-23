import { useEffect, useState } from 'react'
import { AlertCircle, Download, LoaderCircle, RefreshCw } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type UpdateInfoState = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseNotes: string
}

function AppUpdateManager(): React.JSX.Element {
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  const [info, setInfo] = useState<UpdateInfoState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkForUpdates = async (): Promise<void> => {
    if (checking || downloading) return
    setChecking(true)
    setError(null)
    try {
      const result = await window.api.checkForUpdates()
      if (!result.success) {
        setError(result.error ?? 'Failed to check updates.')
        return
      }

      setInfo({
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion ?? result.currentVersion,
        updateAvailable: result.updateAvailable,
        releaseNotes: result.releaseNotes ?? ''
      })
    } finally {
      setChecking(false)
    }
  }

  const downloadAndInstall = async (): Promise<void> => {
    if (!info?.updateAvailable || downloading || checking) return
    setDownloading(true)
    setDownloadPercent(0)
    setError(null)
    try {
      const result = await window.api.downloadAndInstallUpdate()
      if (!result.success) {
        setError(result.error ?? 'Failed to download update.')
        setDownloading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download update.')
      setDownloading(false)
    }
  }

  useEffect(() => {
    void checkForUpdates()
  }, [])

  useEffect(() => {
    const unsubscribeProgress = window.api.onUpdateDownloadProgress((payload) => {
      setDownloading(true)
      setDownloadPercent(typeof payload.percent === 'number' ? payload.percent : null)
    })

    const unsubscribeDownloaded = window.api.onUpdateDownloaded(() => {
      setDownloading(false)
      setDownloadPercent(100)
      const confirmed = window.confirm('Update downloaded. Quit and install now?')
      if (confirmed) {
        void window.api.quitAndInstall()
      }
    })

    const unsubscribeError = window.api.onUpdateError((message) => {
      setDownloading(false)
      setError(message)
    })

    return () => {
      unsubscribeProgress()
      unsubscribeDownloaded()
      unsubscribeError()
    }
  }, [])

  return (
    <main className="px-6 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <div className="divide-y divide-white/[0.06]">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Application Update</p>
              <p className="text-xs text-muted-foreground">
                Check and install new versions for apppad.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={info?.updateAvailable ? 'outline' : 'secondary'}
                className={
                  info?.updateAvailable
                    ? 'border-amber-300 bg-amber-300 font-semibold text-amber-950'
                    : undefined
                }
              >
                {info?.updateAvailable ? 'Update Available' : 'Up To Date'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Current Version</p>
              <p className="text-xs text-muted-foreground">Installed version on this machine</p>
            </div>
            <p className="font-mono text-sm">{info?.currentVersion ?? 'Unknown'}</p>
          </div>

          <div className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Latest Version</p>
              <p className="text-xs text-muted-foreground">Latest version from update feed</p>
            </div>
            <p className="font-mono text-sm">{info?.latestVersion ?? 'Unknown'}</p>
          </div>

          <div className="flex items-start justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Action</p>
              <p className="text-xs text-muted-foreground">
                {downloading && downloadPercent !== null
                  ? `Downloading ${Math.round(downloadPercent)}%`
                  : 'Run update check or download the latest release.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void checkForUpdates()
                }}
                disabled={checking || downloading}
              >
                {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {checking ? 'Checking...' : 'Check'}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void downloadAndInstall()
                }}
                disabled={!info?.updateAvailable || checking || downloading}
              >
                {downloading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {downloading ? 'Downloading...' : 'Download & Install'}
              </Button>
            </div>
          </div>
        </div>

        {info?.releaseNotes ? (
          <div className="space-y-1.5">
            <div className="py-1">
              <p className="text-sm font-medium">Release Notes</p>
            </div>
            <div className="rounded-md border border-white/[0.06] p-3">
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{info.releaseNotes}</pre>
            </div>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  )
}

export default AppUpdateManager
