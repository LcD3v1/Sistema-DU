import type { Lado, LigacaoArvore, NoArvore } from '@/hooks/useArvores'

/** Tamanho do card no quadro (px do "mundo", antes do zoom). */
export const CARD_W = 172
export const CARD_H = 214
export const LADOS: Lado[] = ['cima', 'direita', 'baixo', 'esquerda']
export const OPOSTO: Record<Lado, Lado> = { cima: 'baixo', baixo: 'cima', direita: 'esquerda', esquerda: 'direita' }
const NORMAL: Record<Lado, [number, number]> = { cima: [0, -1], baixo: [0, 1], direita: [1, 0], esquerda: [-1, 0] }

export interface Ponto { x: number; y: number }
export type Posicao = Pick<NoArvore, 'x' | 'y'>

/** Ponto de ligação no meio de cada lado do card. */
export function pontoDoLado(p: Posicao, lado: Lado): Ponto {
  switch (lado) {
    case 'cima': return { x: p.x + CARD_W / 2, y: p.y }
    case 'baixo': return { x: p.x + CARD_W / 2, y: p.y + CARD_H }
    case 'esquerda': return { x: p.x, y: p.y + CARD_H / 2 }
    case 'direita': return { x: p.x + CARD_W, y: p.y + CARD_H / 2 }
  }
}

/** Lado do card mais perto de um ponto (soltar a linha em cima do card). */
export function ladoMaisProximo(p: Posicao, alvo: Ponto): Lado {
  let melhor: Lado = 'cima', dist = Infinity
  for (const l of LADOS) {
    const q = pontoDoLado(p, l)
    const d = (q.x - alvo.x) ** 2 + (q.y - alvo.y) ** 2
    if (d < dist) { dist = d; melhor = l }
  }
  return melhor
}

export interface Curva { p0: Ponto; c1: Ponto; c2: Ponto; p3: Ponto; meio: Ponto; meioBase: Ponto }

/** Curva da linha: sai "para fora" de cada lado; `curva` desloca o meio (arrastável). */
export function curvaDaLinha(a: Ponto, ladoA: Lado | null, b: Ponto, ladoB: Lado | null, desloc: { dx: number; dy: number } | null): Curva {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const d = Math.min(220, Math.max(40, dist * 0.4))
  const [ax, ay] = ladoA ? NORMAL[ladoA] : [0, 0]
  const [bx, by] = ladoB ? NORMAL[ladoB] : [0, 0]
  const dx = desloc?.dx ?? 0, dy = desloc?.dy ?? 0
  const c1 = { x: a.x + ax * d + dx, y: a.y + ay * d + dy }
  const c2 = { x: b.x + bx * d + dx, y: b.y + by * d + dy }
  const meio = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
  // Meio sem o deslocamento: arrastar o meio para P ⇒ deslocamento = (P − meioBase) · 4/3
  const meioBase = { x: meio.x - (dx * 6) / 8, y: meio.y - (dy * 6) / 8 }
  return { p0: a, c1, c2, p3: b, meio, meioBase }
}

export const caminhoSvg = (c: Curva) => `M ${c.p0.x} ${c.p0.y} C ${c.c1.x} ${c.c1.y}, ${c.c2.x} ${c.c2.y}, ${c.p3.x} ${c.p3.y}`

/** Ponto da curva em t (0 = início, 1 = fim). */
export function pontoNaCurva(c: Curva, t: number): Ponto {
  const u = 1 - t
  return {
    x: u * u * u * c.p0.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.p3.x,
    y: u * u * u * c.p0.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.p3.y,
  }
}

/** t do ponto da curva mais perto de p (onde a pessoa apertou na linha). */
export function tMaisProximo(c: Curva, p: Ponto): number {
  let melhor = 0.5, dist = Infinity
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, q = pontoNaCurva(c, t)
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < dist) { dist = d; melhor = t }
  }
  // refina em volta do melhor
  for (let i = -10; i <= 10; i++) {
    const t = Math.min(1, Math.max(0, melhor + i / 600)), q = pontoNaCurva(c, t)
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < dist) { dist = d; melhor = t }
  }
  return Math.round(melhor * 1000) / 1000
}

