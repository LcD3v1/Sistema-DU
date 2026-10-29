/**
 * Logs do painel: tudo o que acontece no SITE (eventos da auditoria) e no SERVIDOR DO DISCORD
 * (registro de auditoria do servidor + quem entrou/saiu), separados por categoria.
 *
 * Segurança:
 *  - só leitura no Discord (registro de auditoria e lista de membros), a cada 1 minuto;
 *  - arquivo próprio (logs.json na pasta de dados), criptografado com a chave dos dados quando houver;
 *  - teto de 5.000 entradas (as mais antigas saem); detalhes já passam por redact();
 *  - IDs do Discord ficam só no servidor: a API devolve nomes e uma chave opaca para o avatar.
 */
import path from 'path'
import crypto from 'crypto'
import { Request } from 'express'
import { PASTA_DADOS, gravarAtomico, lerJson } from './armazenamento'
import { criptografiaDisponivel, criptografar, descriptografar, estaCriptografado } from './security/crypto'
import { AuditEvent, ouvirAudit } from './security/audit'
import { peekData } from './data'
import { nomeDaConta } from './registros'
import { discordConfig, infoServidor, lerRegistroAuditoria, membrosAtuais, EntradaAuditoria, MudancaAuditoria } from './discord'

export type OrigemLog = 'site' | 'discord'
export interface EntradaLog {
  id: number
  em: string
  origem: OrigemLog
  categoria: string
  acao: string
  ator: { nome: string; contaId?: number; discordId?: string; avatar?: string }
  alvo?: string
  detalhes: string[]
}
interface ArquivoLogs { proximoId: number; ultimoDiscord?: string; entradas: EntradaLog[] }

const ARQUIVO = path.join(PASTA_DADOS, 'logs.json')
const AAD = 'du-logs'
const MAX_ENTRADAS = 5000
let estado: ArquivoLogs = { proximoId: 1, entradas: [] }
let carregado = false
let gravacao: NodeJS.Timeout | undefined
export let erroDiscordLogs: 'sem_acesso' | 'discord' | null = null

function carregar(): void {
  if (carregado) return
  carregado = true
  try {
    const bruto = lerJson<ArquivoLogs | { cifrado: string }>(ARQUIVO)
    if (!bruto) return
    const obj = 'cifrado' in bruto && estaCriptografado(bruto.cifrado) ? JSON.parse(descriptografar(bruto.cifrado, AAD)) as ArquivoLogs : bruto as ArquivoLogs
    if (Array.isArray(obj.entradas)) estado = { proximoId: obj.proximoId || 1, ultimoDiscord: obj.ultimoDiscord, entradas: obj.entradas.slice(-MAX_ENTRADAS) }
  } catch {
    console.error('[DU][LOGS] não foi possível ler os logs anteriores; começando um arquivo novo.')
  }
}

function salvarDepois(): void {
  if (gravacao || process.env.NODE_ENV === 'test') return
  gravacao = setTimeout(() => {
    gravacao = undefined
    try {
      const texto = JSON.stringify(estado)
      gravarAtomico(ARQUIVO, criptografiaDisponivel() ? JSON.stringify({ cifrado: criptografar(texto, AAD) }) : texto)
    } catch { console.error('[DU][LOGS] falha ao gravar os logs.') }
  }, 2000)
  gravacao.unref()
}

export function registrarLog(e: Omit<EntradaLog, 'id' | 'em'> & { em?: string }): void {
  carregar()
  estado.entradas.push({
    id: estado.proximoId++, em: e.em ?? new Date().toISOString(), origem: e.origem, categoria: e.categoria,
    acao: e.acao.slice(0, 120), ator: { ...e.ator, nome: e.ator.nome.slice(0, 80) },
    ...(e.alvo ? { alvo: e.alvo.slice(0, 120) } : {}),
    detalhes: e.detalhes.map(d => d.slice(0, 400)).slice(0, 30),
  })
  if (estado.entradas.length > MAX_ENTRADAS) estado.entradas.splice(0, estado.entradas.length - MAX_ENTRADAS)
  salvarDepois()
}

