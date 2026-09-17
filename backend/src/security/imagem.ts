/**
 * Imagens aceitas no sistema: arquivo enviado (data URL de imagem) OU qualquer
 * link http/https. Links com outros protocolos (javascript:, file:, etc.) são recusados.
 */
const DATA_URL_IMAGEM = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]/
export const MAX_URL_IMAGEM = 2048

export function ehLinkImagem(valor: string): boolean {
  if (valor.length > MAX_URL_IMAGEM || /\s/.test(valor)) return false
  try {
    const url = new URL(valor)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch { return false }
}

export function ehImagemEnviada(valor: string): boolean {
  return DATA_URL_IMAGEM.test(valor)
}

export function imagemValida(valor: unknown): boolean {
  return typeof valor === 'string' && (ehImagemEnviada(valor) || ehLinkImagem(valor))
}
