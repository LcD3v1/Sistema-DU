import { discordFetch, listarForuns, GUILD_TEXT, GUILD_ANNOUNCEMENT } from './forum'

/**
 * Mensagens do painel enviadas pelo bot em Components V2 (container da DU):
 *  - "Enviar mensagem": o membro escreve e escolhe o canal;
 *  - Avisos: todo aviso publicado vai também para o canal configurado.
 *
 * `allowed_mentions` vazio: a mensagem pode citar @alguém, mas NUNCA notifica
 * ninguém (nada de @everyone/@here/cargo disparado pelo painel).
 */

const IS_COMPONENTS_V2 = 1 << 15
const COR_FAST = 0x8b5cf6
const TIPOS_TEXTO = new Set([GUILD_TEXT, GUILD_ANNOUNCEMENT])
export const MAX_TITULO = 100
export const MAX_MENSAGEM = 3500   // o Discord aceita 4000 no total dos textos do container

export interface PainelMensagem {
  titulo?: string
  mensagem: string
  rotulo: string          // linha pequena de cima, ex.: "Comunicado" ou "Aviso da unidade"
  autor: string           // já pronto: menção <@id> ou nome
}

/** URL pública do site (para o brasão no canto); sem PUBLIC_URL, o painel sai sem imagem. */
function logoPublica(): string | null {
  const base = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '')
  return base && /^https:\/\/[\w.-]+(:\d+)?$/i.test(base) ? `${base}/icon-512.png` : null
}

export function montarPainel(p: PainelMensagem) {
  const cabecalho = [`-# ${p.rotulo.toUpperCase()} · DU`, p.titulo?.trim() ? `## ${p.titulo.trim()}` : ''].filter(Boolean).join('\n')
  const logo = logoPublica()
  const topo = logo
    ? { type: 9, components: [{ type: 10, content: cabecalho }], accessory: { type: 11, media: { url: logo } } }
    : { type: 10, content: cabecalho }
  const quando = Math.floor(Date.now() / 1000)
  return {
    flags: IS_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [{
      type: 17,
      accent_color: COR_FAST,
      components: [
        topo,
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: p.mensagem.trim().slice(0, MAX_MENSAGEM) },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: `-# Enviado por ${p.autor} · <t:${quando}:f> · DU · Detroit Police Department` },
      ],
    }],
  }
}

/** Canais de texto/anúncio do servidor onde o bot pode mandar o painel. */
export async function canaisDeTexto(): Promise<{ id: string; name: string }[]> {
  return (await listarForuns()).filter(c => TIPOS_TEXTO.has(c.type)).map(c => ({ id: c.id, name: c.name }))
}

export async function canalDeTextoValido(canalId: string): Promise<boolean> {
  return (await canaisDeTexto()).some(c => c.id === canalId)
}

/** Posta o painel e devolve o ID da mensagem. Lança erro (sem detalhes do Discord) se falhar. */
export async function enviarPainel(canalId: string, painel: PainelMensagem): Promise<string> {
  const res = await discordFetch('POST', `/channels/${canalId}/messages`, montarPainel(painel))
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Discord POST mensagem → ${res.status} ${txt.slice(0, 200)}`)
  }
  return ((await res.json()) as { id: string }).id
}

/** Apaga a mensagem (best effort: 404 = já não existe). */
export async function apagarMensagem(canalId: string, mensagemId: string): Promise<void> {
  const res = await discordFetch('DELETE', `/channels/${canalId}/messages/${mensagemId}`)
  if (!res.ok && res.status !== 404) throw new Error(`Discord DELETE mensagem → ${res.status}`)
}