// ── Site: eventos da auditoria → categoria + texto ─────────────────────────────

/** Eventos técnicos/repetitivos que não entram nos logs do painel (continuam no audit.log). */
const IGNORADOS = new Set<AuditEvent>(['RANKING_VIEW', 'MEMBER_VIEW', 'TOKEN_REFRESHED', 'RATE_LIMIT_HIT', 'FIREWALL_BLOCK', 'TOKEN_INVALIDO'])

const EVENTOS: Partial<Record<AuditEvent, [string, string]>> = {
  LOGIN_SUCCESS: ['Acesso', 'Entrou no painel'], DISCORD_LOGIN_SUCCESS: ['Acesso', 'Entrou no painel pelo Discord'],
  LOGIN_FAILED: ['Segurança', 'Falha de login'], DISCORD_LOGIN_DENIED: ['Acesso', 'Login recusado'], DISCORD_LOGIN_ERROR: ['Acesso', 'Erro no login pelo Discord'],
  LOGOUT: ['Acesso', 'Saiu do painel'], TERMOS_ACEITOS: ['Acesso', 'Aceitou os termos'], ONBOARDING_DONE: ['Acesso', 'Concluiu o cadastro'],
  SIGNUP_REQUESTED: ['Acesso', 'Pediu acesso / set'], SIGNUP_APPROVED: ['Acesso', 'Aprovou pedido de acesso'], SIGNUP_REJECTED: ['Acesso', 'Reprovou pedido de acesso'],
  DISCORD_ACCOUNT_CREATED: ['Acesso', 'Conta criada pelo Discord'], DISCORD_MEMBER_LEFT: ['Membros', 'Exonerado ao sair do Discord'],
  ACCOUNT_CREATED: ['Contas', 'Criou conta'], ACCOUNT_UPDATED: ['Contas', 'Alterou conta'], ACCOUNT_DELETED: ['Contas', 'Removeu conta'], ACCOUNT_READMITTED: ['Contas', 'Readmitiu conta'],
  ROLE_CHANGED: ['Contas', 'Alterou cargo de permissão'],
  MEMBRO_CREATED: ['Membros', 'Adicionou membro'], MEMBRO_UPDATED: ['Membros', 'Editou membro'], MEMBRO_DELETED: ['Membros', 'Removeu membro'],
  MEMBRO_PROMOVIDO: ['Membros', 'Promoveu membro'], MEMBRO_REBAIXADO: ['Membros', 'Rebaixou membro'], MEMBRO_EXONERADO: ['Membros', 'Exonerou membro'],
  ADVERTENCIA_APLICADA: ['Advertências', 'Aplicou advertência'], ADVERTENCIA_REMOVIDA: ['Advertências', 'Retirou advertência'],
  PERFIL_SOLICITADO: ['Membros', 'Pediu alteração de perfil'], PERFIL_APROVADO: ['Membros', 'Aprovou alteração de perfil'], PERFIL_RECUSADO: ['Membros', 'Recusou alteração de perfil'],
  PROFILE_SELF_EDITED: ['Membros', 'Editou o próprio perfil'], PROFILE_MEMBER_LINKED: ['Membros', 'Vinculou perfil'],
  AUSENCIA_CREATED: ['Ausências', 'Registrou ausência'], AUSENCIA_DELETED: ['Ausências', 'Removeu ausência'], AUSENCIA_APROVADA: ['Ausências', 'Aprovou ausência'],
  AUSENCIA_RECUSADA: ['Ausências', 'Recusou ausência'], AUSENCIA_ENCERRADA: ['Ausências', 'Encerrou ausência'],
  RELATORIO_CREATED: ['Investigação', 'Criou relatório'], RELATORIO_UPDATED: ['Investigação', 'Editou relatório'], RELATORIO_DELETED: ['Investigação', 'Excluiu relatório'],
  BOLETIM_CREATED: ['Investigação', 'Criou boletim'], BOLETIM_UPDATED: ['Investigação', 'Editou boletim'], BOLETIM_DELETED: ['Investigação', 'Excluiu boletim'],
  INQUERITO_CREATED: ['Investigação', 'Criou inquérito'], INQUERITO_UPDATED: ['Investigação', 'Editou inquérito'], INQUERITO_DELETED: ['Investigação', 'Excluiu inquérito'],
  ARQUIVO_ENVIADO: ['Investigação', 'Enviou arquivo'], ACAO_CREATED: ['Investigação', 'Registrou ação'], ACAO_DELETED: ['Investigação', 'Excluiu ação'], ACAO_APPROVED: ['Investigação', 'Aprovou ação'],
  ARVORE_CREATED: ['Árvores', 'Criou árvore de investigação'], ARVORE_UPDATED: ['Árvores', 'Alterou árvore de investigação'], ARVORE_DELETED: ['Árvores', 'Apagou árvore de investigação'],
  FOTO_CREATED: ['Galeria', 'Publicou foto'], FOTO_UPDATED: ['Galeria', 'Editou foto'], FOTO_DELETED: ['Galeria', 'Excluiu foto'],
  AVISO_CREATED: ['Comunicados', 'Publicou comunicado'], AVISO_DELETED: ['Comunicados', 'Excluiu comunicado'],
  RECRUTA_CREATED: ['Recrutamento', 'Cadastrou candidato'], RECRUTA_AVALIADO: ['Recrutamento', 'Avaliou candidato'], RECRUTA_FECHADO: ['Recrutamento', 'Fechou recrutamento'], RECRUTA_DELETED: ['Recrutamento', 'Removeu candidato'],
  CONFIG_UPDATED: ['Configurações', 'Alterou configuração'], CANAIS_UPDATED: ['Configurações', 'Alterou canais'], LOGO_UPDATED: ['Configurações', 'Trocou a logo'], LOGO_DELETED: ['Configurações', 'Removeu a logo'],
  BACKUP_DOWNLOADED: ['Configurações', 'Baixou backup'], RESTORE_EXECUTED: ['Configurações', 'Restaurou backup'], RANKING_RECALCULATED: ['Configurações', 'Recalculou ranking'],
  RANKING_APREENSOES_RESETADO: ['Configurações', 'Zerou ranking de apreensões'],
  CARTEIRA_POSTADA: ['Discord (pelo site)', 'Postou carteirinha no fórum'], ANUNCIO_IMAGEM_ENVIADA: ['Discord (pelo site)', 'Enviou imagem de anúncio'],
  MENSAGEM_DISCORD_ENVIADA: ['Discord (pelo site)', 'Enviou mensagem pelo bot'],
  UNAUTHORIZED_ACCESS: ['Segurança', 'Acesso negado'], PRIVILEGE_ESCALATION_ATTEMPT: ['Segurança', 'Tentativa de subir privilégio'],
  LOGIN_LOCKED: ['Segurança', 'Login bloqueado'], FIREWALL_BAN: ['Segurança', 'IP bloqueado pelo firewall'], PASSWORD_CHANGED: ['Segurança', 'Senha alterada'],
}

