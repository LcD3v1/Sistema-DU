import { useState } from 'react'
import { Gauge, Check } from 'lucide-react'
import { useInformarNivel } from '@/hooks/useMe'

/**
 * Bloqueio obrigatório: membro que ainda não informou o nível precisa informar
 * antes de usar o painel. Depois, o nível só muda por alteração aprovada.
 */
export default function NivelObrigatorio() {
  const informar = useInformarNivel()
  const [nivel, setNivel] = useState('')
  const [erro, setErro] = useState('')

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(nivel)
    if (!Number.isInteger(n) || n < 1 || n > 999) { setErro('Informe um nível entre 1 e 999.'); return }
    setErro('')
    informar.mutate(n, {
      onError: err => setErro((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Não foi possível salvar. Tente novamente.'),
    })
  }

  return (
    <div className="fixed inset-0 z-[9600] flex items-center justify-center p-4" style={{ backdropFilter: 'blur(6px)', background: 'rgba(5,5,5,0.85)' }} role="dialog" aria-modal="true" aria-labelledby="nivel-obrigatorio-titulo">
      <form onSubmit={enviar} className="w-full max-w-sm bg-card border border-bdr2 rounded-2xl shadow-2xl p-6 text-center">
        <div className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center bg-gold/15 border border-gold/40">
          <Gauge size={22} className="text-gold3" />
        </div>
        <h2 id="nivel-obrigatorio-titulo" className="text-base font-semibold text-txt">Informe o seu nível</h2>
        <p className="text-sm text-txt2 mt-1.5 leading-relaxed">
          O nível é obrigatório e aparece no ranking, no diretório e no seu perfil. Depois, só muda com aprovação de um superior.
        </p>
        <input
          autoFocus inputMode="numeric" type="number" min={1} max={999}
          value={nivel} onChange={e => setNivel(e.target.value)} placeholder="Ex.: 48"
          className="input-gold mt-4 w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-center text-lg font-mono text-txt"
        />
        {erro && <p className="text-[11px] text-red mt-2">{erro}</p>}
        <button type="submit" disabled={informar.isPending}
          className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
          <Check size={15} /> {informar.isPending ? 'Salvando...' : 'Confirmar nível'}
        </button>
      </form>
    </div>
  )
}
