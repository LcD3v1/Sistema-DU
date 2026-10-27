import type { ContaExonerada, Membro } from '@/types'

type PessoaDiscord = Pick<Membro, 'policial' | 'nomeServidor' | 'discordUsername' | 'discordId'> | ContaExonerada

export function discordNome(pessoa: PessoaDiscord): string | null {
  return pessoa.nomeServidor || pessoa.discordUsername || pessoa.discordId || null
}

/** Nome para exibir: o do policial; sem ele, o nome informado no pedido de acesso. */
export function nomeComDiscord(pessoa: PessoaDiscord, fallback?: string): string {
  const nomeBase = 'policial' in pessoa ? pessoa.policial : undefined
  return nomeBase || discordNome(pessoa) || fallback || '—'
}
