// Espelho de backend/src/permAreas.ts — mantenha os IDs em sincronia.
// Áreas legadas do backend (apreensões/ranking) não aparecem aqui: a DU não usa mais essas telas.
export const PERM_AREAS = [
  { id: 'dashboard',         label: 'Dashboard' },
  { id: 'avisos',            label: 'Comunicados' },
  { id: 'relatorios',        label: 'Relatórios investigativos (Editar = cadastrar e editar os próprios)' },
  { id: 'relatorios_gestao', label: 'Relatórios — gestão (ver sigilosos, editar e excluir de todos)' },
  { id: 'boletins',          label: 'Boletins' },
  { id: 'inqueritos',        label: 'Arquivo de Inquéritos' },
  { id: 'investigacoes',     label: 'Registro de Investigação (Ver = os seus pedidos e os que você participa; Editar = registrar e mudar o andamento)' },
  { id: 'investigacoes_gestao', label: 'Registro de Investigação — gestão (Ver = TODAS as investigações; Editar = autorizar, negar e excluir)' },
  { id: 'galeria',           label: 'Galeria da DU (Editar = publicar fotos)' },
  { id: 'membros',           label: 'Membros' },
  { id: 'ausencias',         label: 'Ausências' },
  { id: 'promocoes',         label: 'Promoções' },
  { id: 'fardamento',        label: 'Fardamento' },
  { id: 'cursos',            label: 'Cursos Internos' },
  { id: 'recrutamento',      label: 'Recrutamento' },
  { id: 'anuncio',           label: 'Gerar Anúncio' },
  { id: 'protocolo',         label: 'Protocolo' },
  { id: 'carteira',          label: 'Carteirinha da DU' },
  { id: 'hierarquia',         label: 'Painel de hierarquia (Discord)' },
  { id: 'servidor',           label: 'Servidor do Discord (Editar = ver a lista de membros)' },
  { id: 'setagem',            label: 'Setagem (Editar = configurar e aprovar pedidos de set)' },
  { id: 'arvore',            label: 'Árvore de investigação (Editar = criar e mexer nos quadros)' },
  { id: 'logs',              label: 'Logs (site e servidor do Discord)' },
  { id: 'configuracoes',     label: 'Configurações' },
] as const

export type AreaId = typeof PERM_AREAS[number]['id']
export interface PermArea { ver: boolean; editar: boolean }
export type PermMap = Record<string, PermArea>

export function emptyPermMap(): PermMap {
  const out: PermMap = {}
  for (const { id } of PERM_AREAS) out[id] = { ver: false, editar: false }
  return out
}
