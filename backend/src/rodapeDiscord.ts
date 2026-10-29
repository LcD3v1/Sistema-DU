/**
 * Rodapé padrão de TODOS os painéis do Discord (regra do projeto):
 *   -# <fotinha> **Nome do servidor**
 * pequeno, no canto de baixo à esquerda (como o rodapé de um embed). Em Componentes V2 não existe
 * rodapé com ícone, então a "fotinha" é um EMOJI DO PRÓPRIO BOT criado a partir da imagem escolhida
 * (upload ou link copiado pelo navegador) ou, sem imagem, da foto do bot.
 * O backend nunca baixa link de usuário (sem SSRF): só data URL conferida ou foto do CDN do Discord.
 */
import crypto from 'crypto'
import {
  DiscordConfig, baixarFotoDiscord, emojisDoBot, criarEmojiDoBot, apagarEmojiDoBot, NOME_EMOJI_RODAPE,
} from './discord'

const MAX_BYTES_EMOJI = 256 * 1024
const MAX_EMOJIS_RODAPE = 8                     // guarda poucos (troca de foto não acumula)
const ASSINATURAS: [RegExp, string, (b: Buffer) => boolean][] = [
  [/^png$/, 'image/png', b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  [/^jpe?g$/, 'image/jpeg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  [/^gif$/, 'image/gif', b => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'))],
  [/^webp$/, 'image/webp', b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
]

/** data:image/...;base64 → bytes conferidos pela assinatura. */
function bytesDoDataUrl(valor: string): { dados: Buffer; mime: string } | undefined {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor)
  if (!m) return undefined
  const dados = Buffer.from(m[2], 'base64')
  const tipo = ASSINATURAS.find(([re]) => re.test(m[1]))
  return tipo && tipo[2](dados) ? { dados, mime: tipo[1] } : undefined
}

const cache = new Map<string, string>()          // hash da imagem → "<:du_x:id>"
let fila: Promise<unknown> = Promise.resolve()

/**
 * Emoji do rodapé para a imagem dada (data URL ou foto do CDN do Discord). Mesma imagem = mesmo emoji.
 * '' se não der (link externo, imagem grande demais, Discord fora) — o rodapé sai só com o nome.
 */
export function emojiDoRodape(cfg: DiscordConfig, fonte: string | undefined): Promise<string> {
  const tarefa = fila.then(async () => {
    if (!fonte) return ''
    const img = fonte.startsWith('data:') ? bytesDoDataUrl(fonte) : await baixarFotoDiscord(fonte, 128)
    if (!img || img.dados.length > MAX_BYTES_EMOJI) return ''
    const hash = crypto.createHash('sha256').update(img.dados).digest('hex').slice(0, 16)
    const nome = `du_${hash}`
    const pronto = cache.get(hash)
    if (pronto) return pronto
    const lista = await emojisDoBot(cfg)
    if (!lista) return ''
    const animado = img.mime === 'image/gif'
    let id = lista.find(e => e.nome === nome)?.id
    if (!id) {
      // Limpa os mais antigos do painel antes de criar (nunca toca em emoji que não seja du_<hash>)
      const doPainel = lista.filter(e => NOME_EMOJI_RODAPE.test(e.nome) && ![...cache.values()].some(v => v.includes(`:${e.id}>`)))
        .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
      for (const velho of doPainel.slice(0, Math.max(0, doPainel.length - (MAX_EMOJIS_RODAPE - 1)))) await apagarEmojiDoBot(cfg, velho)
      id = await criarEmojiDoBot(cfg, nome, `data:${img.mime};base64,${img.dados.toString('base64')}`)
      if (!id) return ''
    }
    const texto = `<${animado ? 'a' : ''}:${nome}:${id}>`
    cache.set(hash, texto)
    return texto
  })
  fila = tarefa.catch(() => '')
  return tarefa.catch(() => '')
}