function registrarDoSite(event: AuditEvent, req: Pick<Request, 'user'> | undefined, detail: string | null): void {
  if (IGNORADOS.has(event)) return
  const [categoria, acao] = EVENTOS[event] ?? ['Outros', event]
  const contaId = req?.user?.contaId
  let nome = 'Sistema'
  if (contaId) {
    try { nome = nomeDaConta(peekData(), contaId) } catch { nome = req?.user?.username ?? 'Conta' }
  }
  registrarLog({ origem: 'site', categoria, acao, ator: { nome, ...(contaId ? { contaId } : {}) }, detalhes: detail ? detail.split('\n').filter(Boolean) : [] })
}

// ── Discord: registro de auditoria do servidor → categoria + texto ─────────────

const TIPOS_DISCORD: Record<number, [string, string]> = {
  1: ['Servidor', 'Alterou o servidor'],
  10: ['Canais', 'Criou canal'], 11: ['Canais', 'Alterou canal'], 12: ['Canais', 'Apagou canal'],
  13: ['Canais', 'Criou permissão de canal'], 14: ['Canais', 'Alterou permissão de canal'], 15: ['Canais', 'Removeu permissão de canal'],
  20: ['Moderação', 'Expulsou membro'], 21: ['Moderação', 'Limpou membros inativos'], 22: ['Moderação', 'Baniu membro'], 23: ['Moderação', 'Desbaniu membro'],
  24: ['Membros do servidor', 'Alterou membro'], 25: ['Membros do servidor', 'Alterou cargos de membro'], 26: ['Membros do servidor', 'Moveu membro de canal de voz'],
  27: ['Membros do servidor', 'Desconectou membro da voz'], 28: ['Servidor', 'Adicionou bot'],
  30: ['Cargos', 'Criou cargo'], 31: ['Cargos', 'Alterou cargo'], 32: ['Cargos', 'Apagou cargo'],
  40: ['Servidor', 'Criou convite'], 41: ['Servidor', 'Alterou convite'], 42: ['Servidor', 'Apagou convite'],
  50: ['Servidor', 'Criou webhook'], 51: ['Servidor', 'Alterou webhook'], 52: ['Servidor', 'Apagou webhook'],
  60: ['Servidor', 'Criou emoji'], 61: ['Servidor', 'Alterou emoji'], 62: ['Servidor', 'Apagou emoji'],
  72: ['Mensagens', 'Apagou mensagem'], 73: ['Mensagens', 'Apagou mensagens em massa'], 74: ['Mensagens', 'Fixou mensagem'], 75: ['Mensagens', 'Desafixou mensagem'],
  80: ['Servidor', 'Adicionou integração'], 81: ['Servidor', 'Alterou integração'], 82: ['Servidor', 'Removeu integração'],
  83: ['Canais', 'Abriu palco'], 84: ['Canais', 'Alterou palco'], 85: ['Canais', 'Encerrou palco'],
  90: ['Servidor', 'Criou figurinha'], 91: ['Servidor', 'Alterou figurinha'], 92: ['Servidor', 'Apagou figurinha'],
  100: ['Servidor', 'Criou evento'], 101: ['Servidor', 'Alterou evento'], 102: ['Servidor', 'Cancelou evento'],
  110: ['Canais', 'Criou tópico'], 111: ['Canais', 'Alterou tópico'], 112: ['Canais', 'Apagou tópico'],
  121: ['Servidor', 'Alterou permissões de comando'],
  140: ['Moderação', 'Criou regra de AutoMod'], 141: ['Moderação', 'Alterou regra de AutoMod'], 142: ['Moderação', 'Apagou regra de AutoMod'],
  143: ['Moderação', 'AutoMod bloqueou mensagem'], 144: ['Moderação', 'AutoMod sinalizou mensagem'], 145: ['Moderação', 'AutoMod aplicou castigo'],
}

