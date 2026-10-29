/**
 * Setagem pelo Discord (mensagens em Componentes V2):
 *  1. o bot mantém o painel "Solicitar set" no canal escolhido (texto, botão e rodapé com imagem à direita);
 *  2. o botão abre o modal: codinome, passaporte (ID in-game) e patente. Quem já tem pedido pendente
 *     abre o modal JÁ PREENCHIDO (editar pedido); quem já tem cadastro aprovado não pede de novo;
 *  3. ao enviar, o apelido vira "{prefixo} {codinome} | {id}" na hora e o bot cria um CANAL TEMPORÁRIO
 *     privado (categoria configurada) com o painel do pedido: Aprovar · Reprovar · Refazer preenchimento;
 *  4. só os cargos aprovadores (ou administradores do servidor / donos) usam esses botões — nunca no
 *     próprio pedido. Aprovar/reprovar apaga o canal temporário. Refazer: motivo → confirmação →
 *     painel no privado da pessoa com o motivo e um botão que leva ao canal da setagem.
 *
 * Segurança: interações só do servidor da unidade (Gateway autenticado); quem clica é conferido pelos
 * cargos que o Discord manda (não pelo navegador); cargo do Discord e acesso ao site SÓ na aprovação;
 * 1 envio/30 s por pessoa; textos validados (sem menção/formatação); exonerado não pede.
 */
import crypto from 'crypto'
import { readData, writeData } from './data'
import {
  discordConfig, responderInteracao, editarResposta, alterarApelido, darCargo, infoServidor,
  publicarV2, criarCanalTemporario, apagarCanalTemporario, enviarPrivado, tirarCargo, criarCargo,
  usuarioLivre, contaDoDiscord, Interacao, DiscordConfig, ResultadoMembro, AnexoPainel,
} from './discord'
import { imagemEnviada, rodapeV2, galeriasDoPainel } from './hierarquia'
import { emojiDoRodape } from './rodapeDiscord'
import { notificar, notificarArea, notificarQuemAprova } from './notificacoes'
import { audit } from './security/audit'
import { CargoPermissao, Conta, DuData, Membro, PatenteSetagem, Setagem, SetorSetagem, SolicitacaoAcesso } from './types'
import { nomeDaConta } from './registros'
import { hoje as hojeSP } from './efetivo'
import { cargoConcedeEditar, podeAtribuirCargo } from './access'

export const MODELO_PADRAO = '{prefixo} {codinome} | {id}'
const ID_BOTAO = 'du:setagem:abrir'
const ID_MODAL = 'du:setagem:modal'
// Botões/modais do painel do pedido (o ID do pedido vai no fim)
const P_APROVAR = 'du:set:aprovar:'
const P_REPROVAR = 'du:set:reprovar:'
const P_CORRIGIR = 'du:set:corrigir:'
const P_MOTIVO_REPROVAR = 'du:set:motivo-reprovar:'
const P_MOTIVO_CORRIGIR = 'du:set:motivo-corrigir:'
const P_CONFIRMAR = 'du:set:confirmar:'
const P_CANCELAR = 'du:set:cancelar:'
const MAX_APELIDO = 32   // limite do Discord

export const setagemPadrao = (): Setagem => ({
  titulo: 'Solicitar set', modeloApelido: MODELO_PADRAO, patentes: [], nextPatenteId: 1, versao: 0,
})
/**
 * Setagem atual. O apelido é sempre "{prefixo} {codinome} | {id}" (modelos antigos viram este) e
 * patentes antigas com um cargo só (roleId) são lidas como roleIds.
 */
export const setagemAtual = (data: Pick<DuData, 'setagem'>): Setagem => {
  const s = data.setagem ?? setagemPadrao()
  return {
    ...s,
    modeloApelido: MODELO_PADRAO,
    patentes: s.patentes.map(p => ({ ...p, roleIds: p.roleIds?.length ? p.roleIds : p.roleId ? [p.roleId] : [] })),
    setores: (s.setores ?? []).map(x => ({ ...x, roleIds: x.roleIds ?? [] })),
    nextSetorId: s.nextSetorId ?? Math.max(0, ...(s.setores ?? []).map(x => x.id)) + 1,
    advertencias: s.advertencias ?? [],
  }
}

/** Patentes da DU (de cima para baixo) e prefixos sugeridos do apelido. */
export const PATENTES_DU: [string, string][] = [
  ['Supervisor of Detectives', 'SOD'], ['Chief of Detectives', 'CD'], ['Deputy Chief of Detectives', 'DCD'], ['Investigative Coordinator', 'IC'],
  ['Investigative Inspector', 'II'], ['Senior Detective', 'SD'], ['Detective', 'DET'], ['Investigator Trainee', 'IT'],
]
/** Setores/subunidades iniciais; o combinado dá os cargos dos dois (configurados no painel). */
export const SETORES_DU = ['COD', 'DNARC', 'COD/DNARC']

/**
 * Uma vez: cadastra as patentes da DU que faltarem (sem mexer nas existentes, que mantêm ID,
 * prefixo e cargos) na ordem da hierarquia, e os setores iniciais. Muta `data`; true se mudou.
 */
export function cadastrarPatentesESetores(data: DuData): boolean {
  if (data.migracaoSetores) return false
  const s = setagemAtual(data)
  let nextPatenteId = s.nextPatenteId
  const restantes = [...s.patentes]
  const ordenadas: PatenteSetagem[] = []
  for (const [nome, prefixo] of PATENTES_DU) {
    const i = restantes.findIndex(p => p.nome.trim().toLowerCase() === nome.toLowerCase())
    if (i >= 0) ordenadas.push(restantes.splice(i, 1)[0])
    else ordenadas.push({ id: nextPatenteId++, nome, prefixo, roleIds: [] })
  }
  let nextSetorId = s.nextSetorId ?? 1
  const setores = [...(s.setores ?? [])]
  for (const nome of SETORES_DU) {
    if (!setores.some(x => x.nome.toLowerCase() === nome.toLowerCase())) setores.push({ id: nextSetorId++, nome, roleIds: [] })
  }
  data.setagem = { ...s, patentes: [...ordenadas, ...restantes], nextPatenteId, setores, nextSetorId, versao: s.versao + 1 }
  data.migracaoSetores = true
  data.patentesDuVersao = VERSAO_PATENTES_DU
  data.patentes = PATENTES_DU.map(([nome]) => nome)
  return true
}

/** Versão da lista PATENTES_DU (sobe quando a lista muda). */
export const VERSAO_PATENTES_DU = 2

/**
 * Atualiza as patentes de quem já tinha o cadastro antigo: põe as que faltarem (ex.: Supervisor of Detectives)
 * na ordem da hierarquia, sem mexer nas existentes (ID, prefixo, cargos), e troca a lista antiga de
 * Configurações → Patentes (Recruta, Soldado…) pelas patentes da DU. Uma vez por versão; muta `data`.
 */
