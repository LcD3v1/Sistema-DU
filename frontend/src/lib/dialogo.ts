import { create } from 'zustand'

/**
 * Card central de confirmação/decisão — substitui confirm()/prompt() do navegador.
 *
 *   if (!(await confirmar({ titulo: 'Apagar?', tom: 'perigo' }))) return
 *   const r = await decidir({ titulo: 'Ausência de Fulano', detalhes: [...] })
 *   if (r?.decisao === 'aprovar') ... else if (r?.decisao === 'reprovar') r.motivo
 *
 * Funciona fora de componentes (é só chamar); o <DialogoCentral /> fica montado no AppShell.
 */

export type Tom = 'info' | 'sucesso' | 'aviso' | 'perigo'
export type ExigenciaMotivo = 'nenhum' | 'opcional' | 'obrigatorio'

export interface Detalhe { label: string; valor: string }

interface Base {
  titulo: string
  mensagem?: string
  detalhes?: Detalhe[]
}

export interface OpcoesConfirmar extends Base {
  tom?: Tom
  textoConfirmar?: string
  textoCancelar?: string
  motivo?: ExigenciaMotivo
  rotuloMotivo?: string
}

export interface OpcoesDecidir extends Base {
  textoAprovar?: string
  textoReprovar?: string
  motivoReprovar?: ExigenciaMotivo
}

export type ResultadoDecisao = { decisao: 'aprovar' } | { decisao: 'reprovar'; motivo: string } | null

export type Pedido = { id: number } & (
  | { tipo: 'confirmar'; opcoes: OpcoesConfirmar; resolver: (r: { motivo: string } | null) => void }
  | { tipo: 'decidir'; opcoes: OpcoesDecidir; resolver: (r: ResultadoDecisao) => void }
)

let seq = 0

interface EstadoDialogo {
  atual: Pedido | null
  abrir: (p: Pedido) => void
  fechar: () => void
}

export const useDialogo = create<EstadoDialogo>()(set => ({
  atual: null,
  abrir: p => set(s => {
    // Se já houver um aberto, cancela o anterior
    if (s.atual) s.atual.resolver(null)
    return { atual: p }
  }),
  fechar: () => set({ atual: null }),
}))

/** Confirmação simples. Retorna `{ motivo }` ao confirmar ou `null` ao cancelar. */
export function confirmar(opcoes: OpcoesConfirmar): Promise<{ motivo: string } | null> {
  return new Promise(resolver => useDialogo.getState().abrir({ id: ++seq, tipo: 'confirmar', opcoes, resolver }))
}

/** Decisão Aprovar/Reprovar. Retorna a decisão (com motivo ao reprovar) ou `null` se fechar. */
export function decidir(opcoes: OpcoesDecidir): Promise<ResultadoDecisao> {
  return new Promise(resolver => useDialogo.getState().abrir({ id: ++seq, tipo: 'decidir', opcoes, resolver }))
}