const NOMES_CHAVE: Record<string, string> = {
  name: 'Nome', nick: 'Apelido', topic: 'Tópico', permissions: 'Permissões', color: 'Cor', hoist: 'Separado na lista', mentionable: 'Mencionável',
  communication_disabled_until: 'Castigo até', deaf: 'Ensurdecido', mute: 'Silenciado', nsfw: 'Conteúdo +18', rate_limit_per_user: 'Modo lento (s)',
  position: 'Posição', bitrate: 'Bitrate', user_limit: 'Limite de usuários', icon_hash: 'Ícone', avatar_hash: 'Avatar', description: 'Descrição',
  max_uses: 'Usos máximos', max_age: 'Validade (s)', code: 'Código', parent_id: 'Categoria', type: 'Tipo', archived: 'Arquivado', locked: 'Trancado',
}

function valorTexto(v: unknown, nomeDe: (id: string) => string | undefined): string {
  if (v === undefined || v === null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'string' && /^\d{17,20}$/.test(v)) return nomeDe(v) ?? 'item do servidor'
  if (typeof v === 'string' || typeof v === 'number') return String(v).slice(0, 120)
  return JSON.stringify(v).replace(/\d{17,20}/g, 'id').slice(0, 120)
}

function textoDasMudancas(mudancas: MudancaAuditoria[], nomeDe: (id: string) => string | undefined): string[] {
  const linhas: string[] = []
  for (const m of mudancas) {
    if ((m.chave === '$add' || m.chave === '$remove') && Array.isArray(m.depois)) {
      const nomes = (m.depois as { name?: unknown }[]).map(r => `@${typeof r.name === 'string' ? r.name : 'cargo'}`).join(', ')
      linhas.push(`${m.chave === '$add' ? 'Cargo adicionado' : 'Cargo removido'}: ${nomes}`)
      continue
    }
    if (m.chave === 'permission_overwrites' || m.chave === 'available_tags') { linhas.push(`${NOMES_CHAVE[m.chave] ?? m.chave}: alterado`); continue }
    linhas.push(`${NOMES_CHAVE[m.chave] ?? m.chave}: ${valorTexto(m.antes, nomeDe)} → ${valorTexto(m.depois, nomeDe)}`)
  }
  return linhas
}

