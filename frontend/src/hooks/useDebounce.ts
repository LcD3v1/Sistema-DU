import { useEffect, useRef } from 'react'

export function useDebounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): T {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  return ((...args: Parameters<T>) => {
    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => fn(...args), delay)
  }) as T
}
