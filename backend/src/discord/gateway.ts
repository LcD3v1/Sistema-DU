import { Client, Events, GatewayCloseCodes, GatewayIntentBits, MessageFlags } from 'discord.js'
import { readData, writeData, peekData } from '../data'
import { audit } from '../security/audit'
import { PROTECTED_OWNER_ID, canArea, podeZerarRankings, discordIdsAcessoExterno } from '../access'
import { botConfigurado } from './forum'
import { definirBotNoServidor, verificarBotNoServidor } from './acessoServidor'
import { exonerarMembro, ehContaDona } from '../efetivo'
import { notificarArea } from '../notificacoes'
import { aplicarIdentidade, MembroServidor } from './identidade'
import { ID_BOTAO_ATUALIZAR, ID_BOTAO_RESETAR, atualizarPainel, resetarRanking } from './painelApreensoes'
import { garantirCargosAdv, sincronizarTodosCargosAdv } from './cargosAdv'
import { definirPresencaAtiva, registrarPresenca } from './presenca'

/**
 * Conexão em tempo real com o Discord (gateway) para detectar quando alguém
 * sai do servidor. Ao sair:
 *   1. a exoneração é postada no tópico da pessoa no fórum de Registro (fica lá);
 *   2. o membro sai do efetivo do painel e a conta perde o acesso.
 *
 * Requer o "Server Members Intent" ativado no Developer Portal (aba Bot).
 * Online/offline no site usa também o "Presence Intent"; se ele não estiver
 * ligado, o bot reconecta sozinho sem presença (DISCORD_PRESENCA=off desliga).
 */

const MOTIVO_SAIDA = 'Saiu do servidor do Discord'

/**
 * Saída do servidor = exoneração automática: o membro sai do efetivo do painel,
 * a conta fica bloqueada (vê o aviso de exoneração) e o tópico recebe o ❌.
 */
