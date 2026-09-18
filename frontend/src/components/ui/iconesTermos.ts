import { Cookie, FileText, KeyRound, Lock, Scale, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { DocId } from '@/content/termos'

/** Ícone de cada documento — usado na página /termos e no aceite. */
export const ICONES_TERMOS: Record<DocId, LucideIcon> = {
  uso: FileText,
  privacidade: Lock,
  cookies: Cookie,
  propriedade: ShieldCheck,
  licenca: KeyRound,
  responsabilidades: Scale,
}
