import { useAdvertir, useRetirarAdvertencia } from '@/hooks/useMembros'
import { useUIStore } from '@/store/uiStore'
import { confirmar } from '@/lib/dialogo'
import { nomeComDiscord } from '@/lib/discordDisplay'
import type { Membro } from '@/types'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data?.details?.join(' | ')
  ?? (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  ?? padrao

/**
 * Clique num quadradinho de advertência: vazio → aplica aquele ADV (pede motivo);
 * marcado → retira só aquele ADV. Cada nível é independente, e o cargo do
 * Discord acompanha (o backend sincroniza).
 */
export function useAlternarAdv() {
  const advertir = useAdvertir()
  const retirar = useRetirarAdvertencia()
  const { addToast } = useUIStore()

  async function alternar(membro: Membro, nivel: 1 | 2 | 3) {
    if (advertir.isPending || retirar.isPending) return
    const nome = nomeComDiscord(membro)
    const ativo = membro[`adv${nivel}`]

    if (ativo) {
      const ok = await confirmar({
        titulo: `Retirar ADV ${nivel}`,
        mensagem: `Retirar a advertência ADV ${nivel} de ${nome}? O cargo ADV ${nivel} sai no Discord e os outros níveis continuam como estão.`,
        tom: 'aviso', textoConfirmar: 'Retirar',
      })
      if (!ok) return
      retirar.mutate({ id: membro.id, nivel }, {
        onSuccess: () => addToast('success', `ADV ${nivel} retirada de ${nome}.`),
        onError: e => addToast('error', erroApi(e, 'Erro ao retirar a advertência.')),
      })
      return
    }

    const r = await confirmar({
      titulo: `Aplicar ADV ${nivel}`,
      mensagem: `${nome} recebe a advertência ADV ${nivel} e o cargo ADV ${nivel} no Discord. O canal de registro dele é avisado.`,
      tom: nivel === 3 ? 'perigo' : 'aviso', textoConfirmar: `Aplicar ADV ${nivel}`,
      motivo: 'obrigatorio', rotuloMotivo: 'Motivo da advertência',
    })
    if (!r) return
    const motivo = r.motivo.trim()
    if (motivo.length < 3) { addToast('error', 'Informe o motivo da advertência.'); return }
    advertir.mutate({ id: membro.id, nivel, motivo }, {
      onSuccess: () => addToast('success', `ADV ${nivel} aplicada a ${nome}.`),
      onError: e => addToast('error', erroApi(e, 'Erro ao aplicar a advertência.')),
    })
  }

  return { alternar, ocupado: advertir.isPending || retirar.isPending }
}
