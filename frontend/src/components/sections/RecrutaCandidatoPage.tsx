import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Lock, CheckCircle } from 'lucide-react'
import { useRecruta, useAvaliarRecruta, useFecharRecruta } from '@/hooks/useRecrutos'
import { useRecCfg } from '@/hooks/useConfig'
import { useAuthStore } from '@/store/authStore'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import LoadingHud from '@/components/ui/LoadingHud'
import { formatDate } from '@/lib/utils'
import type { AvaliacaoIndividual } from '@/types'
import { confirmar } from '@/lib/dialogo'

export default function RecrutaCandidatoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { canEdit: can } = usePerms()
  const { addToast } = useUIStore()

  const recrutaId = parseInt(id ?? '0', 10)
  const { data: recruta, isLoading: recrutaLoading } = useRecruta(recrutaId)
  const { data: recCfg, isLoading: cfgLoading } = useRecCfg()
  const avaliar = useAvaliarRecruta(recrutaId)
  const fechar = useFecharRecruta()

  const [scores, setScores] = useState<Record<number, number>>({})

  const canEdit = can('recrutamento')
  const categorias = recCfg?.categorias ?? []
  const notaMinima = recCfg?.notaMinima ?? 7

  const minhaAvaliacao = recruta?.avaliacoes.find(a => a.contaId === user?.contaId)
  const jaAvaliou = !!minhaAvaliacao

  const total = useMemo(() => {
    if (categorias.length === 0) return 0
    const totalPeso = categorias.reduce((s, c) => s + c.peso, 0)
    const soma = categorias.reduce((s, c) => s + (scores[c.id] ?? 0) * c.peso, 0)
    return totalPeso > 0 ? parseFloat((soma / totalPeso).toFixed(2)) : 0
  }, [scores, categorias])

  const aprovado = total >= notaMinima

  const mediaGeral = useMemo(() => {
    if (!recruta || recruta.avaliacoes.length === 0) return null
    return parseFloat((recruta.avaliacoes.reduce((s, a) => s + a.total, 0) / recruta.avaliacoes.length).toFixed(2))
  }, [recruta])

  async function handleAvaliar() {
    try {
      await avaliar.mutateAsync({ scores, total })
      addToast('success', 'Avaliação enviada!')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      addToast('error', msg ?? 'Erro ao enviar avaliação.')
    }
  }

  async function handleFechar() {
    if (!(await confirmar({ titulo: 'Encerrar avaliações', mensagem: 'Encerrar as avaliações deste candidato? O resultado final será calculado.', tom: 'aviso', textoConfirmar: 'Encerrar' }))) return
    try {
      await fechar.mutateAsync(recrutaId)
      addToast('success', 'Candidato encerrado.')
    } catch {
      addToast('error', 'Erro ao encerrar.')
    }
  }

  if (recrutaLoading || cfgLoading) return <LoadingHud />
  if (!recruta) return (
    <div className="p-6 text-center font-mono text-xs text-txt3">Candidato não encontrado.</div>
  )

  const aberto = recruta.status === 'aberto'

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/recrutamento')} className="text-txt3 hover:text-txt transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-orbitron text-sm font-bold text-gold tracking-wider">{recruta.nome}</h2>
            <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${
              aberto ? 'text-gold border-gold/40 bg-gold/10' : 'text-txt3 border-bdr2 bg-bdr'
            }`}>
              {aberto ? 'ABERTO' : 'FECHADO'}
            </span>
          </div>
          <p className="font-mono text-[10px] text-txt3 mt-0.5">{formatDate(recruta.data)}</p>
        </div>
        {canEdit && aberto && (
          <HudButton variant="ghost" size="sm" onClick={handleFechar} loading={fechar.isPending}>
            <Lock size={13} className="inline mr-1" />
            ENCERRAR
          </HudButton>
        )}
      </div>

      {/* Resultado final (fechado) */}
      {!aberto && recruta.resultado && (
        <GlowCard>
          <div className="p-5 text-center">
            <p className="font-mono text-xs text-txt3 mb-1">RESULTADO FINAL</p>
            <p
              className="font-orbitron text-2xl font-bold tracking-widest"
              style={{ color: recruta.resultado === 'Aprovado' ? '#27ae60' : '#b8433a' }}
            >
              {recruta.resultado === 'Aprovado' ? '✓ APROVADO' : '✕ REPROVADO'}
            </p>
            {mediaGeral !== null && (
              <p className="font-mono text-sm text-txt2 mt-1">Média: {mediaGeral}/10</p>
            )}
          </div>
        </GlowCard>
      )}

      {/* Minha avaliação (já enviada) */}
      {jaAvaliou && (
        <GlowCard>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={14} className="text-green" />
              <h3 className="font-orbitron text-xs font-bold text-green tracking-wider">SUA AVALIAÇÃO ENVIADA</h3>
            </div>
            <div className="space-y-3">
              {categorias.map(cat => (
                <div key={cat.id}>
                  <div className="flex justify-between mb-1">
                    <span className="font-mono text-xs text-txt2">{cat.nome}</span>
                    <span className="font-orbitron text-xs text-gold">{(minhaAvaliacao!.scores[cat.id] ?? 0)}/10</span>
                  </div>
                  <div className="h-1.5 bg-bdrg rounded overflow-hidden">
                    <div
                      className="h-full rounded bg-gold/70"
                      style={{ width: `${((minhaAvaliacao!.scores[cat.id] ?? 0) / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-bdr">
                <span className="font-mono text-xs text-txt2">NOTA FINAL</span>
                <span
                  className="font-orbitron text-sm font-bold"
                  style={{ color: minhaAvaliacao!.total >= notaMinima ? '#27ae60' : '#b8433a' }}
                >
                  {minhaAvaliacao!.total}/10
                </span>
              </div>
              {minhaAvaliacao?.observacoes && (
                <p className="font-mono text-xs text-txt3 pt-1">{minhaAvaliacao.observacoes}</p>
              )}
            </div>
          </div>
        </GlowCard>
      )}

      {/* Formulário de avaliação */}
      {aberto && !jaAvaliou && (
        <GlowCard>
          <div className="p-5">
            <h3 className="font-orbitron text-xs font-bold text-gold tracking-wider mb-5">AVALIAR CANDIDATO</h3>

            {categorias.length === 0 ? (
              <p className="font-mono text-xs text-txt3 text-center py-4">
                Nenhuma categoria configurada.
              </p>
            ) : (
              <div className="space-y-4">
                {categorias.map(cat => (
                  <div key={cat.id}>
                    <div className="flex justify-between mb-1.5">
                      <label className="font-mono text-xs text-txt2">{cat.nome}</label>
                      <span className="font-orbitron text-xs text-gold">{scores[cat.id] ?? 0}/10</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={scores[cat.id] ?? 0}
                      onChange={e => setScores(prev => ({ ...prev, [cat.id]: parseFloat(e.target.value) }))}
                      className="hud-slider w-full"
                    />
                  </div>
                ))}

                {/* Barra de pontuação */}
                <div className="pt-2">
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-xs text-txt2">PONTUAÇÃO TOTAL</span>
                    <span className="font-orbitron text-lg font-bold" style={{ color: aprovado ? '#27ae60' : '#b8433a' }}>
                      {total}/10
                    </span>
                  </div>
                  <div className="h-2 bg-bdrg rounded overflow-hidden">
                    <motion.div
                      className="h-full rounded"
                      style={{ background: aprovado ? '#27ae60' : '#b8433a' }}
                      animate={{ width: `${(total / 10) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className="font-mono text-[10px] text-txt3">mínimo: {notaMinima}</span>
                  </div>
                </div>

                <motion.div
                  animate={{ scale: [0.97, 1.03, 1] }}
                  transition={{ duration: 0.3 }}
                  key={aprovado ? 'ap' : 'rep'}
                  className={`text-center py-2.5 rounded border font-orbitron text-xs tracking-widest ${
                    aprovado ? 'border-green/50 bg-green/10 text-green' : 'border-red/50 bg-red/10 text-red'
                  }`}
                >
                  {aprovado ? '✓ APROVADO' : '✕ REPROVADO'}
                </motion.div>

                <HudButton
                  onClick={handleAvaliar}
                  loading={avaliar.isPending}
                  disabled={categorias.length === 0}
                  className="w-full justify-center"
                >
                  ENVIAR AVALIAÇÃO
                </HudButton>
              </div>
            )}
          </div>
        </GlowCard>
      )}

      {/* Painel mod: todas as avaliações */}
      {canEdit && recruta.avaliacoes.length > 0 && (
        <GlowCard>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-orbitron text-xs font-bold text-txt2 tracking-wider">
                AVALIAÇÕES ({recruta.avaliacoes.length})
              </h3>
              {mediaGeral !== null && (
                <span className="font-mono text-xs text-txt2">
                  média: <span className="text-gold font-bold">{mediaGeral}/10</span>
                </span>
              )}
            </div>
            <div className="space-y-3">
              {recruta.avaliacoes.map((a: AvaliacaoIndividual) => (
                <div key={a.contaId} className="flex items-center gap-3 p-3 bg-card2 rounded border border-bdr">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-txt">{a.username}</p>
                    <p className="font-mono text-[10px] text-txt3">{formatDate(a.data)}</p>
                    {a.observacoes && (
                      <p className="font-mono text-[10px] text-txt3 mt-0.5 italic">{a.observacoes}</p>
                    )}
                  </div>
                  <span
                    className="font-orbitron text-sm font-bold shrink-0"
                    style={{ color: a.total >= notaMinima ? '#27ae60' : '#b8433a' }}
                  >
                    {a.total}/10
                  </span>
                </div>
              ))}
            </div>
          </div>
        </GlowCard>
      )}
    </div>
  )
}
