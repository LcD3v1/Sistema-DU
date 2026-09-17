import { useLogo } from '@/hooks/useConfig'
import emblem from '@/assets/fast-emblem.webp'

export default function Brand({ size = 56, className = '' }: { size?: number; className?: string }) {
  const { data: logoData } = useLogo()
  const src = logoData?.logo || emblem
  return (
    <img
      src={src}
      alt="FAST NPD"
      width={size}
      height={size}
      className={`object-contain shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
      decoding="async"
    />
  )
}