/**
 * Curvas de todas as linhas. Uma ponta pode estar num card (lado) ou num ponto de OUTRA linha —
 * por isso resolve em ordem (a linha de onde ela sai primeiro). Ponta sem destino = linha some.
 */
export function resolverCurvas(ligacoes: LigacaoArvore[], posicoes: Map<number, Posicao>): Map<number, Curva> {
  const porId = new Map(ligacoes.map(l => [l.id, l]))
  const prontas = new Map<number, Curva>()
  const visitando = new Set<number>()
  const resolver = (l: LigacaoArvore): Curva | null => {
    const feita = prontas.get(l.id)
    if (feita) return feita
    if (visitando.has(l.id) || visitando.size > 50) return null   // nunca entra em ciclo
    visitando.add(l.id)
    const ponta = (no: number | null, lado: Lado | null, lig: number | null, t: number | null): [Ponto, Lado | null] | null => {
      if (no != null && lado) { const p = posicoes.get(no); return p ? [pontoDoLado(p, lado), lado] : null }
      if (lig != null && t != null) { const base = porId.get(lig); const c = base && resolver(base); return c ? [pontoNaCurva(c, t), null] : null }
      return null
    }
    const a = ponta(l.de, l.deLado, l.deLig, l.deT), b = ponta(l.para, l.paraLado, l.paraLig, l.paraT)
    visitando.delete(l.id)
    if (!a || !b) return null
    const c = curvaDaLinha(a[0], a[1], b[0], b[1], l.curva)
    prontas.set(l.id, c)
    return c
  }
  for (const l of ligacoes) resolver(l)
  return prontas
}

export function curvaDaLigacao(l: LigacaoArvore, posicoes: Map<number, Posicao>, todas: LigacaoArvore[] = [l]): Curva | null {
  return resolverCurvas(todas.includes(l) ? todas : [...todas, l], posicoes).get(l.id) ?? null
}

/** Onde colocar o card novo ao apertar o "+" de um lado (desvia de quem já está lá). */
export function posicaoAoLado(p: Posicao, lado: Lado, ocupadas: Posicao[]): Posicao {
  const passoX = CARD_W + 130, passoY = CARD_H + 100
  const base = { cima: { x: p.x, y: p.y - passoY }, baixo: { x: p.x, y: p.y + passoY }, esquerda: { x: p.x - passoX, y: p.y }, direita: { x: p.x + passoX, y: p.y } }[lado]
  const livre = (q: Posicao) => !ocupadas.some(o => Math.abs(o.x - q.x) < CARD_W - 10 && Math.abs(o.y - q.y) < CARD_H - 10)
  const desvio = lado === 'cima' || lado === 'baixo' ? { x: CARD_W + 40, y: 0 } : { x: 0, y: CARD_H + 40 }
  for (let i = 0; i < 12; i++) {
    for (const sinal of i === 0 ? [0] : [1, -1]) {
      const q = { x: Math.round(base.x + desvio.x * i * sinal), y: Math.round(base.y + desvio.y * i * sinal) }
      if (livre(q)) return q
    }
  }
  return base
}

/** Retângulo que envolve todos os cards. */
export function limites(posicoes: Posicao[]): { x: number; y: number; w: number; h: number } | null {
  if (!posicoes.length) return null
  const xs = posicoes.map(p => p.x), ys = posicoes.map(p => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) + CARD_W - x, h: Math.max(...ys) + CARD_H - y }
}

/** Cores rápidas da linha (branca é a padrão). */
export const CORES_LINHA = ['#ffffff', '#8b5cf6', '#d4c4ff', '#d0453a', '#e67e22', '#f1c40f', '#2ecc71', '#9a90ad']

export const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
