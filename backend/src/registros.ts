import { Request, Response } from 'express'
import type { AlteracaoRegistro, Conta, DuData, Membro, RegistroBase } from './types'

/**
 * Peças comuns dos módulos investigativos da DU (Relatórios, Boletins, Inquéritos, Galeria).
 * As funções que recebem `data` só leem ou mutam o objeto — quem chama grava com writeData.
 */

/** Teto do histórico de alterações por registro (o mais antigo sai primeiro). */
const MAX_HISTORICO = 60

export function idDaRota(req: Request, res: Response): number | undefined {
  const raw = String(req.params.id)
  const id = /^\d{1,9}$/.test(raw) ? parseInt(raw, 10) : NaN
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'ID inválido' }); return undefined }
  return id
}

/** Nome exibido do autor: apelido no servidor → usuário do Discord → login. */
/**
 * REGRA DA DU: a pessoa aparece pelo CODINOME em todo lugar (site, Discord, logs, chat, árvore…).
 * Sem codinome: o do pedido de set, depois o nome no RP, o apelido do Discord e, por fim, o usuário.
 */
export function nomeDeExibicao(conta: Conta | undefined, membro: Membro | undefined): string {
  return membro?.codinome?.trim() || conta?.cadastroSetagem?.codinome?.trim() || membro?.policial?.trim()
    || conta?.nomeServidor || conta?.discordUsername || conta?.username || 'Desconhecido'
}

export function nomeDaConta(data: Readonly<DuData>, contaId: number): string {
  const c = data.contas.find(x => x.id === contaId)
  if (!c) return 'Desconhecido'
  const membro = c.membroId ? data.membros.find(m => m.id === c.membroId) : undefined
  return nomeDeExibicao(c, membro)
}

/** Nome de exibição de uma ficha de membro (codinome primeiro). */
export function nomeDoMembro(data: Readonly<DuData>, membro: Membro): string {
  return nomeDeExibicao(data.contas.find(c => c.membroId === membro.id), membro)
}

/** Só membros que existem; sem repetição. */
export function investigadoresValidos(data: Readonly<DuData>, ids: number[]): number[] | null {
  const existentes = new Set(data.membros.map(m => m.id))
  const unicos = [...new Set(ids)]
  return unicos.every(id => existentes.has(id)) ? unicos : null
}

export function registrarAlteracao(reg: { historico: AlteracaoRegistro[] }, por: string, acao: AlteracaoRegistro['acao'], detalhe?: string): void {
  reg.historico = [...(reg.historico ?? []), { em: new Date().toISOString(), por, acao, ...(detalhe ? { detalhe } : {}) }].slice(-MAX_HISTORICO)
}

/** Campos que mudaram entre duas versões (para o histórico). */
export function camposAlterados<T extends object>(antes: T, depois: Partial<T>, rotulos: Partial<Record<keyof T, string>>): string {
  const mudou = (Object.keys(rotulos) as (keyof T)[])
    .filter(k => depois[k] !== undefined && JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    .map(k => rotulos[k]!)
  return mudou.join(', ')
}

/** Número padrão: PREFIXO-ANO-0001 (ex.: BO-DU-2026-0007). */
export function numeroPadrao(prefixo: string, id: number): string {
  return `${prefixo}-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`
}

/** Saída comum: lista branca, sem autorContaId. */
export function basePublica(r: RegistroBase) {
  return {
    id: r.id, numero: r.numero, titulo: r.titulo, investigadores: r.investigadores,
    links: r.links, arquivos: r.arquivos, autorNome: r.autorNome,
    criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm, historico: r.historico,
  }
}

export const erroArquivos = (res: Response) =>
  res.status(400).json({ error: 'Um ou mais arquivos anexados não foram encontrados. Envie novamente.' })
