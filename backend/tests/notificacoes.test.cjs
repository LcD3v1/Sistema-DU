// Notificações: quem aprova recebe os pedidos (em todos os módulos), sem pedido "perdido".
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { makeData } = require('./ranking-fixtures.cjs')
const { notificarQuemAprova, notificarAprovadores, notificarArea } = require('../dist/notificacoes')

function cenario() {
  const data = makeData()
  data.cargosPermissao = [
    { id: 10, nome: 'Comando', admin: true, permissoes: {} },
    { id: 20, nome: 'Aprova', permissoes: { setagem: { ver: true, editar: true }, ausencias: { ver: true, editar: true } } },
    { id: 30, nome: 'Só vê', permissoes: { setagem: { ver: true, editar: false }, ausencias: { ver: true, editar: false } } },
  ]
  const conta = (id, cargo, extra = {}) => ({ id, username: 'c' + id, nivel: 'membro', ativo: true, onboarded: true, membroId: id, cargoPermId: cargo, discordId: String(id).repeat(18), ...extra })
  data.contas = [conta(1, 10), conta(2, 20), conta(3, 30), conta(4, 20, { exonerado: true })]
  // Conta antiga sem o campo "ativo" também recebe (só "ativo: false" bloqueia)
  const semAtivo = conta(5, 20); delete semAtivo.ativo
  data.contas.push(semAtivo)
  data.notificacoes = []; data.nextNotifId = 1
  return data
}
const quem = data => [...new Set(data.notificacoes.map(n => n.contaId))].sort()

test('pedido vai para quem APROVA (editar + admin), nunca só para quem vê; sem ninguém → admins', () => {
  const data = cenario()
  notificarQuemAprova(data, 'setagem', [], 'pendente_aprovacao', 'Pedido', 'x', '/setagem')
  assert.deepEqual(quem(data), [1, 2, 5])                                   // 3 só vê; 4 exonerado

  const d2 = cenario()
  notificarQuemAprova(d2, 'investigacoes_gestao', [], 'pendente_aprovacao', 'Pedido', 'x')
  assert.deepEqual(quem(d2), [1])                                           // ninguém com a permissão → admin

  const d3 = cenario()
  notificarQuemAprova(d3, 'setagem', [2], 'pendente_aprovacao', 'Pedido', 'x')
  assert.ok(!quem(d3).includes(2))                                          // quem fez o pedido não se avisa
})

test('aprovadores da hierarquia: sem ninguém acima, os admins recebem', () => {
  const data = cenario()
  // Pedido de quem está no topo (cargo 10 = admin) — ninguém acima: cai nos admins (menos ele mesmo)
  data.contas.push({ id: 6, username: 'c6', nivel: 'membro', ativo: true, onboarded: true, membroId: 6, cargoPermId: 10, discordId: '6'.repeat(18) })
  data.membros.push({ ...data.membros[0], id: 6 })
  notificarAprovadores(data, 'ausencias', 1, 1, 'pendente_aprovacao', 'Ausência', 'x')
  assert.deepEqual(quem(data), [6])
  // Pedido de alguém abaixo: quem edita e está acima recebe
  const d2 = cenario()
  notificarAprovadores(d2, 'ausencias', 3, 3, 'pendente_aprovacao', 'Ausência', 'x')
  assert.deepEqual(quem(d2), [1, 2, 5])
})

test('aviso de área vai para quem vê a área', () => {
  const data = cenario()
  notificarArea(data, 'setagem', [], 'aviso', 'Novo', 'x')
  assert.deepEqual(quem(data), [1, 2, 3, 5])
})
