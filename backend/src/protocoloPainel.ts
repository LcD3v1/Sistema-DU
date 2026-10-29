/**
 * Painel do Protocolo Operacional no Discord (Componentes V2): título · mensagem · linha · capítulos ·
 * botão que abre o livro (flipbook do Heyzine) · linha · rodapé padrão (fotinha + nome do servidor).
 * Imagens soltas (até 4) na posição escolhida: topo, depois do título, depois dos capítulos,
 * logo depois do botão ou no fim (antes do rodapé).
 *
 * O bot só publica/edita A PRÓPRIA mensagem do painel (mesma regra dos painéis de hierarquia e setagem):
 * edita quando o conteúdo muda; mudou de canal = publica de novo no canal novo.
 */
import crypto from 'crypto'
import { readData, writeData } from './data'
import { discordConfig, infoServidor, publicarV2, AnexoPainel } from './discord'
import { galeriasDoPainel, rodapeV2 } from './hierarquia'
import { emojiDoRodape } from './rodapeDiscord'
import { DuData, Protocolo } from './types'

const COR_PAINEL = 0x8b5cf6
const linha = () => ({ type: 14, divider: true, spacing: 2 })
const texto = (content: string) => ({ type: 10, content: content.slice(0, 4000) })
/** Escapa a formatação do Discord em textos configurados (capítulos, mensagem). */
const escapar = (t: string) => t.replace(/([\\*_~`|>#-])/g, '\\$1')

export const protocoloPadrao = (): Protocolo => ({
  flipbook: 'https://heyzine.com/flip-book/79e82a2e02.html',
  secoes: ['Introdução', 'Juramento', 'Diretrizes Gerais', 'Hierarquia', 'Especialização da DU', 'Organização de PTR',
    'Acompanhamento', 'Acompanhamento 2.0', 'Viatura e Fardamento', 'Site da DU', 'Conclusão'],
})
export const protocoloAtual = (data: Pick<DuData, 'protocolo'>): Protocolo => data.protocolo ?? protocoloPadrao()

export function montarPainelProtocolo(p: Protocolo, servidor: string, emojiRodape: string): { componentes: unknown[]; anexos: AnexoPainel[] } {
  const g = galeriasDoPainel(p.imagens)
  const capitulos = p.secoes.map((s, i) => `**${String(i + 1).padStart(2, '0')}** · ${escapar(s)}`)
  return {
    anexos: g.anexos,
    componentes: [{
      type: 17,
      accent_color: COR_PAINEL,
      components: [
        ...g.em('topo'),
        texto(`# 📘 Protocolo Operacional\n${p.descricao ? escapar(p.descricao) : 'Documento oficial da unidade. Leia com atenção: todo membro deve conhecer e seguir o protocolo.'}`),
        ...g.em('titulo'),
        linha(),
        ...(capitulos.length ? [texto(`### Conteúdo\n${capitulos.join('\n')}`)] : []),
        ...g.em('passos'),
        // Botão de link (style 5): abre o livro no navegador — não gera clique no bot
        { type: 1, components: [{ type: 2, style: 5, label: 'Abrir o protocolo', url: p.flipbook, emoji: { name: '📖' } }] },
        ...g.em('botao'),
        ...g.em('fim'),
        linha(),
        rodapeV2(servidor || 'Protocolo', emojiRodape),
      ],
    }],
  }
}

export interface EstadoPainelProtocolo { erro?: 'sem_acesso' | 'discord' | 'sem_canal' | 'nao_configurado'; ultimaAtualizacao?: string }
const estado: EstadoPainelProtocolo = {}
export const estadoPainelProtocolo = (): EstadoPainelProtocolo => ({ ...estado })

let ultimoHash = ''
let rodando: Promise<void> | undefined
let deNovo = false

/** Publica/edita o painel (uma execução por vez; pedidos durante ela viram UMA nova rodada). */
export function publicarProtocolo(forcar = false): Promise<void> {
  if (rodando) { deNovo = true; return rodando }
  rodando = executar(forcar).finally(() => {
    rodando = undefined
    if (deNovo) { deNovo = false; void publicarProtocolo(true).catch(() => undefined) }
  })
  return rodando
}

async function executar(forcar: boolean): Promise<void> {
  const cfg = discordConfig()
  const p = protocoloAtual(readData())
  if (!cfg) { estado.erro = 'nao_configurado'; return }
  if (!p.canalId) { estado.erro = 'sem_canal'; return }
  const info = await infoServidor(cfg)
  const emoji = await emojiDoRodape(cfg, info?.botAvatar)
  const { componentes, anexos } = montarPainelProtocolo(p, info?.nome ?? '', emoji)
  const hash = crypto.createHash('sha256').update(JSON.stringify([p.canalId, componentes, p.imagens ?? []])).digest('hex')
  if (!forcar && hash === ultimoHash && p.mensagemId) return
  const id = await publicarV2(cfg, p.canalId, p.mensagemId, componentes, anexos)
  if (id === 'sem_acesso') { estado.erro = 'sem_acesso'; return }
  if (!id) { estado.erro = 'discord'; return }
  ultimoHash = hash
  estado.erro = undefined
  estado.ultimaAtualizacao = new Date().toISOString()
  if (id !== p.mensagemId) {
    const data = readData()
    const atual = protocoloAtual(data)
    if (atual.canalId === p.canalId) { data.protocolo = { ...atual, mensagemId: id }; writeData(data) }
  }
}