export function processarSaida(discordId: string, origem: string): void {
  // Liberado para ficar fora do servidor (DISCORD_ACESSO_EXTERNO): não exonera
  if (discordIdsAcessoExterno().includes(discordId)) return
  // Checagem barata sem copiar o banco: a maioria das saídas não tem conta no painel
  const previa = peekData().contas.find(c => c.discordId === discordId)
  if (!previa || ehContaDona(previa) || previa.exonerado) return
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

function prepararCargosAdv(): void {
  garantirCargosAdv().then(sincronizarTodosCargosAdv).catch(err =>
    console.error('[FAST][DISCORD] cargos de advertência:', err instanceof Error ? err.message : err,
      '— confira se o bot tem a permissão "Gerenciar Cargos".'))
}

export function iniciarGateway(): void {
  if (!botConfigurado()) {
    console.log('[FAST][DISCORD] Bot não configurado — detecção de saída do servidor desativada.')
    return
  }
  if (process.env.DISCORD_GATEWAY === 'off') {
    console.log('[FAST][DISCORD] Gateway desligado (DISCORD_GATEWAY=off) — sem eventos em tempo real; presença do bot consultada pela API.')
    verificarBotNoServidor(true).then(
      ok => console.log(`[FAST][DISCORD] Bot ${ok ? 'está' : 'NÃO está'} no servidor da unidade.`),
      err => console.error('[FAST][DISCORD] verificar bot no servidor:', err instanceof Error ? err.message : err),
    )
    return
  }
  conectar(process.env.DISCORD_PRESENCA !== 'off')
}

function conectar(comPresenca: boolean): void {
  const guildId = process.env.DISCORD_GUILD_ID!
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  if (comPresenca) intents.push(GatewayIntentBits.GuildPresences)
  const client = new Client({ intents })
  definirPresencaAtiva(false)

  // Presence Intent desligado no Developer Portal: o Discord recusa a conexão
  // inteira (4014). Reconecta uma vez sem presença para o resto do bot seguir.
  let refeito = false
  const semPresenca = () => {
    if (!comPresenca || refeito) return
    refeito = true
    console.warn('[FAST][DISCORD] "Presence Intent" não está ativado no Developer Portal — reconectando sem online/offline.')
    client.destroy().catch(() => {}).finally(() => conectar(false))
  }
  client.on(Events.ShardDisconnect, ev => { if (ev.code === GatewayCloseCodes.DisallowedIntents) semPresenca() })

  // Online/offline dos membros (só em memória)
  if (comPresenca) client.on(Events.PresenceUpdate, (_antes, depois) => {
    if (depois.guild?.id === guildId) registrarPresenca(depois.userId, depois.status)
  })

  // Presença do bot no servidor (libera/bloqueia o painel)
  client.on(Events.GuildCreate, g => { if (g.id === guildId) { definirBotNoServidor(true); console.log('[FAST][DISCORD] Bot adicionado ao servidor — painel liberado.'); prepararCargosAdv() } })
  client.on(Events.GuildDelete, g => { if (g.id === guildId) { definirBotNoServidor(false); console.warn('[FAST][DISCORD] Bot removido do servidor — acesso ao painel bloqueado.') } })

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
      // Sem conta vinculada não há o que atualizar → evita copiar o banco a cada evento
      if (!peekData().contas.some(c => c.discordId === depois.id)) return
      const data = readData()
      const conta = data.contas.find(c => c.discordId === depois.id)
      const m: MembroServidor = {
        user: { id: depois.id, username: depois.user.username, global_name: depois.user.globalName, avatar: depois.user.avatar },
        nick: depois.nickname, avatar: depois.avatar, roles: [...depois.roles.cache.keys()].filter(id => id !== guildId),
      }
      if (conta && aplicarIdentidade(conta, m)) {
        writeData(data)
        audit('MEMBER_UPDATED', undefined, `discord=${depois.id}; guild=${guildId}`)
        if (!_antes.roles.cache.equals(depois.roles.cache)) audit('ROLE_CHANGED', undefined, `discord=${depois.id}; guild=${guildId}`)
      }
    } catch (err) {
      console.error('[FAST][DISCORD] atualizar identidade:', err instanceof Error ? err.message : err)
    }
  })

  // Ao conectar, confere quem saiu enquanto o sistema estava desligado.
  client.once(Events.ClientReady, async c => {
    console.log(`[FAST][DISCORD] Bot conectado como ${c.user.tag}`)
    try {
      const guild = await c.guilds.fetch(guildId).catch(err => {
        definirBotNoServidor(false)
        console.warn('[FAST][DISCORD] Bot NÃO está no servidor da unidade — acesso ao painel bloqueado.')
        throw err
      })
      definirBotNoServidor(true)
      const membros = await guild.members.fetch({ withPresences: comPresenca })
      if (comPresenca) {
        definirPresencaAtiva(true)
        for (const [id, p] of guild.presences.cache) registrarPresenca(id, p.status)
      }

      // Sincroniza apelido e foto do servidor de todas as contas
      const dados = readData()
      let mudou = false
      for (const conta of dados.contas) {
        const m = conta.discordId ? membros.get(conta.discordId) : undefined
        if (m && aplicarIdentidade(conta, {
          user: { id: m.id, username: m.user.username, global_name: m.user.globalName, avatar: m.user.avatar },
          nick: m.nickname, avatar: m.avatar, roles: [...m.roles.cache.keys()].filter(id => id !== guildId),
        })) mudou = true
      }
      if (mudou) writeData(dados)

      for (const conta of peekData().contas) {
        if (conta.discordId && conta.id !== PROTECTED_OWNER_ID && !conta.exonerado && !membros.has(conta.discordId)) {
          processarSaida(conta.discordId, 'Verificação ao iniciar')
        }
      }
      // Cargos de advertência: cria ADV FAST 1/2/3 se faltarem e corrige quem estiver diferente do painel
      prepararCargosAdv()
    } catch (err) {
      console.error('[FAST][DISCORD] verificação inicial de membros:', err instanceof Error ? err.message : err,
        '— confira se o "Server Members Intent" está ativado no Developer Portal.')
    }
  })

  // ── Botões do painel de apreensões ──────────────────────────────────────────
  // O clique vem do Discord, não do painel: a permissão é conferida AQUI, pelo
  // discordId de quem clicou. Reset exige a permissão específica de zerar rankings.
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return
    if (interaction.customId !== ID_BOTAO_ATUALIZAR && interaction.customId !== ID_BOTAO_RESETAR) return

    const negar = (motivo: string) =>
      interaction.reply({ content: motivo, flags: MessageFlags.Ephemeral }).catch(() => {})

    try {
      const dados = peekData()
      const conta = dados.contas.find(c => c.discordId === interaction.user.id)
      // Exonerado é bloqueio total, mesmo que o cargo antigo permitisse.
      if (!conta || conta.exonerado || conta.ativo === false) {
        audit('UNAUTHORIZED_ACCESS', undefined, `Botão do painel de apreensões sem conta ativa (Discord ${interaction.user.id})`)
        await negar('Você não tem acesso ao painel da FAST.')
        return
      }
      const permitido = interaction.customId === ID_BOTAO_RESETAR
        ? podeZerarRankings(conta, dados)
        : canArea(conta, dados, 'pendentes', 'editar')
      if (!permitido) {
        audit('UNAUTHORIZED_ACCESS', undefined, `Botão "${interaction.customId}" negado para ${conta.username} (#${conta.id})`)
        await negar('Seu cargo não tem permissão para isso.')
        return
      }

      await interaction.deferUpdate()
      if (interaction.customId === ID_BOTAO_RESETAR) {
        await resetarRanking(conta.id)
        await interaction.followUp({ content: '🟥 Ranking resetado.', flags: MessageFlags.Ephemeral }).catch(() => {})
      } else {
        await atualizarPainel()
      }
    } catch (err) {
      console.error('[FAST][DISCORD] botão do painel de apreensões:', err instanceof Error ? err.message : err)
    }
  })

  client.on(Events.Error, err => console.error('[FAST][DISCORD] gateway:', err.message))
  client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    if ((err as { code?: string })?.code === 'DisallowedIntents') { semPresenca(); return }
    console.error('[FAST][DISCORD] falha ao conectar o bot:', err instanceof Error ? err.message : err)
  })
}