function entradaDoDiscord(e: EntradaAuditoria, usuarios: Map<string, { nome: string; avatar?: string }>, nomeDe: (id: string) => string | undefined): Omit<EntradaLog, 'id'> {
  const [categoria, acao] = TIPOS_DISCORD[e.tipo] ?? ['Servidor', `Ação no servidor (tipo ${e.tipo})`]
  const autor = e.autorId ? usuarios.get(e.autorId) : undefined
  const alvo = e.alvoId ? (usuarios.get(e.alvoId)?.nome ?? nomeDe(e.alvoId)) : undefined
  const detalhes = textoDasMudancas(e.mudancas, nomeDe)
  const canal = typeof e.opcoes.channel_id === 'string' ? nomeDe(e.opcoes.channel_id) : undefined
  if (canal) detalhes.push(`Canal: #${canal}`)
  if (typeof e.opcoes.count === 'string') detalhes.push(`Quantidade: ${e.opcoes.count}`)
  if (e.motivo) detalhes.push(`Motivo: ${e.motivo}`)
  // O snowflake do registro traz o horário
  const em = new Date(Number((BigInt(e.id) >> 22n) + 1420070400000n)).toISOString()
  return {
    em, origem: 'discord', categoria, acao,
    ator: { nome: autor?.nome ?? 'Discord', ...(e.autorId ? { discordId: e.autorId } : {}), ...(autor?.avatar ? { avatar: autor.avatar } : {}) },
    ...(alvo ? { alvo } : {}), detalhes,
  }
}

let membrosAntes: Map<string, { nome: string; avatar?: string }> | undefined

/** Uma rodada: registro de auditoria novo + quem entrou/saiu desde a última rodada. */
export async function coletarDoDiscord(): Promise<void> {
  const cfg = discordConfig()
  if (!cfg) return
  carregar()
  const info = await infoServidor(cfg)
  const nomes = new Map<string, string>()
  for (const r of info?.todosCargos ?? []) nomes.set(r.id, r.nome)
  for (const c of info?.todosCanais ?? []) nomes.set(c.id, c.nome)
  const nomeDe = (id: string) => nomes.get(id)

  const reg = await lerRegistroAuditoria(cfg)
  if (reg === 'sem_acesso') erroDiscordLogs = 'sem_acesso'
  else if (!reg) erroDiscordLogs = 'discord'
  else {
    erroDiscordLogs = null
    const ultimo = estado.ultimoDiscord ? BigInt(estado.ultimoDiscord) : 0n
    const novas = reg.entradas.filter(e => BigInt(e.id) > ultimo).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    for (const e of novas) registrarLog(entradaDoDiscord(e, reg.usuarios, nomeDe))
    if (novas.length) { estado.ultimoDiscord = novas[novas.length - 1].id; salvarDepois() }
  }

  const membros = await membrosAtuais(cfg)
  if (membros) {
    const agora = new Map([...membros].map(([id, p]) => [id, { nome: p.apelido || p.nome, ...(p.avatar ? { avatar: p.avatar } : {}) }]))
    if (membrosAntes) {
      for (const [id, p] of agora) if (!membrosAntes.has(id)) registrarLog({ origem: 'discord', categoria: 'Entradas e saídas', acao: 'Entrou no servidor', ator: { nome: p.nome, discordId: id, ...(p.avatar ? { avatar: p.avatar } : {}) }, detalhes: [] })
      for (const [id, p] of membrosAntes) if (!agora.has(id)) registrarLog({ origem: 'discord', categoria: 'Entradas e saídas', acao: 'Saiu do servidor', ator: { nome: p.nome, discordId: id, ...(p.avatar ? { avatar: p.avatar } : {}) }, detalhes: [] })
    }
    membrosAntes = agora
  }
}

