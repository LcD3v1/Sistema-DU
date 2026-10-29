import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, ChevronRight, Users, Lock, Unlock } from 'lucide-react'
import { useRecrutos, useCreateRecruta, useDeleteRecruta } from '@/hooks/useRecrutos'
import { useAuthStore } from '@/store/authStore'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import LoadingHud from '@/components/ui/LoadingHud'
import { formatDate } from '@/lib/utils'
import type { Recruta } from '@/types'
import { confirmar } from '@/lib/dialogo'

export default function RecrutamentoPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { canEdit: can } = usePerms()
  const { addToast } = useUIStore()
  const { data: recrutas, isLoading } = useRecrutos()
  const createRecruta = useCreateRecruta()
  const deleteRecruta = useDeleteRecruta()

  const [showModal, setShowModal] = useState(false)
  const [nome, setNome] = useState('')
  const [data, setData] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))
  const [observacoes, setObservacoes] = useState('')

  const canEdit = can('recrutamento')

  async function handleCreate() {
    if (!nome.trim()) return
    try {
      await createRecruta.mutateAsync({ nome: nome.trim(), data, observacoes: observacoes.trim() || undefined })
      addToast('success', 'Candidato registrado!')
      setShowModal(false)
      setNome('')
      setObservacoes('')
      setData(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))
    } catch {
      addToast('error', 'Erro ao registrar candidato.')
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!(await confirmar({ titulo: 'Remover candidato', mensagem: 'Remover este candidato e todas as avaliações?', tom: 'perigo', textoConfirmar: 'Remover' }))) return
    try {
      await deleteRecruta.mutateAsync(id)
      addToast('success', 'Candidato removido.')
    } catch {
      addToast('error', 'Erro ao remover.')
    }
  }

  const mediaAvaliações = (r: Recruta) => {
    if (r.avaliacoes.length === 0) return null
    return parseFloat((r.avaliacoes.reduce((s, a) => s + a.total, 0) / r.avaliacoes.length).toFixed(1))
  }

  if (isLoading) return <LoadingHud />

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-orbitron text-sm font-bold text-gold tracking-wider">RECRUTAMENTO</h2>
        {canEdit && (
          <HudButton size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} className="inline mr-1.5" />
            NOVO CANDIDATO
          </HudButton>
        )}
      </div>

      {/* Lista */}
      <GlowCard>
        <div className="divide-y divide-bdr">
          {(recrutas ?? []).length === 0 ? (
            <p className="text-center font-mono text-xs text-txt3 py-12">Nenhum candidato registrado</p>
          ) : (
            <AnimatePresence>
              {(recrutas ?? []).map((r: Recruta) => {
                const media = mediaAvaliações(r)
                const jaAvaliou = r.avaliacoes.some(a => a.contaId === user?.contaId)
                return (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => navigate(`/recrutamento/${r.id}`)}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-bdr/40 cursor-pointer transition-colors group"
                  >
                    {/* Status icon */}
                    <div className={`shrink-0 ${r.status === 'aberto' ? 'text-gold' : 'text-txt3'}`}>
                      {r.status === 'aberto' ? <Unlock size={16} /> : <Lock size={16} />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-sm text-txt font-semibold truncate">{r.nome}</span>
                        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${
                          r.status === 'aberto'
                            ? 'text-gold border-gold/40 bg-gold/10'
                            : 'text-txt3 border-bdr2 bg-bdr'
                        }`}>
                          {r.status === 'aberto' ? 'ABERTO' : 'FECHADO'}
                        </span>
                        {r.status === 'aberto' && jaAvaliou && (
                          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border text-green border-green/40 bg-green/10 tracking-widest">
                            AVALIADO
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-txt3">{formatDate(r.data)}</span>
                        <span className="flex items-center gap-1 font-mono text-[10px] text-txt3">
                          <Users size={10} />
                          {r.avaliacoes.length} avaliação{r.avaliacoes.length !== 1 ? 'ões' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Resultado / Média */}
                    <div className="text-right shrink-0">
                      {r.status === 'fechado' && r.resultado && (
                        <span
                          className="font-orbitron text-xs font-bold"
                          style={{ color: r.resultado === 'Aprovado' ? '#27ae60' : '#b8433a' }}
                        >
                          {r.resultado === 'Aprovado' ? '✓ APROVADO' : '✕ REPROVADO'}
                        </span>
                      )}
                      {media !== null && (
                        <p className="font-mono text-[10px] text-txt3">{r.status === 'aberto' ? `média atual: ${media}` : `média: ${media}`}</p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canEdit && (
                        <button
                          onClick={(e) => handleDelete(r.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <ChevronRight size={14} className="text-txt3 group-hover:text-txt transition-colors" />
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </GlowCard>

      {/* Modal novo candidato */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-bdr rounded-lg p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="font-orbitron text-xs font-bold text-gold tracking-wider mb-4">NOVO CANDIDATO</h3>
              <div className="space-y-3">
                <div>
                  <label className="font-mono text-xs text-txt2 block mb-1">NOME</label>
                  <input
                    autoFocus
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                    className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
                    placeholder="Nome do candidato"
                  />
                </div>
                <div>
                  <label className="font-mono text-xs text-txt2 block mb-1">DATA</label>
                  <input
                    type="date"
                    value={data}
                    onChange={e => setData(e.target.value)}
                    className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt"
                  />
                </div>
                <div>
                  <label className="font-mono text-xs text-txt2 block mb-1">OBSERVAÇÕES</label>
                  <textarea
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                    rows={2}
                    className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm font-mono text-txt resize-none"
                    placeholder="Opcional..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 border border-bdr2 rounded font-mono text-xs text-txt3 hover:text-txt transition-colors"
                >
                  CANCELAR
                </button>
                <HudButton
                  onClick={handleCreate}
                  loading={createRecruta.isPending}
                  disabled={!nome.trim()}
                  className="flex-1 justify-center"
                >
                  REGISTRAR
                </HudButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
