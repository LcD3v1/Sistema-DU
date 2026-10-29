/**
 * Qualquer foto vira imagem segura ANTES de sair do navegador.
 *
 * Aceita PDF (1ª página) e qualquer formato que o navegador consiga abrir (PNG, JPG, WEBP, GIF,
 * AVIF, BMP, SVG, ICO, TIFF/HEIC onde o navegador suportar). Tudo é redesenhado num canvas e
 * exportado como PNG/JPEG/WEBP — o servidor só recebe `data:image/(png|jpeg|webp|gif)` e confere
 * os bytes de novo. Assim PDF/SVG crus (que podem carregar scripts) nunca são guardados.
 */

/** Valor do `accept` dos campos de foto: imagens de qualquer tipo + PDF. */
export const ACEITA_FOTO = 'image/*,application/pdf,.pdf,.heic,.heif,.avif,.bmp,.tif,.tiff,.svg,.ico'

/** Tamanho máximo do ARQUIVO escolhido (antes da conversão, que reduz para poucos MB). */
export const MAX_ARQUIVO_FOTO = 500 * 1024 * 1024

export type FormatoFoto = 'image/png' | 'image/jpeg' | 'image/webp'

export interface OpcoesFoto {
  /** Lado maior da imagem final, em px. */
  maxLado?: number
  /** Formato final (padrão PNG; JPEG para fotos grandes sem transparência). */
  formato?: FormatoFoto
  qualidade?: number
  /** Mantém GIF animado como está se for pequeno (até este tamanho em bytes). */
  manterGifAte?: number
}

const ehPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

export class ErroFoto extends Error {}

function lerDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new ErroFoto('Não foi possível ler o arquivo.'))
    r.readAsDataURL(arquivo)
  })
}

function abrirImagem(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ErroFoto('Esse formato de imagem não abre neste navegador. Tente PNG, JPG ou PDF.')) }
    img.src = url
  })
}

/** Desenha a 1ª página do PDF num canvas (pdf.js da Mozilla, sem eval, scripts do PDF desligados). */
async function canvasDoPdf(arquivo: File, maxLado: number): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const dados = new Uint8Array(await arquivo.arrayBuffer())
  let doc
  try {
    doc = await pdfjs.getDocument({ data: dados, isEvalSupported: false, enableXfa: false, disableFontFace: false }).promise
  } catch {
    throw new ErroFoto('Não foi possível abrir esse PDF (protegido por senha ou corrompido?).')
  }
  try {
    const pagina = await doc.getPage(1)
    const base = pagina.getViewport({ scale: 1 })
    const escala = Math.min(4, maxLado / Math.max(base.width, base.height))
    const vp = pagina.getViewport({ scale: escala })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(vp.width))
    canvas.height = Math.max(1, Math.round(vp.height))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'                       // PDF sem fundo vira página branca
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise
    return canvas
  } finally {
    void doc.destroy()
  }
}

function canvasDaImagem(img: HTMLImageElement, maxLado: number, fundo?: string): HTMLCanvasElement {
  const w = img.naturalWidth || img.width || maxLado
  const h = img.naturalHeight || img.height || maxLado
  const escala = Math.min(1, maxLado / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * escala))
  canvas.height = Math.max(1, Math.round(h * escala))
  const ctx = canvas.getContext('2d')!
  if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Converte o arquivo escolhido (imagem de qualquer tipo ou PDF) em data URL de imagem segura.
 * Lança ErroFoto com mensagem pronta para mostrar ao usuário.
 */
export async function fotoDoArquivo(arquivo: File, opcoes: OpcoesFoto = {}): Promise<string> {
  const { maxLado = 1024, formato = 'image/png', qualidade = 0.9, manterGifAte = 0 } = opcoes
  if (arquivo.size > MAX_ARQUIVO_FOTO) throw new ErroFoto('Imagem excede 500 MB.')
  if (arquivo.size === 0) throw new ErroFoto('Arquivo vazio.')

  let canvas: HTMLCanvasElement
  if (ehPdf(arquivo)) {
    canvas = await canvasDoPdf(arquivo, maxLado)
  } else {
    if (arquivo.type === 'image/gif' && arquivo.size <= manterGifAte) {
      const gif = await lerDataUrl(arquivo)
      if (gif.startsWith('data:image/gif;base64,')) return gif   // mantém a animação
    }
    if (arquivo.type && !arquivo.type.startsWith('image/')) throw new ErroFoto('Escolha uma imagem ou um PDF.')
    const img = await abrirImagem(arquivo)
    canvas = canvasDaImagem(img, maxLado, formato === 'image/jpeg' ? '#000' : undefined)
  }
  const saida = canvas.toDataURL(formato, qualidade)
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(saida)) throw new ErroFoto('Não foi possível converter a imagem.')
  return saida
}