export function atualizarPatentesDu(data: DuData): boolean {
  if (!data.migracaoSetores || (data.patentesDuVersao ?? 1) >= VERSAO_PATENTES_DU) return false
  const s = setagemAtual(data)
  let nextPatenteId = s.nextPatenteId
  const restantes = [...s.patentes]
  const ordenadas: PatenteSetagem[] = []
  for (const [nome, prefixo] of PATENTES_DU) {
    const i = restantes.findIndex(p => p.nome.trim().toLowerCase() === nome.toLowerCase())
    if (i >= 0) ordenadas.push(restantes.splice(i, 1)[0])
    else ordenadas.push({ id: nextPatenteId++, nome, prefixo, roleIds: [] })
  }
  data.setagem = { ...s, patentes: [...ordenadas, ...restantes], nextPatenteId, versao: s.versao + 1 }
  data.patentes = PATENTES_DU.map(([nome]) => nome)
  data.patentesDuVersao = VERSAO_PATENTES_DU
  return true
}

// Codinome: letras, números, espaço, ponto, hífen e sublinhado (sem @, #, `, * … — nada de menção/formatação)
const CODINOME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u
const PASSAPORTE = /^\d{1,10}$/
/** Motivo/observação digitado por quem aprova: texto puro, sem menções nem blocos de código. */
const limparTexto = (t: string, max: number) => t.replace(/[@`]/g, '').replace(/\s+\n/g, '\n').trim().slice(0, max)

/** Apelido no modelo configurado. */
export function montarApelido(modelo: string, p: { prefixo: string; codinome: string; id: string }): string {
  return modelo.replace(/\{prefixo\}/g, p.prefixo).replace(/\{codinome\}/g, p.codinome).replace(/\{id\}/g, p.id).replace(/\s+/g, ' ').trim()
}

/** Valida os campos do modal. Devolve o erro (texto para a pessoa) ou os dados prontos. */
export function validarPedido(s: Setagem, campos: Record<string, string>):
  { erro: string } | { codinome: string; passaporte: string; patente: PatenteSetagem; setor?: SetorSetagem; apelido: string } {
  const codinome = (campos.codinome ?? '').trim().replace(/\s+/g, ' ')
  const passaporte = (campos.passaporte ?? '').trim()
  const patente = s.patentes.find(p => String(p.id) === campos.patente)
  if (!CODINOME.test(codinome)) return { erro: 'Codinome inválido: use de 2 a 20 letras, números, espaço, ponto, hífen ou sublinhado.' }
  if (!PASSAPORTE.test(passaporte)) return { erro: 'Passaporte inválido: use só números (até 10).' }
  if (!patente) return { erro: 'Escolha uma patente da lista.' }
  const setores = s.setores ?? []
  const setor = setores.find(x => String(x.id) === campos.setor)
  // Setor é OPCIONAL: vazio = sem setor; se escolheu, tem de ser um da lista
  if (campos.setor && !setor) return { erro: 'Setor inválido: escolha um da lista ou deixe em branco.' }
  const apelido = montarApelido(s.modeloApelido, { prefixo: patente.prefixo, codinome, id: passaporte })
  if (apelido.length > MAX_APELIDO) return { erro: `O apelido ficaria com ${apelido.length} caracteres (o Discord aceita ${MAX_APELIDO}). Use um codinome menor.` }
  return { codinome, passaporte, patente, ...(setor ? { setor } : {}), apelido }
}

// ── Componentes V2 ───────────────────────────────────────────────────────────

const texto = (content: string) => ({ type: 10, content: content.slice(0, 4000) })
/** Linha separadora: só entre o título e o conteúdo e entre o conteúdo e o rodapé. */
const linha = () => ({ type: 14, divider: true, spacing: 2 })
/** Barra lateral: roxo do tema (igual à hierarquia); pedido em correção fica âmbar. */
const COR_PAINEL_SETAGEM = 0x8b5cf6
const COR_CORRECAO = 0xf59e0b
const botao = (custom_id: string, label: string, style: number, emoji?: string) => ({ type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}) })

/** Rodapé padrão (regra): fotinha (emoji do bot) + nome do servidor, pequeno, embaixo à esquerda. */
type InfoPainel = { servidor: string; botAvatar?: string; emoji?: string }
const rodape = (s: Setagem, info: InfoPainel) => rodapeV2(s.rodapeTexto || info.servidor || 'Setagem', info.emoji ?? '')

/**
 * Painel "Solicitar set": título grande + mensagem · linha · passo a passo · exemplo do apelido · botão · linha · rodapé.
 * Imagens soltas (até 4) na posição escolhida: topo, depois do título, depois do passo a passo, antes do botão,
 * logo depois do botão ou no fim (antes do rodapé).
 */
export function montarPainelSetagem(s: Setagem, info: InfoPainel): { componentes: unknown[]; anexos: AnexoPainel[] } {
  const exemplo = s.patentes[0] ? montarApelido(s.modeloApelido, { prefixo: s.patentes[0].prefixo, codinome: 'Codinome', id: '12345' }) : ''
  const g = galeriasDoPainel(s.imagens)
  return {
    anexos: g.anexos,
    componentes: [{
      type: 17,
      accent_color: COR_PAINEL_SETAGEM,
      components: [
        ...g.em('topo'),
        texto(`# ${s.titulo}\n${s.descricao || 'Clique no botão abaixo para solicitar o seu set.'}`),
        ...g.em('titulo'),
        linha(),
        texto([
          '### Como funciona',
          '**1.** Clique em **Solicitar set** e preencha o formulário.',
          `**2.** Informe o **codinome**, o **passaporte** (ID in-game), a **patente**${s.setores?.length ? ' e, se quiser, o **setor**' : ''}.`,
          '**3.** Seu apelido muda na hora e o comando avalia o pedido.',
          '**4.** Aprovado, você recebe o cargo e o acesso ao painel.',
        ].join('\n')),
        ...g.em('passos'),
        ...(exemplo ? [texto(`### Seu apelido fica assim\n> **${exemplo.replace(/[*_~`|]/g, m => `\\${m}`)}**`)] : []),
        ...g.em('texto'),
        { type: 1, components: [botao(ID_BOTAO, 'Solicitar set', 1, '📝')] },
        ...g.em('botao'),
        texto('-# Já pediu? Clique de novo para editar o seu pedido enquanto ele não for aprovado.'),
        ...g.em('fim'),
        linha(),
        rodape(s, info),
      ],
    }],
  }
}

/** Painel do pedido no canal temporário: dados do modal, foto da pessoa à direita e os botões. */
function painelPedido(s: Setagem, sol: SolicitacaoAcesso, info: InfoPainel): { componentes: unknown[]; anexos: AnexoPainel[] } {
  const d = sol.setagem!
  const patente = s.patentes.find(p => p.id === d.patenteId)
  const setor = d.setorId ? s.setores?.find(x => x.id === d.setorId) : undefined
  const quem = texto(`# Pedido de set\n<@${sol.discordId}> · \`@${sol.username.replace(/`/g, '')}\``)
  const dados = texto([
    `👤 **Codinome:** ${d.codinome}`, `🪪 **Passaporte:** ${d.passaporte}`, `🎖️ **Patente:** ${patente?.nome ?? '—'}`,
    ...(d.setorId ? [`🧩 **Setor:** ${setor?.nome ?? '—'}`] : []), `🏷️ **Apelido:** ${d.apelido}`,
  ].join('\n'))
  return {
    anexos: [],
    componentes: [{
      type: 17,
      accent_color: d.status === 'correcao' ? COR_CORRECAO : COR_PAINEL_SETAGEM,
      components: [
        // Cabeçalho com a foto da pessoa à direita
        sol.avatar ? { type: 9, components: [quem], accessory: { type: 11, media: { url: sol.avatar } } } : quem,
        linha(),
        dados,
        texto(`### ${d.status === 'correcao' ? '✏️ Aguardando correção' : '⏳ Aguardando aprovação'}`),
        ...(d.status === 'correcao' && d.motivoCorrecao
          ? [texto(`**Correção pedida por ${d.correcaoPor ?? 'comando'}:**\n> ${d.motivoCorrecao.replace(/\n/g, '\n> ')}`)] : []),
        { type: 1, components: [
          botao(P_APROVAR + sol.id, 'Aprovar', 3, '✅'), botao(P_REPROVAR + sol.id, 'Reprovar', 4, '⛔'), botao(P_CORRIGIR + sol.id, 'Refazer preenchimento', 2, '✏️'),
        ] },
        linha(),
        rodape(s, info),
      ],
    }],
  }
}

/** Painel no privado (V2): aviso + motivo + botão que leva ao canal da setagem. */
function painelPrivado(s: Setagem, cfg: DiscordConfig, titulo: string, corpo: string, comBotao: boolean, info: InfoPainel): { componentes: unknown[]; anexos: AnexoPainel[] } {
  return {
    anexos: [],
    componentes: [{
      type: 17,
      accent_color: COR_PAINEL_SETAGEM,
      components: [
        texto(`# ${titulo}`), linha(), texto(corpo),
        ...(comBotao && s.canalId ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Ir para a setagem', url: `https://discord.com/channels/${cfg.guildId}/${s.canalId}`, emoji: { name: '📝' } }] }] : []),
        linha(),
        rodape(s, info),
      ],
    }],
  }
}

async function infoBasica(cfg: DiscordConfig): Promise<InfoPainel> {
  const info = await infoServidor(cfg)
  // Fotinha do rodapé: imagem escolhida na setagem (upload / link copiado) ou a foto do bot
  const emoji = await emojiDoRodape(cfg, setagemAtual(readData()).imagem || info?.botAvatar)
  return { servidor: info?.nome ?? '', botAvatar: info?.botAvatar, emoji }
}

// ── Painel principal ─────────────────────────────────────────────────────────

export interface EstadoSetagem { erro?: 'sem_acesso' | 'discord' | 'sem_canal' | 'sem_patentes' | 'nao_configurado'; ultimaAtualizacao?: string }
const estado: EstadoSetagem = {}
export const estadoSetagem = (): EstadoSetagem => ({ ...estado })
let ultimoHash = ''
let rodando: Promise<void> | undefined
let deNovo = false

/** Publica/edita o painel da setagem (uma execução por vez; pedidos durante ela viram UMA nova rodada). */
export function publicarSetagem(forcar = false): Promise<void> {
  if (rodando) { deNovo = true; return rodando }
  // .finally roda depois da atribuição (mesmo se executar terminar na hora): a trava sempre é liberada
  rodando = executarPublicacao(forcar).finally(() => {
    rodando = undefined
    if (deNovo) { deNovo = false; void publicarSetagem(true) }
  })
  return rodando
}

async function executarPublicacao(forcar: boolean): Promise<void> {
  const cfg = discordConfig()
  const s = setagemAtual(readData())
  // Sem como publicar: diz o motivo (a tela mostra), em vez de não fazer nada em silêncio
  if (!cfg) { estado.erro = 'nao_configurado'; return }
  if (!s.canalId) { estado.erro = 'sem_canal'; return }
  if (!s.patentes.length) { estado.erro = 'sem_patentes'; return }
  const { componentes, anexos } = montarPainelSetagem(s, await infoBasica(cfg))
  const hash = crypto.createHash('sha256').update(JSON.stringify([s.canalId, componentes, s.imagem ?? '', s.imagens ?? []])).digest('hex')
  if (!forcar && hash === ultimoHash && s.mensagemId) return
  const id = await publicarV2(cfg, s.canalId, s.mensagemId, componentes, anexos)
  if (id === 'sem_acesso') { estado.erro = 'sem_acesso'; return }
  if (!id) { estado.erro = 'discord'; return }
  ultimoHash = hash
  estado.erro = undefined
  estado.ultimaAtualizacao = new Date().toISOString()
  if (id !== s.mensagemId) {
    const data = readData()
    const atual = setagemAtual(data)
    if (atual.canalId === s.canalId) { data.setagem = { ...atual, mensagemId: id }; writeData(data) }
  }
}

// ── Canal temporário do pedido ───────────────────────────────────────────────

/** Uma sincronização por pedido de cada vez (correção + reenvio juntos não criam dois canais). */
const sincronizandoPedido = new Map<number, Promise<void>>()
function sincronizarCanalDoPedido(cfg: DiscordConfig, solId: number): Promise<void> {
  const anterior = sincronizandoPedido.get(solId) ?? Promise.resolve()
  const vez = anterior.catch(() => undefined).then(() => sincronizarCanalAgora(cfg, solId))
  sincronizandoPedido.set(solId, vez)
  void vez.finally(() => { if (sincronizandoPedido.get(solId) === vez) sincronizandoPedido.delete(solId) }).catch(() => undefined)
  return vez
}

/** Cria (ou atualiza) o canal temporário e o painel do pedido. Grava canal/mensagem no pedido. */
async function sincronizarCanalAgora(cfg: DiscordConfig, solId: number): Promise<void> {
  const data = readData()
  const s = setagemAtual(data)
  const sol = data.solicitacoesAcesso.find(x => x.id === solId && x.setagem)
  if (!sol?.setagem || !s.categoriaId) return
  let canal = sol.setagem.canalTemp
  if (!canal) canal = await criarCanalTemporario(cfg, `set-${sol.setagem.codinome}`, s.categoriaId, s.aprovadores ?? [])
  if (!canal) return
  const { componentes, anexos } = painelPedido(s, sol, await infoBasica(cfg))
  let msg = await publicarV2(cfg, canal, sol.setagem.mensagemTemp, componentes, anexos)
  if (msg === 'sem_acesso' && sol.setagem.canalTemp) {
    // Canal apagado à mão: cria outro
    canal = await criarCanalTemporario(cfg, `set-${sol.setagem.codinome}`, s.categoriaId, s.aprovadores ?? [])
    msg = canal ? await publicarV2(cfg, canal, undefined, componentes, anexos) : undefined
  }
  const atual = readData()
  const alvo = atual.solicitacoesAcesso.find(x => x.id === solId && x.setagem)
  if (!canal) return
  if (!alvo?.setagem) {
    // O pedido foi aprovado/reprovado enquanto o canal era criado: o canal que ESTA rotina acabou de criar
    // (nunca um vindo de fora) não pode ficar sobrando no servidor
    const canalCriado = canal !== sol.setagem.canalTemp ? canal : undefined
    if (canalCriado) await apagarCanalTemporario(cfg, canalCriado)
    return
  }
  alvo.setagem.canalTemp = canal
  if (msg && msg !== 'sem_acesso') alvo.setagem.mensagemTemp = msg
  writeData(atual)
}

// ── Botões e modais ──────────────────────────────────────────────────────────

const ultimoEnvio = new Map<string, number>()
const ESPERA_ENVIO_MS = 30_000
const efemera = (conteudo: string, componentes?: unknown[]) => ({ type: 4, data: { content: conteudo.slice(0, 1900), flags: 64, allowed_mentions: { parse: [] }, ...(componentes ? { components: componentes } : {}) } })
const urlDoSite = () => process.env.PUBLIC_URL?.trim().replace(/\/+$/, '') || ''

/** Quem pode aprovar/reprovar/pedir correção: cargos aprovadores, administradores do servidor ou donos. */
export function ehAprovador(cfg: DiscordConfig, s: Setagem, i: Pick<Interacao, 'usuario' | 'cargos' | 'administrador'>): boolean {
  return cfg.donos.includes(i.usuario.id) || i.administrador || i.cargos.some(r => (s.aprovadores ?? []).includes(r))
}

/** Correções aguardando confirmação (motivo digitado → "Confirmar envio"). Expiram em 10 min. */
const confirmacoes = new Map<string, { solId: number; motivo: string; por: string; porId: string; exp: number }>()

/** Trata cliques e modais da setagem. */
export async function tratarInteracao(i: Interacao): Promise<void> {
  const cfg = discordConfig()
  if (!cfg || !i.customId.startsWith('du:set')) return
  if (i.customId === ID_BOTAO || i.customId === ID_MODAL) { await tratarPedido(cfg, i); return }
  await tratarRevisao(cfg, i)
}

/** Por que esta pessoa não pode pedir/editar set (ou undefined). */
function bloqueioDoPedido(data: DuData, cfg: DiscordConfig, discordId: string): string | undefined {
  const conta = contaDoDiscord(data, cfg, discordId)
  if (conta?.exonerado) return 'Você foi exonerado da unidade. Para voltar, fale com o comando.'
  if (conta) return `Você já possui cadastro. Para trocar patente, setor, codinome ou passaporte, peça pela dashboard (Meu perfil → Solicitar alteração)${urlDoSite() ? `: ${urlDoSite()}/perfil` : '.'} — vale depois da aprovação.`
  return undefined
}

async function tratarPedido(cfg: DiscordConfig, i: Interacao): Promise<void> {
  const data = readData()
  const s = setagemAtual(data)

  if (i.tipo === 3 && i.customId === ID_BOTAO) {
    if (!s.patentes.length) { await responderInteracao(i, efemera('A setagem ainda não está configurada. Avise o comando.')); return }
    const bloqueio = bloqueioDoPedido(data, cfg, i.usuario.id)
    if (bloqueio) { await responderInteracao(i, efemera(bloqueio)); return }
    // Já tem pedido aguardando: abre o modal preenchido (modo editar pedido)
    const atual = data.solicitacoesAcesso.find(x => x.discordId === i.usuario.id && x.setagem)?.setagem
    await responderInteracao(i, {
      type: 9,
      data: {
        custom_id: ID_MODAL, title: (atual ? 'Editar pedido de set' : s.titulo).slice(0, 45),
        components: [
          { type: 18, label: 'Codinome', description: 'De 2 a 20 caracteres', component: { type: 4, custom_id: 'codinome', style: 1, min_length: 2, max_length: 20, required: true, placeholder: 'Ex.: Raven', ...(atual ? { value: atual.codinome } : {}) } },
          { type: 18, label: 'Passaporte (ID in-game)', component: { type: 4, custom_id: 'passaporte', style: 1, min_length: 1, max_length: 10, required: true, placeholder: 'Ex.: 12345', ...(atual ? { value: atual.passaporte } : {}) } },
          { type: 18, label: 'Patente', component: { type: 3, custom_id: 'patente', min_values: 1, max_values: 1, required: true,
            options: s.patentes.slice(0, 25).map(p => ({ label: p.nome.slice(0, 100), value: String(p.id), description: `Prefixo: ${p.prefixo}`.slice(0, 100), ...(atual?.patenteId === p.id ? { default: true } : {}) })) } },
          ...(s.setores?.length ? [{ type: 18, label: 'Setor (subunidade) — opcional', description: 'Se quiser, escolha onde vai trabalhar', component: { type: 3, custom_id: 'setor', min_values: 0, max_values: 1, required: false, placeholder: 'Sem setor',
            options: s.setores.slice(0, 25).map(x => ({ label: x.nome.slice(0, 100), value: String(x.id), ...(atual?.setorId === x.id ? { default: true } : {}) })) } }] : []),
        ],
      },
    })
    return
  }

  if (i.tipo !== 5 || i.customId !== ID_MODAL) return
  // Responde "pensando…" na hora (o Discord dá 3 s) e conclui depois
  if (!await responderInteracao(i, { type: 5, data: { flags: 64 } })) return
  const agora = Date.now()
  if (agora - (ultimoEnvio.get(i.usuario.id) ?? 0) < ESPERA_ENVIO_MS) { await editarResposta(cfg, i.token, 'Aguarde alguns segundos antes de enviar de novo.'); return }

  const pedido = validarPedido(s, i.campos)
  if ('erro' in pedido) { await editarResposta(cfg, i.token, pedido.erro); return }

  // Daqui até writeData: sem await
  const atual = readData()
  const bloqueio = bloqueioDoPedido(atual, cfg, i.usuario.id)
  if (bloqueio) { await editarResposta(cfg, i.token, bloqueio); return }
  const passaporteEmUso = atual.membros.some(m => m.passaporte === pedido.passaporte)
    || atual.solicitacoesAcesso.some(x => x.discordId !== i.usuario.id && x.setagem?.passaporte === pedido.passaporte)
  if (passaporteEmUso) { await editarResposta(cfg, i.token, 'Esse passaporte já está cadastrado. Confira o número ou fale com o comando.'); return }
  const existente = atual.solicitacoesAcesso.find(x => x.discordId === i.usuario.id)
  if (!existente && atual.solicitacoesAcesso.length >= 200) { await editarResposta(cfg, i.token, 'Muitos pedidos aguardando aprovação. Tente mais tarde.'); return }
  const editando = Boolean(existente?.setagem)
  const setagem = {
    codinome: pedido.codinome, passaporte: pedido.passaporte, patenteId: pedido.patente.id, ...(pedido.setor ? { setorId: pedido.setor.id } : {}),
    apelido: pedido.apelido, em: new Date().toISOString(),
    status: 'pendente' as const,
    // O canal temporário continua o mesmo ao editar
    ...(existente?.setagem?.canalTemp ? { canalTemp: existente.setagem.canalTemp } : {}),
    ...(existente?.setagem?.mensagemTemp ? { mensagemTemp: existente.setagem.mensagemTemp } : {}),
  }
  let solId: number
  if (existente) {
    Object.assign(existente, { username: i.usuario.username, nome: pedido.apelido, setagem, ...(i.usuario.avatar ? { avatar: i.usuario.avatar } : {}) })
    solId = existente.id
  } else {
    solId = atual.nextSolAcessoId++
    atual.solicitacoesAcesso.push({ id: solId, discordId: i.usuario.id, username: i.usuario.username, nome: pedido.apelido,
      ...(i.usuario.avatar ? { avatar: i.usuario.avatar } : {}), criadoEm: new Date().toISOString(), setagem })
  }
  notificarQuemAprova(atual, 'setagem', [], 'pendente_aprovacao', editando ? 'Pedido de set atualizado' : 'Pedido de set',
    `${pedido.apelido} (@${i.usuario.username}) ${editando ? 'atualizou o pedido' : 'pediu a patente'} ${pedido.patente.nome}${pedido.setor ? ` · setor ${pedido.setor.nome}` : ''}.`, '/setagem')
  // A espera de 30 s só conta depois de um envio ACEITO (errar o passaporte e corrigir não trava a pessoa)
  ultimoEnvio.set(i.usuario.id, agora)
  if (ultimoEnvio.size > 10_000) ultimoEnvio.delete(ultimoEnvio.keys().next().value!)
  writeData(atual)
  audit('SIGNUP_REQUESTED', undefined, `Setagem${editando ? ' (edição)' : ''}: @${i.usuario.username} → ${pedido.patente.nome}`)

  const r = await alterarApelido(cfg, i.usuario.id, pedido.apelido)
  await sincronizarCanalDoPedido(cfg, solId)
  const apelidoTxt = r === 'ok' ? `Seu apelido agora é **${pedido.apelido}**.`
    : 'Não consegui trocar seu apelido (o bot precisa de permissão ou você é o dono do servidor) — o comando ajusta.'
  await editarResposta(cfg, i.token, [
    editando ? '✅ Pedido de set atualizado!' : '✅ Pedido de set enviado!', apelidoTxt,
    'Aguarde a aprovação do comando para receber os cargos (patente e setor) e o acesso ao painel.',
    ...(urlDoSite() ? [`Depois de aprovado, entre com o Discord em ${urlDoSite()}`] : []),
  ].join('\n'))
}

/** Botões e modais do painel do pedido (canal temporário). */
async function tratarRevisao(cfg: DiscordConfig, i: Interacao): Promise<void> {
  const s = setagemAtual(readData())
  const idDe = (prefixo: string) => { const n = Number(i.customId.slice(prefixo.length)); return Number.isSafeInteger(n) && n > 0 ? n : undefined }
  const nome = i.usuario.nome || i.usuario.username

  // Confirmar/cancelar a correção (botões da mensagem só para quem pediu)
  if (i.tipo === 3 && (i.customId.startsWith(P_CONFIRMAR) || i.customId.startsWith(P_CANCELAR))) {
    const chave = i.customId.slice(i.customId.lastIndexOf(':') + 1)
    const c = confirmacoes.get(chave)
    confirmacoes.delete(chave)
    if (!c || c.exp < Date.now() || c.porId !== i.usuario.id) { await responderInteracao(i, { type: 7, data: { content: 'Esta confirmação expirou. Clique em Refazer preenchimento de novo.', components: [] } }); return }
    if (i.customId.startsWith(P_CANCELAR)) { await responderInteracao(i, { type: 7, data: { content: 'Envio cancelado. Nada foi mandado.', components: [] } }); return }
    await responderInteracao(i, { type: 6 })
    const r = await solicitarCorrecao(c.solId, c.por, c.motivo)
    const msg = 'erro' in r ? r.erro
      : r.privado === 'ok' ? '✉️ Mensagem enviada no privado da pessoa. O pedido fica aguardando correção.'
        : '⚠️ O pedido ficou aguardando correção, mas a pessoa não recebe mensagens no privado. Avise-a por outro canal.'
    await editarResposta(cfg, i.token, msg)
    return
  }

  const solId = idDe(P_APROVAR) ?? idDe(P_REPROVAR) ?? idDe(P_CORRIGIR) ?? idDe(P_MOTIVO_REPROVAR) ?? idDe(P_MOTIVO_CORRIGIR)
  if (!solId) return
  const sol = readData().solicitacoesAcesso.find(x => x.id === solId && x.setagem)
  if (!sol) { await responderInteracao(i, efemera('Este pedido já foi resolvido.')); return }
  if (!ehAprovador(cfg, s, i)) { await responderInteracao(i, efemera('Você não tem permissão para avaliar pedidos de set.')); return }
  if (sol.discordId === i.usuario.id) { await responderInteracao(i, efemera('Você não pode avaliar o seu próprio pedido.')); return }

  if (i.tipo === 3 && i.customId.startsWith(P_APROVAR)) {
    await responderInteracao(i, { type: 5, data: { flags: 64 } })
    // Cargo do site com admin/dev/"editar": só se quem aprovou no Discord tem conta no site que PODE dar esse cargo
    // (cargo simples continua liberado para qualquer aprovador da setagem)
    const podeAtribuir = (cargo: CargoPermissao) => {
      if (!cargo.admin && !cargo.dev && !cargoConcedeEditar(cargo)) return true
      const d = readData()
      const aprovador = contaDoDiscord(d, cfg, i.usuario.id)
      return Boolean(aprovador && !aprovador.exonerado && aprovador.ativo !== false && podeAtribuirCargo(aprovador, cargo, d))
    }
    const r = await aprovarPedido(solId, { por: nome, podeAtribuir })
    await editarResposta(cfg, i.token, 'erro' in r ? r.erro : `✅ Set aprovado${r.cargoDiscord === 'ok' ? '' : ' (o bot não conseguiu dar algum cargo — confira as permissões)'}.${r.cargosManuais.length ? `\n⚠️ Dê à mão (tem moderação/administração): ${r.cargosManuais.map(n => `@${n}`).join(', ')}` : ''}\nEste canal será apagado.`)
    return
  }
  if (i.tipo === 3 && (i.customId.startsWith(P_REPROVAR) || i.customId.startsWith(P_CORRIGIR))) {
    const corrigir = i.customId.startsWith(P_CORRIGIR)
    await responderInteracao(i, {
      type: 9,
      data: {
        custom_id: (corrigir ? P_MOTIVO_CORRIGIR : P_MOTIVO_REPROVAR) + solId,
        title: corrigir ? 'Refazer preenchimento' : 'Reprovar pedido',
        components: [{ type: 18, label: corrigir ? 'Motivo / observação para a pessoa' : 'Motivo da reprovação (opcional)',
          component: { type: 4, custom_id: 'motivo', style: 2, min_length: corrigir ? 3 : 0, max_length: 500, required: corrigir,
            placeholder: corrigir ? 'Ex.: o passaporte não confere com o do jogo.' : 'Ex.: não faz parte da unidade.' } }],
      },
    })
    return
  }
  if (i.tipo === 5 && i.customId.startsWith(P_MOTIVO_REPROVAR)) {
    await responderInteracao(i, { type: 5, data: { flags: 64 } })
    const r = await reprovarPedido(solId, nome, limparTexto(i.campos.motivo ?? '', 500))
    await editarResposta(cfg, i.token, 'erro' in r ? r.erro : '⛔ Pedido reprovado. Este canal será apagado.')
    return
  }
  if (i.tipo === 5 && i.customId.startsWith(P_MOTIVO_CORRIGIR)) {
    const motivo = limparTexto(i.campos.motivo ?? '', 500)
    if (motivo.length < 3) { await responderInteracao(i, efemera('Escreva o motivo para a pessoa.')); return }
    // Confirmação antes de mandar no privado
    const chave = crypto.randomBytes(9).toString('base64url')
    confirmacoes.set(chave, { solId, motivo, por: nome, porId: i.usuario.id, exp: Date.now() + 10 * 60_000 })
    for (const [k, v] of confirmacoes) if (v.exp < Date.now()) confirmacoes.delete(k)
    await responderInteracao(i, efemera(`Enviar esta observação no privado de **${sol.setagem!.apelido}**? O pedido NÃO é aprovado e fica aguardando correção.\n> ${motivo.replace(/\n/g, '\n> ')}`,
      [{ type: 1, components: [botao(P_CONFIRMAR + chave, 'Confirmar envio', 3, '✉️'), botao(P_CANCELAR + chave, 'Cancelar', 2)] }]))
  }
}

// ── Decisões (Discord e site usam as mesmas) ────────────────────────────────

type Resultado<T> = T | { erro: string; status: number }

/** Cria a conta do site a partir do pedido (setagem ou pedido simples). Muta `data`. */
export function criarContaDeSolicitacao(data: DuData, sol: SolicitacaoAcesso, cargo?: CargoPermissao): Conta {
  const s = setagemAtual(data)
  const patente = sol.setagem ? s.patentes.find(p => p.id === sol.setagem!.patenteId) : undefined
  const setor = sol.setagem?.setorId ? s.setores?.find(x => x.id === sol.setagem!.setorId) : undefined
  const nova: Conta = {
    id: data.nextContaId++, username: usuarioLivre(data, sol.username), nivel: 'membro', ativo: true,
    discordId: sol.discordId, discordUsername: sol.username, onboarded: false, nomeServidor: sol.setagem?.apelido ?? sol.nome,
    ...(sol.avatar ? { avatarServidor: sol.avatar } : {}),
    ...(cargo ? { cargoPermId: cargo.id } : {}),
    ...(sol.setagem ? { cadastroSetagem: { codinome: sol.setagem.codinome, passaporte: sol.setagem.passaporte, patente: patente?.nome ?? '', ...(setor ? { setor: setor.nome } : {}) } } : {}),
  }
  data.contas.push(nova)
  data.solicitacoesAcesso = data.solicitacoesAcesso.filter(x => x.id !== sol.id)

  // Aprovado = MEMBRO a partir de agora: a ficha entra no efetivo na hora (aparece em Membros).
  // No primeiro login a pessoa completa o cadastro (nome no RP, badge, nível) — a regra que já existia.
  const hoje = hojeSP()   // fuso de São Paulo (UTC virava o dia seguinte depois das 21h)
  const membro: Membro = {
    id: data.nextMemId++,
    policial: sol.setagem?.codinome ?? sol.nome, codinome: sol.setagem?.codinome ?? '', badge: '',
    passaporte: sol.setagem?.passaporte ?? '', patenteDPD: '', patenteInterna: patente?.nome ?? cargo?.nome ?? '',
    ...(setor ? { setor: setor.nome } : {}),
    status: 'Ativo', entrada: hoje, promocao: hoje, adv1: false, adv2: false, adv3: false,
  }
  data.membros.push(membro)
  data.membrosOrder.push(membro.id)
  nova.membroId = membro.id
  notificarArea(data, 'membros', [nova.id], 'membro', 'Novo membro na unidade',
    `${sol.setagem?.apelido ?? sol.nome}${membro.passaporte ? ` | ID ${membro.passaporte}` : ''} entrou para o efetivo.`, '/membros')
  return nova
}

/**
 * Vínculo conta ↔ efetivo: toda conta APROVADA (com cargo do site), ativa e não exonerada precisa ter
 * a sua ficha em Membros. Conta aprovada sem ficha (ex.: aprovada antes da ficha automática) ganha uma
 * agora com os dados que o sistema já tem (pedido de set + Discord); ficha arquivada volta.
 * Nunca mexe em exonerados nem apaga nada. Muta `data`; devolve quantas fichas criou/restaurou.
 */
export function vincularContasAoEfetivo(data: DuData): number {
  let vinculadas = 0
  const hoje = hojeSP()   // fuso de São Paulo (UTC virava o dia seguinte depois das 21h)
  for (const conta of data.contas) {
    if (conta.exonerado || !conta.ativo || !conta.cargoPermId) continue
    if (conta.membroId && data.membros.some(m => m.id === conta.membroId)) continue
    let membro: Membro
    if (conta.membroArquivado && !data.membros.some(m => m.id === conta.membroArquivado!.id)) {
      membro = { ...conta.membroArquivado, status: 'Ativo' }
      delete conta.membroArquivado
    } else {
      const set = conta.cadastroSetagem
      const cargo = data.cargosPermissao.find(c => c.id === conta.cargoPermId)
      membro = {
        id: data.nextMemId++,
        policial: set?.codinome || conta.nomeServidor || conta.discordUsername || conta.username, codinome: set?.codinome ?? '', badge: '',
        passaporte: set?.passaporte ?? '', patenteDPD: '', patenteInterna: set?.patente || cargo?.nome || '',
        ...(set?.setor ? { setor: set.setor } : {}),
        status: 'Ativo', entrada: hoje, promocao: hoje, adv1: false, adv2: false, adv3: false,
      }
    }
    data.membros.push(membro)
    if (!data.membrosOrder.includes(membro.id)) data.membrosOrder.push(membro.id)
    conta.membroId = membro.id
    vinculadas++
  }
  return vinculadas
}

/**
 * Aprova um pedido de set: cria a conta (cargo do site = escolhido ou o da patente ou o padrão),
 * dá o cargo da patente no Discord, avisa no privado e apaga o canal temporário.
 * `podeAtribuir` limita o cargo do site ao poder de quem aprova (no site).
 */
export async function aprovarPedido(solId: number, op: { por: string; cargoPermId?: number | null; podeAtribuir?: (c: CargoPermissao) => boolean }):
  Promise<Resultado<{ contaId: number; cargoDiscord: ResultadoMembro | 'sem_setagem'; cargosManuais: string[] }>> {
  const data = readData()
  const sol = data.solicitacoesAcesso.find(x => x.id === solId && x.setagem)
  if (!sol?.discordId) return { erro: 'Este pedido já foi resolvido.', status: 404 }
  if (data.contas.some(c => c.discordId === sol.discordId)) return { erro: 'Este Discord já tem uma conta.', status: 409 }
  const patente = setagemAtual(data).patentes.find(p => p.id === sol.setagem!.patenteId)
  if (!patente) return { erro: 'A patente deste pedido foi removida. Reprove ou peça correção.', status: 409 }
  const escolhido = op.cargoPermId ?? patente.cargoPermId
  const cargo = escolhido ? data.cargosPermissao.find(c => c.id === escolhido) : data.cargosPermissao.find(c => c.padrao && !c.admin)
  if (escolhido && !cargo) return { erro: 'Cargo de permissão não encontrado', status: 400 }
  if (cargo && op.podeAtribuir && !op.podeAtribuir(cargo)) {
    return { erro: `Esta patente dá o cargo do site "${cargo.nome}" (com poderes de edição/admin), que você não pode atribuir. Peça a um administrador para aprovar.`, status: 403 }
  }
  const setor = sol.setagem!.setorId ? setagemAtual(data).setores?.find(x => x.id === sol.setagem!.setorId) : undefined
  const nova = criarContaDeSolicitacao(data, sol, cargo)
  notificar(data, nova.id, 'aprovada', 'Set aprovado!', `Seu set foi aprovado (${patente.nome}${setor ? ` · ${setor.nome}` : ''}). Complete o cadastro para liberar o painel.`, '/dashboard')
  writeData(data)
  audit('SIGNUP_APPROVED', undefined, `Setagem: conta #${nova.id} | patente ${patente.nome} | cargo #${nova.cargoPermId ?? '—'} | por ${op.por}`)
  const { resultado: cargoDiscord, manuais: cargosManuais } = await concederPatente(sol, patente, setor)
  await finalizarNoDiscord(sol, 'Set aprovado ✅', `Seu set foi aprovado como **${patente.nome}**${setor ? ` no setor **${setor.nome}**` : ''}.${urlDoSite() ? `\nEntre com o Discord em ${urlDoSite()} para completar o cadastro.` : ''}`, false)
  if (cargosManuais.length) avisarCargosManuais(nova.id, cargosManuais)
  return { contaId: nova.id, cargoDiscord, cargosManuais }
}

/** Reprova: remove o pedido, avisa no privado (com o motivo, se houver) e apaga o canal temporário. */
export async function reprovarPedido(solId: number, por: string, motivo = ''): Promise<Resultado<{ ok: true }>> {
  const data = readData()
  const sol = data.solicitacoesAcesso.find(x => x.id === solId && x.setagem)
  if (!sol) return { erro: 'Este pedido já foi resolvido.', status: 404 }
  data.solicitacoesAcesso = data.solicitacoesAcesso.filter(x => x.id !== solId)
  writeData(data)
  audit('SIGNUP_REJECTED', undefined, `Setagem: pedido #${solId} por ${por}`)
  await finalizarNoDiscord(sol, 'Pedido de set reprovado', motivo ? `**Motivo:**\n> ${motivo.replace(/\n/g, '\n> ')}` : 'Seu pedido de set foi reprovado pelo comando.', false)
  return { ok: true }
}

/** Pede para refazer o preenchimento: pedido fica "aguardando correção" e a pessoa recebe o motivo no privado. */
export async function solicitarCorrecao(solId: number, por: string, motivo: string): Promise<Resultado<{ privado: 'ok' | 'fechado' | 'erro' }>> {
  const cfg = discordConfig()
  const data = readData()
  const sol = data.solicitacoesAcesso.find(x => x.id === solId && x.setagem)
  if (!sol?.setagem || !sol.discordId) return { erro: 'Este pedido já foi resolvido.', status: 404 }
  Object.assign(sol.setagem, { status: 'correcao', motivoCorrecao: motivo, correcaoPor: por })
  writeData(data)
  audit('CONFIG_UPDATED', undefined, `Setagem: correção pedida no pedido #${solId} por ${por}`)
  if (!cfg) return { privado: 'erro' }
  const s = setagemAtual(data)
  const { componentes, anexos } = painelPrivado(s, cfg, 'Refaça o preenchimento do seu set', [
    'O comando pediu para você **corrigir os dados** do seu pedido de set. Ele ainda não foi aprovado.',
    `**Observação / motivo:**\n> ${motivo.replace(/\n/g, '\n> ')}`,
    'Clique no botão abaixo, depois em **Solicitar set**, e envie os dados corrigidos.',
  ].join('\n\n'), true, await infoBasica(cfg))
  const privado = await enviarPrivado(cfg, sol.discordId, componentes, anexos)
  await sincronizarCanalDoPedido(cfg, solId)   // painel do pedido mostra "aguardando correção"
  return { privado }
}

/** Depois da decisão: mensagem no privado e o canal temporário apagado (após 5 s para a resposta aparecer). */
async function finalizarNoDiscord(sol: SolicitacaoAcesso, titulo: string, corpo: string, botaoSetagem: boolean): Promise<void> {
  const cfg = discordConfig()
  if (!cfg || !sol.discordId) return
  const { componentes, anexos } = painelPrivado(setagemAtual(readData()), cfg, titulo, corpo, botaoSetagem, await infoBasica(cfg))
  await enviarPrivado(cfg, sol.discordId, componentes, anexos)
  const canal = sol.setagem?.canalTemp
  if (canal) setTimeout(() => { void apagarCanalTemporario(cfg, canal) }, 5000).unref()
}

/**
 * Depois de aprovar: dá os cargos da patente e do setor no Discord (até 2 cada) e reaplica o apelido.
 * Cargo com moderação/administração NUNCA é dado pelo bot: volta em `manuais` para quem aprovou dar à mão.
 */
export async function concederPatente(sol: SolicitacaoAcesso, patente: PatenteSetagem | undefined, setor?: SetorSetagem):
  Promise<{ resultado: ResultadoMembro | 'sem_setagem'; manuais: string[] }> {
  const cfg = discordConfig()
  if (!cfg || !sol.discordId || !sol.setagem || !patente) return { resultado: 'sem_setagem', manuais: [] }
  let resultado: ResultadoMembro = 'ok'
  const perigosos = await cargosPerigosos(cfg)
  const manuais: string[] = []
  for (const roleId of [...patente.roleIds.slice(0, 2), ...(setor?.roleIds.slice(0, 2) ?? [])]) {
    const nome = perigosos.get(roleId)
    if (nome !== undefined) { manuais.push(nome); continue }
    const r = await darCargo(cfg, sol.discordId, roleId)
    if (r !== 'ok') resultado = r
  }
  await alterarApelido(cfg, sol.discordId, sol.setagem.apelido)
  return { resultado, manuais }
}


// ── Cargos no Discord depois da aprovação (perfil, promoção, setor e advertências) ────────────

/** Cargos com moderação/administração (ou de integração) nunca são dados nem tirados pelo painel: id → nome. */
async function cargosPerigosos(cfg: DiscordConfig): Promise<Map<string, string>> {
  const info = await infoServidor(cfg)
  return new Map((info?.todosCargos ?? []).filter(r => r.perigoso || r.integracao).map(r => [r.id, r.nome]))
}

export interface AntesDoPerfil { patente?: string; setor?: string }

/**
 * Aplica no Discord o perfil APROVADO do membro: tira os cargos da patente/setor antigos, dá os da
 * patente/setor atuais e troca o apelido ("PREFIXO Codinome | ID"). Só cargos configurados na setagem.
 * Falha do Discord não muda nada no site (o perfil já foi aprovado); o resultado vai para a auditoria.
 */
export async function aplicarPerfilNoDiscord(membroId: number, antes: AntesDoPerfil): Promise<ResultadoMembro | 'sem_discord'> {
  const cfg = discordConfig()
  const data = readData()
  const membro = data.membros.find(m => m.id === membroId)
  const conta = data.contas.find(c => c.membroId === membroId && !c.exonerado)
  if (!cfg || !membro || !conta?.discordId) return 'sem_discord'
  const s = setagemAtual(data)
  const porNome = <T extends { nome: string }>(lista: T[], nome?: string) => nome ? lista.find(x => x.nome.toLowerCase() === nome.trim().toLowerCase()) : undefined
  const patNova = porNome(s.patentes, membro.patenteInterna), patVelha = porNome(s.patentes, antes.patente)
  const setNovo = porNome(s.setores ?? [], membro.setor), setVelho = porNome(s.setores ?? [], antes.setor)
  const manter = new Set([...(patNova?.roleIds ?? []), ...(setNovo?.roleIds ?? [])])
  const tirar = [...(patVelha?.roleIds ?? []), ...(setVelho?.roleIds ?? [])].filter(r => !manter.has(r))
  const perigosos = await cargosPerigosos(cfg)
  let resultado: ResultadoMembro = 'ok'
  const anotar = (r: ResultadoMembro) => { if (r !== 'ok') resultado = r }
  const manuais: string[] = []
  for (const r of new Set(tirar)) if (!perigosos.has(r)) anotar(await tirarCargo(cfg, conta.discordId, r, 'Painel DU: perfil aprovado'))
  for (const r of manter) { const nome = perigosos.get(r); if (nome !== undefined) { manuais.push(nome); continue } anotar(await darCargo(cfg, conta.discordId, r)) }
  if (manuais.length) avisarCargosManuais(conta.id, manuais)
  const codinome = membro.codinome || membro.policial
  if (patNova && codinome && membro.passaporte) {
    const apelido = montarApelido(s.modeloApelido, { prefixo: patNova.prefixo, codinome, id: membro.passaporte })
    if (apelido.length <= MAX_APELIDO) anotar(await alterarApelido(cfg, conta.discordId, apelido))
  }
  audit('CONFIG_UPDATED', undefined, `Discord: perfil do membro #${membroId} aplicado (${resultado})`)
  return resultado
}

/** Avisa quem cuida da setagem: cargo alto (com moderação) para dar à mão no Discord. */
function avisarCargosManuais(contaId: number, cargos: string[]): void {
  const data = readData()
  const conta = data.contas.find(c => c.id === contaId)
  const nome = conta ? nomeDaConta(data, conta.id) : `conta #${contaId}`
  notificarQuemAprova(data, 'setagem', [], 'pendente_aprovacao', 'Cargo para dar à mão no Discord',
    `${nome}: dê ${cargos.map(c => `@${c}`).join(', ')} no Discord (cargo com moderação/administração — o bot não entrega).`, '/setagem')
  writeData(data)
  audit('CONFIG_UPDATED', undefined, `Discord: cargos para dar à mão a #${contaId}: ${cargos.join(', ')}`)
}

const NOMES_ADV = ['⚠️ Advertência 1', '⚠️ Advertência 2', '⚠️ Advertência 3']
const CORES_ADV = [0xf1c40f, 0xe67e22, 0xe74c3c]
let filaAdv: Promise<unknown> = Promise.resolve()

/**
 * Garante os 3 cargos de advertência: usa os configurados; se faltar algum (ou foi apagado no
 * Discord), reaproveita um cargo com o mesmo nome ou CRIA um sem permissão nenhuma. Grava os IDs.
 */
export function garantirCargosAdvertencia(): Promise<string[] | undefined> {
  const tarefa = filaAdv.then(async () => {
    const cfg = discordConfig()
    if (!cfg) return undefined
    const info = await infoServidor(cfg)
    if (!info) return undefined
    const atuais = setagemAtual(readData()).advertencias ?? []
    const ids: string[] = []
    let mudou = false
    for (let n = 0; n < 3; n++) {
      const configurado = atuais[n] && info.todosCargos.find(r => r.id === atuais[n] && !r.perigoso && !r.integracao)
      if (configurado) { ids.push(configurado.id); continue }
      const mesmoNome = info.todosCargos.find(r => r.nome === NOMES_ADV[n] && !r.perigoso && !r.integracao)
      const id = mesmoNome?.id ?? await criarCargo(cfg, NOMES_ADV[n], CORES_ADV[n])
      if (!id) return undefined
      ids.push(id)
      mudou = true
    }
    if (mudou) {
      const data = readData()
      // Sobe a versão: um formulário da setagem aberto antes não pode sobrescrever os cargos recém-criados
      const sAtual = setagemAtual(data)
      data.setagem = { ...sAtual, advertencias: ids, versao: sAtual.versao + 1 }
      writeData(data)
      audit('CONFIG_UPDATED', undefined, 'Discord: cargos de advertência conferidos/criados')
    }
    return ids
  })
  filaAdv = tarefa.catch(() => undefined)
  return tarefa
}

/** Deixa os cargos de advertência do membro iguais à dashboard (ADV marcada = cargo; desmarcada = sem cargo). */
export async function sincronizarAdvertencias(membroId: number): Promise<ResultadoMembro | 'sem_discord'> {
  const cfg = discordConfig()
  const data = readData()
  const conta = data.contas.find(c => c.membroId === membroId && !c.exonerado)
  if (!cfg || !conta?.discordId || !data.membros.some(m => m.id === membroId)) return 'sem_discord'
  const ids = await garantirCargosAdvertencia()
  if (!ids) return 'erro'
  const membro = readData().membros.find(m => m.id === membroId)
  if (!membro) return 'sem_discord'
  let resultado: ResultadoMembro = 'ok'
  const ativos = [membro.adv1, membro.adv2, membro.adv3]
  for (let n = 0; n < 3; n++) {
    const r = ativos[n] ? await darCargo(cfg, conta.discordId, ids[n]) : await tirarCargo(cfg, conta.discordId, ids[n], 'Painel DU: advertência retirada')
    if (r !== 'ok') resultado = r
  }
  return resultado
}

/** Patente/setor pedidos ou editados precisam existir na setagem (vazio = sem setor). */
export function valorDePerfilInvalido(data: DuData, campo: string, valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  const s = setagemAtual(data)
  const v = valor.trim().toLowerCase()
  if (campo === 'setor' && v && !(s.setores ?? []).some(x => x.nome.toLowerCase() === v)) return 'Setor não cadastrado. Escolha um da lista.'
  if (campo === 'patenteInterna' && v && s.patentes.length && !s.patentes.some(p => p.nome.toLowerCase() === v)) return 'Patente não cadastrada. Escolha uma da lista.'
  return undefined
}
