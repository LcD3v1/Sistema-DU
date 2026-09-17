import type { ContaExonerada, Membro } from '@/types'

type PessoaDiscord = Pick<Membro, 'policial' | 'nomeServidor' | 'discordUsername' | 'discordId'> | ContaExonerada

export function discordNome(pessoa: PessoaDiscord): string | null {
  return pessoa.nomeServidor || pessoa.discordUsername || pessoa.discordId || null
}

export function nomeComDiscord(pessoa: PessoaDiscord, fallback?: string): string {
  const nomeDiscord = discordNome(pessoa)
  const nomeBase = ('policial' in pessoa ? pessoa.policial : undefined) || fallback
  if (nomeDiscord && nomeBase) return `@${nomeDiscord} ${nomeBase}`
  if (nomeDiscord) return `@${nomeDiscord}`
  return nomeBase || fallback || '—'
}
