// Espelho de backend/src/permAreas.ts — mantenha os IDs em sincronia.
export const PERM_AREAS = [
  { id: 'dashboard',      label: 'Dashboard' },
  { id: 'avisos',         label: 'Comunicados' },
  { id: 'registrar_acao', label: 'Registrar Ação' },
  { id: 'pendentes',      label: 'Aprovações' },
  { id: 'historico',      label: 'Histórico' },
  { id: 'estatisticas',   label: 'Estatísticas' },
  { id: 'ranking',        label: 'Ranking' },
  { id: 'membros',        label: 'Membros' },
  { id: 'ausencias',      label: 'Ausências' },
  { id: 'promocoes',      label: 'Promoções' },
  { id: 'recrutamento',   label: 'Recrutamento' },
  { id: 'anuncio',        label: 'Gerar Anúncio' },
  { id: 'boletim',        label: 'Gerar Boletim' },
  { id: 'protocolo',      label: 'Protocolo' },
  { id: 'carteira',       label: 'Gerar Carteira' },
  { id: 'configuracoes',  label: 'Configurações' },
] as const

export type AreaId = typeof PERM_AREAS[number]['id']
export interface PermArea { ver: boolean; editar: boolean }
export type PermMap = Record<string, PermArea>

export function emptyPermMap(): PermMap {
  const out: PermMap = {}
  for (const { id } of PERM_AREAS) out[id] = { ver: false, editar: false }
  return out
}