/** Bytes reais de um data URL (base64). */
export const bytesDoDataUrl = (dataUrl: string) => Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4)

/**
 * Converte e, se passar do teto (o servidor recusa acima de 1 MB), comprime em WEBP com
 * qualidade e lado menores até caber. GIF pequeno segue como está (mantém a animação).
 */
export async function fotoComTeto(arquivo: File, { maxLado, maxBytes, manterGifAte = 0 }: { maxLado: number; maxBytes?: number; manterGifAte?: number }): Promise<string> {
  const primeira = await fotoDoArquivo(arquivo, { maxLado, manterGifAte })
  if (!maxBytes || bytesDoDataUrl(primeira) <= maxBytes) return primeira
  for (const [fator, qualidade] of [[1, 0.85], [1, 0.7], [0.75, 0.7], [0.5, 0.65], [0.35, 0.6]] as const) {
    const menor = await fotoDoArquivo(arquivo, { maxLado: Math.round(maxLado * fator), formato: 'image/webp', qualidade })
    if (bytesDoDataUrl(menor) <= maxBytes) return menor
  }
  throw new ErroFoto('Imagem grande demais mesmo comprimida. Use uma imagem menor ou cole um link.')
}

/** Mesma conversão, mas devolve um File (para rotas que recebem arquivo, ex.: galeria). */
export async function arquivoDeFoto(arquivo: File, opcoes: OpcoesFoto = {}): Promise<File> {
  const dataUrl = await fotoDoArquivo(arquivo, opcoes)
  const [cab, b64] = dataUrl.split(',')
  const mime = cab.slice(5, cab.indexOf(';'))
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
  const nome = (arquivo.name.replace(/\.[^.]+$/, '') || 'foto').replace(/[^\w.-]+/g, '_').slice(0, 80)
  return new File([bytes], `${nome}.${ext}`, { type: mime })
}

/**
 * Copia a imagem de um LINK para virar arquivo do sistema (fica guardada mesmo se o link sair do ar).
 * Quem baixa é o NAVEGADOR (o backend nunca busca links de usuários — sem SSRF): a imagem é carregada
 * com crossOrigin, redesenhada no canvas e exportada; só funciona se o site do link permitir (CORS).
 * Lança ErroFoto se o site não permitir copiar ou o link não for uma imagem.
 */
export async function arquivoDoLink(url: string, opcoes: OpcoesFoto = {}): Promise<File> {
  const { maxLado = 1600, formato = 'image/webp', qualidade = 0.88 } = opcoes
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.referrerPolicy = 'no-referrer'
    i.decoding = 'async'
    const tempo = setTimeout(() => { i.src = ''; reject(new ErroFoto('O link demorou demais para responder.')) }, 20_000)
    i.onload = () => { clearTimeout(tempo); resolve(i) }
    i.onerror = () => { clearTimeout(tempo); reject(new ErroFoto('Não foi possível copiar a imagem desse link (o site não permite ou não é uma imagem).')) }
    i.src = url
  })
  const canvas = canvasDaImagem(img, maxLado, formato === 'image/jpeg' ? '#000' : undefined)
  let dataUrl: string
  try { dataUrl = canvas.toDataURL(formato, qualidade) }
  catch { throw new ErroFoto('O site desse link não permite copiar a imagem.') }
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) throw new ErroFoto('Não foi possível converter a imagem do link.')
  const [cab, b64] = dataUrl.split(',')
  const mime = cab.slice(5, cab.indexOf(';'))
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const nome = (new URL(url).pathname.split('/').pop() || 'imagem').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'imagem'
  return new File([bytes], `${nome}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`, { type: mime })
}

export const mensagemErroFoto =(e: unknown) => e instanceof ErroFoto ? e.message : 'Não foi possível ler essa imagem.'
