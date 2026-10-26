/**
 * Carteirinha de identificação da Detective Unit — desenhada 100% em canvas
 * (sem modelo em imagem), para o bot poder reproduzir o mesmo layout depois:
 * basta chamar `desenharCarteiraDU` com os mesmos dados (node-canvas ou navegador).
 *
 * Tamanho: 1536 × 968 (proporção do cartão ID-1, 85,6 × 54 mm).
 */

export const CARTEIRA_W = 1536
export const CARTEIRA_H = 968

export interface DadosCarteira {
  nome: string
  codinome: string
  cargo: string
  distintivo: string     // badge
  passaporte: string
  registro: string       // nº de registro na DU
  emissao: string        // dd/mm/aaaa
  validade: string       // dd/mm/aaaa
  assinatura: string     // nome do comandante (fonte manuscrita)
}

export interface ImagensCarteira {
  foto?: CanvasImageSource | null
  emblema?: CanvasImageSource | null
}

const ROXO = '#8b5cf6'
const ROXO_CLARO = '#c4b5fd'
const LAVANDA = '#e9ddff'

function retArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function cobrir(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width as number
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height as number
  if (!iw || !ih) return
  const ir = iw / ih, r = w / h
  let dw: number, dh: number, dx: number, dy: number
  if (ir > r) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; dy = y }
  else { dw = w; dh = w / ir; dx = x; dy = y - (dh - h) / 2 }
  ctx.drawImage(img, dx, dy, dw, dh)
}

