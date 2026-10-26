// Áreas do painel controladas pelo sistema de cargos de permissão.
// A ordem aqui é a ordem exibida na tela de configuração.
export const PERM_AREAS = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'avisos',        label: 'Comunicados' },
  { id: 'registrar_acao',label: 'Registrar Ação' },
  { id: 'pendentes',     label: 'Aprovações' },
  { id: 'historico',     label: 'Histórico' },
  { id: 'relatorios',    label: 'Relatórios investigativos (Editar = cadastrar e editar os próprios)' },
  { id: 'relatorios_gestao', label: 'Relatórios — gestão (ver sigilosos, editar e excluir de todos)' },
  { id: 'boletins',      label: 'Boletins' },
  { id: 'inqueritos',    label: 'Arquivo de Inquéritos' },
  { id: 'galeria',       label: 'Galeria da DU (Editar = publicar fotos)' },
  { id: 'estatisticas',  label: 'Estatísticas' },
  { id: 'relatorio',     label: 'Relatório da unidade' },
  { id: 'ranking',       label: 'Ranking' },
  { id: 'zerar_rankings', label: 'Zerar rankings (todos os módulos)' },
  { id: 'membros',       label: 'Membros' },
  { id: 'ausencias',     label: 'Ausências' },
  { id: 'promocoes',     label: 'Promoções' },
  { id: 'fardamento',    label: 'Fardamento' },
  { id: 'cursos',        label: 'Cursos Internos' },
  { id: 'recrutamento',  label: 'Recrutamento' },
  { id: 'anuncio',       label: 'Gerar Anúncio' },
  { id: 'protocolo',     label: 'Protocolo' },
  { id: 'carteira',      label: 'Carteirinha da DU' },
  { id: 'mensagens',     label: 'Enviar mensagem (Discord)' },
  { id: 'configuracoes', label: 'Configurações' },
] as const

export type AreaId = typeof PERM_AREAS[number]['id']
export const AREA_IDS: string[] = PERM_AREAS.map(a => a.id)

export interface PermArea { ver: boolean; editar: boolean }
export type PermMap = Record<string, PermArea>

/** Normaliza um mapa parcial para conter TODAS as áreas (faltantes = false). */
export function normalizePermMap(parcial?: Partial<Record<string, Partial<PermArea>>>): PermMap {
  const out: PermMap = {}
  for (const { id } of PERM_AREAS) {
    const p = parcial?.[id]
    out[id] = { ver: Boolean(p?.ver), editar: Boolean(p?.editar) }
  }
  return out
}

/** Mapa com acesso total (usado por admin). */
export function fullPermMap(): PermMap {
  const out: PermMap = {}
  for (const { id } of PERM_AREAS) out[id] = { ver: true, editar: true }
  return out
}

/** Mapa sem nenhum acesso (conta sem cargo). */
export function emptyPermMap(): PermMap {
  const out: PermMap = {}
  for (const { id } of PERM_AREAS) out[id] = { ver: false, editar: false }
  return out
}
