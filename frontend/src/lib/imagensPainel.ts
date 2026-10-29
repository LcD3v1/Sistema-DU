/** Imagem solta num painel do Discord (Componentes V2), na posição escolhida. */
/** `lado`: null/ausente = largura toda; esquerda/direita = metade do painel, no lado escolhido. */
export interface ImagemPainel { posicao: string; url: string; lado?: 'esquerda' | 'direita' | null }
export interface PosicaoImagem { valor: string; rotulo: string }

/** Igual ao backend: até 4 imagens por painel. */
export const MAX_IMAGENS_PAINEL = 4
/** O servidor aceita imagem enviada de até 1 MB: o campo comprime para ficar abaixo disto. */
export const MAX_BYTES_IMAGEM = 950_000
/** O servidor aceita até 5 MB por envio: avisa antes, em vez de deixar o salvar falhar. */
export const envioGrandeDemais = (corpo: unknown) => JSON.stringify(corpo).length > 4_800_000

/** Nome da primeira imagem enviada acima de 1 MB (o servidor recusaria), ou undefined. */
export function imagemGrandeDemais(imagens: { rotulo: string; url: string | null }[]): string | undefined {
  const bytes = (u: string) => Math.floor((u.length - u.indexOf(',') - 1) * 3 / 4)
  return imagens.find(i => i.url?.startsWith('data:') && bytes(i.url) > 1024 * 1024)?.rotulo
}
