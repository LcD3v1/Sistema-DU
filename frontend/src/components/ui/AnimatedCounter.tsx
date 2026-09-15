import { useEffect } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

interface Props {
  value: number
  suffix?: string
  className?: string
}

export default function AnimatedCounter({ value, suffix = '', className = '' }: Props) {
  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { stiffness: 60, damping: 15 })
  const display = useTransform(spring, v => Math.round(v).toLocaleString('pt-BR'))

  useEffect(() => {
    motionVal.set(value)
  }, [value, motionVal])

  return (
    <span className={className}>
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  )
}
