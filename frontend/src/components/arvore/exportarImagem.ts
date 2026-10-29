import api from '@/lib/axios'
import type { ArvoreCompleta, FotoArvore } from '@/hooks/useArvores'
import { CARD_H, CARD_W, resolverCurvas, iniciais, limites, type Posicao } from './geometria'

const MARGEM = 90
const CABECALHO = 110

/** Foto do card para o canvas: arquivo vem do backend (mesma origem); link só se o site permitir (CORS). */
async function carregarFoto(f: FotoArvore | null): Promise<CanvasImageSource | null> {
  if (!f) return null
  try {
    if ('arquivo' in f) {
      const { data } = await api.get<Blob>(`/arquivos/${f.arquivo.id}`, { responseType: 'blob' })
      return await createImageBitmap(data)
    }
    return await new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = f.url
    })
  } catch { return null }
}

function retArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function textoCortado(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let s = t
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

/** Desenha a árvore inteira (cards, fotos, linhas e cabeçalho) e baixa como PNG. */
export async function baixarArvoreComoImagem(a: ArvoreCompleta): Promise<void> {
  const posicoes = new Map<number, Posicao>(a.nos.map(n => [n.id, { x: n.x, y: n.y }]))
  const caixa = limites([...posicoes.values()]) ?? { x: 0, y: 0, w: CARD_W, h: CARD_H }
  const largura = Math.max(900, caixa.w + MARGEM * 2)
  const altura = caixa.h + MARGEM * 2 + CABECALHO
  const escala = Math.min(2, 8000 / Math.max(largura, altura))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(largura * escala); canvas.height = Math.round(altura * escala)
  const ctx = canvas.getContext('2d')!
  ctx.scale(escala, escala)
  await document.fonts?.ready

  // Fundo do tema + pontilhado
  ctx.fillStyle = '#07050b'; ctx.fillRect(0, 0, largura, altura)
  ctx.fillStyle = 'rgba(139,92,246,0.10)'
  for (let x = 0; x < largura; x += 28) for (let y = CABECALHO; y < altura; y += 28) ctx.fillRect(x, y, 1.5, 1.5)

  // Cabeçalho
  ctx.fillStyle = '#8b5cf6'; ctx.font = '600 11px ui-monospace, monospace'
  ctx.fillText('DETECTIVE UNIT · ÁRVORE DE INVESTIGAÇÃO', MARGEM, 42)
  ctx.fillStyle = '#ededed'; ctx.font = '700 30px system-ui, sans-serif'
  ctx.fillText(textoCortado(ctx, a.nome, largura - MARGEM * 2), MARGEM, 78)
  ctx.fillStyle = '#9a90ad'; ctx.font = '400 12px system-ui, sans-serif'
  const inq = a.inquerito?.titulo ? `Inquérito ${a.inquerito.numero ?? ''} ${a.inquerito.titulo} · ` : ''
  ctx.fillText(`${inq}${a.nos.length} pessoa(s) · gerado em ${new Date().toLocaleString('pt-BR')}`, MARGEM, 98)

  const ox = MARGEM - caixa.x, oy = MARGEM + CABECALHO - caixa.y
  ctx.save(); ctx.translate(ox, oy)

  // Linhas (inclusive as que saem do meio de outra linha)
  const curvas = resolverCurvas(a.ligacoes, posicoes)
  for (const l of a.ligacoes) {
    const c = curvas.get(l.id)
    if (!c) continue
    ctx.strokeStyle = l.cor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(c.p0.x, c.p0.y); ctx.bezierCurveTo(c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.p3.x, c.p3.y); ctx.stroke()
    ctx.fillStyle = l.cor
    for (const [ligada, p] of [[l.deLig, c.p0], [l.paraLig, c.p3]] as const) {
      if (ligada != null) { ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill() }
    }
    if (l.rotulo) {
      ctx.font = '600 11px system-ui, sans-serif'
      const w = ctx.measureText(l.rotulo).width + 14
      ctx.fillStyle = '#100c17'; retArredondado(ctx, c.meio.x - w / 2, c.meio.y - 10, w, 20, 10); ctx.fill()
      ctx.strokeStyle = l.cor; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = '#ededed'; ctx.textAlign = 'center'; ctx.fillText(l.rotulo, c.meio.x, c.meio.y + 4); ctx.textAlign = 'left'
    }
  }

  // Cards
  const fotos = await Promise.all(a.nos.map(n => carregarFoto(n.foto)))
  a.nos.forEach((n, i) => {
    ctx.fillStyle = '#100c17'; retArredondado(ctx, n.x, n.y, CARD_W, CARD_H, 14); ctx.fill()
    ctx.strokeStyle = '#43355a'; ctx.lineWidth = 1; ctx.stroke()
    const fx = n.x + 10, fy = n.y + 10, fw = CARD_W - 20, fh = 128
    ctx.save(); retArredondado(ctx, fx, fy, fw, fh, 10); ctx.clip()
    const foto = fotos[i]
    if (foto) {
      const iw = 'width' in foto ? Number(foto.width) : fw, ih = 'height' in foto ? Number(foto.height) : fh
      const s = Math.max(fw / iw, fh / ih)
      ctx.drawImage(foto, fx + (fw - iw * s) / 2, fy + (fh - ih * s) / 2, iw * s, ih * s)
    } else {
      ctx.fillStyle = '#1f1235'; ctx.fillRect(fx, fy, fw, fh)
      ctx.fillStyle = '#d4c4ff'; ctx.font = '700 34px system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(iniciais(n.nome || n.apelido), fx + fw / 2, fy + fh / 2 + 12); ctx.textAlign = 'left'
    }
    ctx.restore()
    ctx.fillStyle = '#ededed'; ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillText(textoCortado(ctx, n.nome || 'Sem nome', fw), fx, n.y + 160)
    ctx.fillStyle = '#d4c4ff'; ctx.font = '400 12px system-ui, sans-serif'
    ctx.fillText(textoCortado(ctx, n.apelido ? `"${n.apelido}"` : n.funcao, fw), fx, n.y + 178)
    if (n.faccao || n.status) {
      ctx.fillStyle = '#9a90ad'; ctx.font = '600 10px ui-monospace, monospace'
      ctx.fillText(textoCortado(ctx, [n.faccao, n.status].filter(Boolean).join(' · ').toUpperCase(), fw), fx, n.y + 198)
    }
  })
  ctx.restore()

  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('imagem')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `arvore-${a.nome.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || a.id}.png`
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
