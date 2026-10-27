/**
 * Proteção contra força bruta no login: depois de MAX_TENTATIVAS erros seguidos
 * para o mesmo usuário (dentro da janela), ele fica bloqueado por BLOQUEIO_MS.
 * Em memória, com teto de chaves (um ataque com usuários aleatórios não enche a RAM).
 */
const MAX_TENTATIVAS = 5
const JANELA_MS = 15 * 60_000
const BLOQUEIO_MS = 15 * 60_000
const MAX_CHAVES = 50_000

interface Registro { tentativas: number; inicio: number; bloqueadoAte?: number }
const registros = new Map<string, Registro>()

const chave = (usuario: string) => usuario.trim().toLowerCase()

export function bloqueio(usuario: string): number {
  const r = registros.get(chave(usuario))
  if (!r) return 0
  const agora = Date.now()
  if (r.bloqueadoAte && agora < r.bloqueadoAte) return r.bloqueadoAte - agora
  if (r.bloqueadoAte || agora - r.inicio > JANELA_MS) registros.delete(chave(usuario))
  return 0
}

export function registrarFalha(usuario: string): void {
  const k = chave(usuario)
  const agora = Date.now()
  let r = registros.get(k)
  if (!r || agora - r.inicio > JANELA_MS) r = { tentativas: 0, inicio: agora }
  r.tentativas++
  if (r.tentativas >= MAX_TENTATIVAS) r.bloqueadoAte = agora + BLOQUEIO_MS
  registros.delete(k); registros.set(k, r)
  while (registros.size > MAX_CHAVES) {
    const antiga = registros.keys().next().value
    if (antiga === undefined) break
    registros.delete(antiga)
  }
}

export function limparFalhas(usuario: string): void {
  registros.delete(chave(usuario))
}

setInterval(() => {
  const agora = Date.now()
  for (const [k, r] of registros) if ((r.bloqueadoAte ?? r.inicio + JANELA_MS) < agora) registros.delete(k)
}, 10 * 60_000).unref()