let rotina: NodeJS.Timeout | undefined
/** Liga os logs: eventos do site na hora e o Discord a cada 1 minuto. */
export function iniciarLogs(): void {
  carregar()
  ouvirAudit(registrarDoSite)
  if (rotina || !discordConfig()) return
  // Uma coleta por vez: com o Discord lento, duas rodadas juntas registravam as mesmas entradas em dobro
  let coletando = false
  const rodar = () => {
    if (coletando) return
    coletando = true
    void coletarDoDiscord().catch(() => { erroDiscordLogs = 'discord' }).finally(() => { coletando = false })
  }
  setTimeout(rodar, 15_000).unref()
  rotina = setInterval(rodar, 60_000)
  rotina.unref()
}

// ── Leitura (rota /api/logs) ───────────────────────────────────────────────────

/** Chave opaca do avatar (não revela o ID do Discord nem o da conta); muda a cada reinício. */
const SEGREDO_AVATAR = crypto.randomBytes(32)
const avatares = new Map<string, { contaId?: number; url?: string }>()
function chaveAvatar(ator: EntradaLog['ator']): string | null {
  if (!ator.contaId && !ator.avatar) return null
  const ref = ator.contaId ? `c${ator.contaId}` : `u${ator.avatar}`
  const chave = crypto.createHmac('sha256', SEGREDO_AVATAR).update(ref).digest('base64url').slice(0, 22)
  if (!avatares.has(chave)) {
    if (avatares.size > 5000) avatares.clear()
    avatares.set(chave, ator.contaId ? { contaId: ator.contaId } : { url: ator.avatar })
  }
  return chave
}
export const avatarDaChave = (chave: string) => avatares.get(chave)

export interface FiltroLogs { origem?: OrigemLog; categoria?: string; busca?: string; antesDe?: number; limite: number }

/** Lista branca: sem IDs do Discord, sem contaId; o avatar vira uma chave opaca. */
export function listarLogs(f: FiltroLogs) {
  carregar()
  const termos = (f.busca ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const saida = []
  for (let i = estado.entradas.length - 1; i >= 0 && saida.length < f.limite; i--) {
    const e = estado.entradas[i]
    if (f.antesDe && e.id >= f.antesDe) continue
    if (f.origem && e.origem !== f.origem) continue
    if (f.categoria && e.categoria !== f.categoria) continue
    if (termos.length) {
      const texto = `${e.ator.nome} ${e.acao} ${e.alvo ?? ''} ${e.categoria} ${e.detalhes.join(' ')}`.toLowerCase()
      if (!termos.every(t => texto.includes(t))) continue
    }
    saida.push({ id: e.id, em: e.em, origem: e.origem, categoria: e.categoria, acao: e.acao, alvo: e.alvo ?? null,
      ator: { nome: e.ator.nome, avatar: chaveAvatar(e.ator) }, detalhes: e.detalhes })
  }
  return saida
}

/** Categorias existentes (para os filtros) com a contagem, por origem. */
export function categoriasDosLogs() {
  carregar()
  const cont = new Map<string, { origem: OrigemLog; categoria: string; total: number }>()
  for (const e of estado.entradas) {
    const k = `${e.origem}|${e.categoria}`
    const c = cont.get(k) ?? { origem: e.origem, categoria: e.categoria, total: 0 }
    c.total++
    cont.set(k, c)
  }
  return [...cont.values()].sort((a, b) => a.origem.localeCompare(b.origem) || a.categoria.localeCompare(b.categoria))
}

/** Só para testes: zera o estado em memória. */
export function _zerarLogs(): void { estado = { proximoId: 1, entradas: [] }; carregado = true; membrosAntes = undefined }
