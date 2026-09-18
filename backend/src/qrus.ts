import { FastData, TipoQru } from './types'

/** Tipo do QRU: fechado (ação, com vitória/derrota) ou convencional (apreensão). */
export function tipoDoQru(data: FastData, nome: string): TipoQru {
  return data.qrusFechados?.includes(nome) ? 'fechado' : 'convencional'
}

export function definirTipoQru(data: FastData, nome: string, tipo: TipoQru): void {
  const fechados = (data.qrusFechados ?? []).filter(q => q !== nome)
  if (tipo === 'fechado') fechados.push(nome)
  data.qrusFechados = fechados
}