/** Linhas onduladas finas (guilhoché) — o "padrão de segurança" do documento. */
function guilloche(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.globalAlpha = 0.09
  ctx.strokeStyle = ROXO_CLARO
  ctx.lineWidth = 1.2
  for (let k = 0; k < 26; k++) {
    ctx.beginPath()
    for (let x = 0; x <= CARTEIRA_W; x += 8) {
      const y = 150 + k * 30 + Math.sin(x / 70 + k * 0.6) * 18 + Math.sin(x / 23 + k) * 4
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function campo(ctx: CanvasRenderingContext2D, rotulo: string, valor: string, x: number, y: number, w: number, destaque = false) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 20px "Geist Mono", monospace'
  ctx.fillStyle = ROXO_CLARO
  ctx.fillText(rotulo.toUpperCase(), x, y)
  ctx.font = destaque ? '700 46px "Chakra Petch", Geist, sans-serif' : '600 36px Geist, sans-serif'
  ctx.fillStyle = destaque ? LAVANDA : '#f5f3ff'
  let texto = valor.trim() || '—'
  if (destaque && valor.trim()) texto = `“${texto.toUpperCase()}”`
  while (ctx.measureText(texto).width > w && texto.length > 3) texto = texto.slice(0, -2) + '…'
  ctx.fillText(texto, x, y + (destaque ? 50 : 42))
  ctx.strokeStyle = 'rgba(196,181,253,0.18)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, y + (destaque ? 66 : 58)); ctx.lineTo(x + w, y + (destaque ? 66 : 58)); ctx.stroke()
}

/** Faixa no formato de zona de leitura (MRZ) — estética de documento oficial. */
function mrz(d: DadosCarteira): [string, string] {
  const limpar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '<')
  const l1 = `IDDU<DPD<${limpar(d.nome)}<<${limpar(d.codinome)}`.padEnd(44, '<').slice(0, 44)
  const l2 = `${limpar(d.registro || '0')}<${limpar(d.distintivo || '0')}<${limpar(d.emissao.replace(/\D/g, ''))}<${limpar(d.validade.replace(/\D/g, ''))}`.padEnd(44, '<').slice(0, 44)
  return [l1, l2]
}

export function desenharCarteiraDU(ctx: CanvasRenderingContext2D, d: DadosCarteira, img: ImagensCarteira = {}): void {
  const W = CARTEIRA_W, H = CARTEIRA_H
  ctx.save()
  ctx.clearRect(0, 0, W, H)

  // Cartão com cantos arredondados
  retArredondado(ctx, 0, 0, W, H, 48)
  ctx.clip()

  // Fundo
  const fundo = ctx.createLinearGradient(0, 0, W, H)
  fundo.addColorStop(0, '#1a0f30')
  fundo.addColorStop(0.55, '#0e0819')
  fundo.addColorStop(1, '#22113f')
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, W, H)
  const brilho = ctx.createRadialGradient(W * 0.78, H * 0.2, 20, W * 0.78, H * 0.2, 760)
  brilho.addColorStop(0, 'rgba(139,92,246,0.35)')
  brilho.addColorStop(1, 'rgba(139,92,246,0)')
  ctx.fillStyle = brilho
  ctx.fillRect(0, 0, W, H)
  guilloche(ctx)

  // Marca d'água do emblema
  if (img.emblema) {
    ctx.save(); ctx.globalAlpha = 0.07
    ctx.drawImage(img.emblema, W - 640, 230, 600, 600)
    ctx.restore()
  }

  // Cabeçalho
  const topo = ctx.createLinearGradient(0, 0, W, 0)
  topo.addColorStop(0, '#5b21b6'); topo.addColorStop(0.6, '#7c3aed'); topo.addColorStop(1, '#3b1d6e')
  ctx.fillStyle = topo
  ctx.fillRect(0, 0, W, 168)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(0, 160, W, 8)
  if (img.emblema) ctx.drawImage(img.emblema, 44, 18, 132, 132)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LAVANDA
  ctx.font = '600 24px "Geist Mono", monospace'
  ctx.fillText('DETROIT POLICE DEPARTMENT', 200, 62)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 64px "Chakra Petch", Geist, sans-serif'
  ctx.fillText('DETECTIVE UNIT', 196, 128)
  ctx.textAlign = 'right'
  ctx.fillStyle = LAVANDA
  ctx.font = '600 22px "Geist Mono", monospace'
  ctx.fillText('IDENTIFICAÇÃO FUNCIONAL', W - 56, 70)
  ctx.font = '500 20px "Geist Mono", monospace'
  ctx.fillStyle = 'rgba(233,221,255,0.75)'
  ctx.fillText('INVESTIGATOR ID · CARD', W - 56, 104)
  ctx.font = '700 30px "Geist Mono", monospace'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`Nº ${d.registro.trim() || '0000'}`, W - 56, 142)

  // Foto
  const F = { x: 64, y: 222, w: 360, h: 460 }
  ctx.save()
  ctx.shadowColor = 'rgba(139,92,246,0.55)'; ctx.shadowBlur = 40
  retArredondado(ctx, F.x - 8, F.y - 8, F.w + 16, F.h + 16, 30)
  ctx.fillStyle = ROXO
  ctx.fill()
  ctx.restore()
  retArredondado(ctx, F.x, F.y, F.w, F.h, 24)
  ctx.save(); ctx.clip()
  ctx.fillStyle = '#120a22'; ctx.fillRect(F.x, F.y, F.w, F.h)
  if (img.foto) cobrir(ctx, img.foto, F.x, F.y, F.w, F.h)
  else {
    ctx.fillStyle = 'rgba(196,181,253,0.35)'
    ctx.beginPath(); ctx.arc(F.x + F.w / 2, F.y + 175, 78, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(F.x + F.w / 2, F.y + 410, 150, 130, 0, Math.PI, 0); ctx.fill()
  }
  ctx.restore()
  // Distintivo sob a foto
  retArredondado(ctx, F.x, F.y + F.h + 26, F.w, 74, 18)
  ctx.fillStyle = 'rgba(139,92,246,0.18)'; ctx.fill()
  ctx.strokeStyle = 'rgba(196,181,253,0.45)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '600 18px "Geist Mono", monospace'; ctx.fillStyle = ROXO_CLARO
  ctx.fillText('DISTINTIVO', F.x + F.w / 2, F.y + F.h + 54)
  ctx.font = '700 30px "Geist Mono", monospace'; ctx.fillStyle = '#ffffff'
  ctx.fillText(d.distintivo.trim() || '—', F.x + F.w / 2, F.y + F.h + 88)

  // Campos
  const X = 480, CW = 600
  campo(ctx, 'Nome', d.nome, X, 248, CW)
  campo(ctx, 'Codinome', d.codinome, X, 350, CW, true)
  campo(ctx, 'Cargo', d.cargo, X, 470, CW)
  campo(ctx, 'Passaporte', d.passaporte, X, 572, 280)
  campo(ctx, 'Emissão', d.emissao, X + 320, 572, 280)
  campo(ctx, 'Validade', d.validade, X + 320, 674, 280)
  campo(ctx, 'Unidade', 'Detective Unit', X, 674, 280)

  // Holograma
  const hx = W - 250, hy = 250
  const holo = ctx.createLinearGradient(hx - 110, hy - 110, hx + 110, hy + 110)
  holo.addColorStop(0, 'rgba(196,181,253,0.55)'); holo.addColorStop(0.35, 'rgba(110,231,255,0.35)')
  holo.addColorStop(0.65, 'rgba(244,114,182,0.35)'); holo.addColorStop(1, 'rgba(139,92,246,0.55)')
  ctx.save()
  ctx.beginPath(); ctx.arc(hx, hy, 110, 0, Math.PI * 2); ctx.fillStyle = holo; ctx.fill()
  ctx.globalAlpha = 0.85
  if (img.emblema) ctx.drawImage(img.emblema, hx - 82, hy - 82, 164, 164)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(hx, hy, 110, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  // Assinatura
  const sx = W - 250, sy = 640
  ctx.textAlign = 'center'
  if (d.assinatura.trim()) {
    ctx.font = '400 72px "Great Vibes", cursive'
    ctx.fillStyle = LAVANDA
    ctx.fillText(d.assinatura.trim(), sx, sy)
  }
  ctx.strokeStyle = 'rgba(233,221,255,0.6)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(sx - 190, sy + 20); ctx.lineTo(sx + 190, sy + 20); ctx.stroke()
  ctx.font = '600 18px "Geist Mono", monospace'; ctx.fillStyle = ROXO_CLARO
  ctx.fillText('COMANDO DA DETECTIVE UNIT', sx, sy + 50)

  // Faixa inferior (MRZ)
  ctx.fillStyle = 'rgba(7,5,11,0.72)'
  ctx.fillRect(0, H - 168, W, 168)
  ctx.fillStyle = ROXO
  ctx.fillRect(0, H - 168, W, 4)
  const [l1, l2] = mrz(d)
  ctx.textAlign = 'left'
  ctx.font = '600 38px "Geist Mono", monospace'
  ctx.fillStyle = 'rgba(233,221,255,0.85)'
  ctx.fillText(l1, 64, H - 100)
  ctx.fillText(l2, 64, H - 46)

  ctx.restore()

  // Borda do cartão
  ctx.save()
  retArredondado(ctx, 3, 3, W - 6, H - 6, 46)
  ctx.strokeStyle = 'rgba(196,181,253,0.5)'; ctx.lineWidth = 4; ctx.stroke()
  ctx.restore()
}

/** Validade padrão: 1 ano após a emissão (dd/mm/aaaa). */
export function validadePadrao(emissao: Date = new Date()): string {
  const v = new Date(emissao); v.setFullYear(v.getFullYear() + 1)
  return v.toLocaleDateString('pt-BR')
}
