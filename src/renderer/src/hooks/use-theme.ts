import { useEffect, useState } from 'react'

export function useNativeTheme(): { isDark: boolean } {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    window.api.getNativeTheme().then(({ dark }) => {
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
    })

    const unsubscribe = window.api.onNativeThemeChanged((dark) => {
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
    })

    return unsubscribe
  }, [])

  return { isDark }
}
