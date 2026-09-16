import { Client, Events, GatewayIntentBits } from 'discord.js'
import { readData, writeData } from '../data'
import { audit } from '../security/audit'
import { PROTECTED_OWNER_ID } from '../access'
import { botConfigurado } from './forum'
import { exonerarMembro, ehContaDona } from '../efetivo'
import { notificarArea } from '../notificacoes'
import { aplicarIdentidade, MembroServidor } from './identidade'

/**
 * Conexão em tempo real com o Discord (gateway) para detectar quando alguém
 * sai do servidor. Ao sair:
 *   1. a exoneração é postada no tópico da pessoa no fórum de Registro (fica lá);
 *   2. o membro sai do efetivo do painel e a conta perde o acesso.
 *
 * Requer o "Server Members Intent" ativado no Developer Portal (aba Bot).
 */

const MOTIVO_SAIDA = 'Saiu do servidor do Discord'

/**
 * Saída do servidor = exoneração automática: o membro sai do efetivo do painel,
 * a conta fica bloqueada (vê o aviso de exoneração) e o tópico recebe o ❌.
 */
export function processarSaida(discordId: string, origem: string): void {
  const data = readData()
  const conta = data.contas.find(c => c.discordId === discordId)
  if (!conta || ehContaDona(conta) || conta.exonerado) return

  const membro = conta.membroId ? data.membros.find(m => m.id === conta.membroId) : undefined
  if (membro) {
    exonerarMembro(data, membro, 'Sistema (automático)', MOTIVO_SAIDA)
    notificarArea(data, 'membros', [], 'exoneracao', `${membro.policial} foi exonerado`,
      `Saiu do servidor do Discord — exoneração automática.`, '/membros')
  } else {
    conta.exonerado = true
    conta.exoneradoEm = new Date().toISOString()
    conta.exoneradoMotivo = MOTIVO_SAIDA
    conta.ativo = false
    delete conta.cargoPermId
  }
  writeData(data)

  audit('DISCORD_MEMBER_LEFT', undefined,
    `${origem} | Discord ${discordId} | conta ${conta.username} (#${conta.id})${membro ? ` | membro ${membro.policial} (#${membro.id})` : ''} — exonerado`)
  console.log(`[FAST][DISCORD] ${conta.username} saiu do servidor — exonerado automaticamente.`)
}

export function iniciarGateway(): void {
  if (!botConfigurado()) {
    console.log('[FAST][DISCORD] Bot não configurado — detecção de saída do servidor desativada.')
    return
  }
  const guildId = process.env.DISCORD_GUILD_ID!
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] })

  client.on(Events.GuildMemberRemove, member => {
    if (member.guild.id !== guildId) return
    try { processarSaida(member.id, 'Saída do servidor') } catch (err) {
      console.error('[FAST][DISCORD] processar saída:', err instanceof Error ? err.message : err)
    }
  })

  // Apelido/foto do servidor mudou → atualiza no painel
  client.on(Events.GuildMemberUpdate, (_antes, depois) => {
    if (depois.guild.id !== guildId) return
    try {
      const data = readData()
      const conta = data.contas.find(c => c.discordId === depois.id)
      const m: MembroServidor = {
        user: { id: depois.id, username: depois.user.username, global_name: depois.user.globalName, avatar: depois.user.avatar },
        nick: depois.nickname, avatar: depois.avatar,
      }
      if (conta && aplicarIdentidade(conta, m)) writeData(data)
    } catch (err) {
      console.error('[FAST][DISCORD] atualizar identidade:', err instanceof Error ? err.message : err)
    }
  })

  // Ao conectar, confere quem saiu enquanto o sistema estava desligado.
  client.once(Events.ClientReady, async c => {
    console.log(`[FAST][DISCORD] Bot conectado como ${c.user.tag}`)
    try {
      const guild = await c.guilds.fetch(guildId)
      const membros = await guild.members.fetch()

      // Sincroniza apelido e foto do servidor de todas as contas
      const dados = readData()
      let mudou = false
      for (const conta of dados.contas) {
        const m = conta.discordId ? membros.get(conta.discordId) : undefined
        if (m && aplicarIdentidade(conta, {
          user: { id: m.id, username: m.user.username, global_name: m.user.globalName, avatar: m.user.avatar },
          nick: m.nickname, avatar: m.avatar,
        })) mudou = true
      }
      if (mudou) writeData(dados)

      for (const conta of readData().contas) {
        if (conta.discordId && conta.id !== PROTECTED_OWNER_ID && !conta.exonerado && !membros.has(conta.discordId)) {
          processarSaida(conta.discordId, 'Verificação ao iniciar')
        }
      }
    } catch (err) {
      console.error('[FAST][DISCORD] verificação inicial de membros:', err instanceof Error ? err.message : err,
        '— confira se o "Server Members Intent" está ativado no Developer Portal.')
    }
  })

  client.on(Events.Error, err => console.error('[FAST][DISCORD] gateway:', err.message))
  client.login(process.env.DISCORD_BOT_TOKEN).catch(err =>
    console.error('[FAST][DISCORD] falha ao conectar o bot:', err instanceof Error ? err.message : err))
}
