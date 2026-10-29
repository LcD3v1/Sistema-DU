const guild = '111111111111111111'
const bot = '222222222222222222'
const scope = { guildId: guild, botId: bot }
function member(id, extra = {}) {
  return { id, policial: `Membro ${id}`, badge: `B${id}`, passaporte: `P${id}`, patenteDPD: 'Officer',
    patenteInterna: 'Officer', status: 'Ativo', entrada: '2026-08-01', promocao: '2026-08-01',
    adv1: false, adv2: false, adv3: false, ...extra }
}
function action(id, members, extra = {}) {
  return { id, data: '2026-09-17', qru: 'QRU-1', resultado: 'Vitória', status: 'aprovada',
    participants: members.map(memberId => ({ memberId, patenteUnidade: 'Officer' })), ...extra }
}
function makeData() {
  return { membros: [member(1), member(2), member(3), member(4)],
    contas: [{ id: 1, username: 'comando', nivel: 'admin', ativo: true, onboarded: true, membroId: 1, discordId: '333333333333333333', cargoPermId: 10 },
      { id: 2, username: 'operador', nivel: 'membro', ativo: true, onboarded: true, membroId: 2, cargoPermId: 20, discordId: '444444444444444444' }],
    acoes: [action(1, [1, 2]), action(2, [1], { resultado: 'Derrota' }), action(3, [1, 3], { resultado: 'Empate' })],
    cargosPermissao: [{ id: 10, nome: 'Commander', permissoes: { membros: { ver: true, editar: true } } },
      { id: 20, nome: 'Officer', permissoes: { membros: { ver: true, editar: false } } }],
    patentes: ['Commander', 'Officer'], membrosOrder: [1, 2, 3, 4], ausencias: [], notificacoes: [],
    nextNotifId: 1, canais: {}, avisos: [], fardamentos: [], solicitacoesPerfil: [], nextMemId: 5,
  }
}
module.exports = { guild, bot, scope, member, action, makeData }
