import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronsUp, ChevronsDown, Settings2, UserX, AlertTriangle, Trash2 } from 'lucide-react'
import { useHierarquia, usePromover, useAdvertir, useRemoverAdvertencias, useExonerar } from '@/hooks/useMembros'
import { usePerms } from '@/hooks/usePerms'
import { useAlternarAdv } from '@/hooks/useAlternarAdv'
import { useUIStore } from '@/store/uiStore'
import ModalOverlay from '@/components/ui/ModalOverlay'
import HudButton from '@/components/ui/HudButton'
import AdvBox from '@/components/ui/AdvBox'
import type { Membro } from '@/types'
import { confirmar } from '@/lib/dialogo'
import { nomeComDiscord } from '@/lib/discordDisplay'

type Acao = 'promocao' | 'gerenciar' | 'exonerar'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data?.details?.join(' | ')
  ?? (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  ?? padrao

const temAdv = (m: Membro) => m.adv1 || m.adv2 || m.adv3
const primeiroLivre = (m: Membro) => (([1, 2, 3] as const).find(n => !m[`adv${n}`]) ?? 1)
const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const nomePessoa = (m: Membro) => nomeComDiscord(m)

/**
 * Nome do membro clicável: abre um menu lateral com Promoção, Gerenciar e
 * Exonerar (cada item só aparece para quem tem permissão).
 */
export function MembroNomeMenu({ membro, children }: { membro: Membro; children: React.ReactNode }) {
  const { canEdit } = usePerms()
  const [aberto, setAberto] = useState(false)
  const [acao, setAcao] = useState<Acao | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  const itens: { id: Acao; label: string; icon: typeof ChevronsUp; cls: string; pode: boolean }[] = [
    { id: 'promocao',  label: 'Promoção',  icon: ChevronsUp, cls: 'text-green hover:bg-green/10', pode: canEdit('promocoes') },
    { id: 'gerenciar', label: 'Gerenciar', icon: Settings2,  cls: 'text-gold3 hover:bg-gold/10',  pode: canEdit('membros') },
    { id: 'exonerar',  label: 'Exonerar',  icon: UserX,      cls: 'text-red hover:bg-red/10',     pode: canEdit('membros') },
  ]
  const visiveis = itens.filter(i => i.pode)

  if (visiveis.length === 0) return <>{children}</>

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="font-mono text-xs text-txt hover:text-gold transition-colors text-left underline-offset-2 hover:underline"
      >
        {children}
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 w-40 bg-card border border-bdr rounded-lg shadow-2xl p-1"
          >
            {visiveis.map(i => {
              const Icon = i.icon
              return (
                <button
                  key={i.id}
                  onClick={() => { setAcao(i.id); setAberto(false) }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${i.cls}`}
                >
                  <Icon size={14} /> {i.label}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {createPortal(
        <>
          <PromocaoModal membro={membro} open={acao === 'promocao'} onClose={() => setAcao(null)} />
          <GerenciarModal membro={membro} open={acao === 'gerenciar'} onClose={() => setAcao(null)} />
          <ExonerarModal membro={membro} open={acao === 'exonerar'} onClose={() => setAcao(null)} />
        </>,
        document.body,
      )}
    </div>
  )
}

interface ModalProps { membro: Membro; open: boolean; onClose: () => void }

/** Promoção / rebaixamento pela hierarquia de cargos. */
export function PromocaoModal({ membro, open, onClose }: ModalProps) {
  const { data: hierarquia = [] } = useHierarquia(open)
  const promover = usePromover()
  const { addToast } = useUIStore()
  const [cargoId, setCargoId] = useState<number | ''>('')
  const [motivo, setMotivo] = useState('')

  const atual = hierarquia.find(c => c.id === membro.cargoPermId) ?? hierarquia.find(c => c.nome === membro.patenteInterna)
  const destino = hierarquia.find(c => c.id === cargoId)
  const tipo = destino && (!atual || destino.posicao < atual.posicao) ? 'promocao' : destino ? 'rebaixamento' : null

  function fechar() { setCargoId(''); setMotivo(''); onClose() }
  function enviar() {
    if (cargoId === '') return
    promover.mutate({ id: membro.id, cargoPermId: cargoId, motivo: motivo.trim() }, {
      onSuccess: r => {
        addToast('success', `${nomePessoa(membro)} ${r.data.tipo === 'promocao' ? 'promovido' : 'rebaixado'} para ${r.data.para}.`)
        fechar()
      },
      onError: e => addToast('error', erroApi(e, 'Erro ao alterar o cargo.')),
    })
  }

  return (
    <ModalOverlay open={open} onClose={fechar} title="PROMOÇÃO / REBAIXAMENTO">
      <div className="space-y-4">
        <div className="px-3 py-2.5 rounded-lg bg-card2 border border-bdr">
          <p className="text-sm text-txt font-medium">{nomePessoa(membro)}</p>
          <p className="text-[11px] text-txt3 font-mono">Cargo atual: <span className="text-gold3">{atual?.nome ?? membro.cargoNome ?? 'Sem cargo'}</span></p>
          {!membro.contaId && <p className="text-[11px] text-txt3 mt-1">Sem conta vinculada — o cargo é registrado, mas não há acesso ao painel para atualizar.</p>}
        </div>

        <div>
          <label className="font-mono text-xs text-txt2 block mb-1.5">NOVO CARGO <span className="text-txt3">(ordem da hierarquia)</span></label>
          <div className="max-h-56 overflow-y-auto border border-bdr rounded-lg divide-y divide-bdr/60">
            {hierarquia.map(c => {
              const ehAtual = c.id === atual?.id
              const sobe = !atual || c.posicao < atual.posicao
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={ehAtual}
                  onClick={() => setCargoId(c.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    cargoId === c.id ? 'bg-gold/15 text-txt' : ehAtual ? 'opacity-50 cursor-default' : 'hover:bg-bdr/40 text-txt2'
                  }`}
                >
                  <span className="font-mono text-[10px] text-txt3 w-5">{c.posicao + 1}º</span>
                  <span className="flex-1">{c.nome}</span>
                  {ehAtual
                    ? <span className="text-[10px] font-mono text-txt3">atual</span>
                    : sobe ? <ChevronsUp size={14} className="text-green" /> : <ChevronsDown size={14} className="text-orange-400" />}
                </button>
              )
            })}
            {hierarquia.length === 0 && <p className="px-3 py-4 text-xs text-txt3 text-center">Nenhum cargo criado em Configurações → Permissões.</p>}
          </div>
        </div>

        {tipo && (
          <p className={`text-xs font-mono ${tipo === 'promocao' ? 'text-green' : 'text-orange-400'}`}>
            {tipo === 'promocao' ? '▲ Promoção' : '▼ Rebaixamento'}: {atual?.nome ?? 'Sem cargo'} → {destino?.nome}
          </p>
        )}

        <div>
          <label className="font-mono text-xs text-txt2 block mb-1.5">MOTIVO <span className="text-txt3">(opcional)</span></label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} maxLength={500}
            className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm text-txt resize-none" />
        </div>

        <div className="flex gap-3">
          <HudButton onClick={enviar} loading={promover.isPending} disabled={cargoId === ''} className="flex-1">
            {tipo === 'rebaixamento' ? 'REBAIXAR' : 'PROMOVER'}
          </HudButton>
          <HudButton variant="ghost" onClick={fechar} className="flex-1">CANCELAR</HudButton>
        </div>
      </div>
    </ModalOverlay>
  )
}

/** Gerenciar: advertências (ADV 1, 2 e 3 independentes, com motivo) e histórico. */
export function GerenciarModal({ membro, open, onClose }: ModalProps) {
  const advertir = useAdvertir()
  const remover = useRemoverAdvertencias()
  const { addToast } = useUIStore()
  const { alternar, ocupado } = useAlternarAdv()
  const [nivel, setNivel] = useState<1 | 2 | 3>(primeiroLivre(membro))
  const [motivo, setMotivo] = useState('')

  function fechar() { setMotivo(''); onClose() }
  function enviar() {
    if (motivo.trim().length < 3) { addToast('error', 'Descreva o motivo da advertência.'); return }
    advertir.mutate({ id: membro.id, nivel, motivo: motivo.trim() }, {
      onSuccess: () => { addToast('success', `ADV ${nivel} aplicada a ${nomePessoa(membro)}.`); setMotivo('') },
      onError: e => addToast('error', erroApi(e, 'Erro ao aplicar advertência.')),
    })
  }

  const historico = [...(membro.advertencias ?? [])].reverse()

  return (
    <ModalOverlay open={open} onClose={fechar} title="GERENCIAR MEMBRO" maxWidth="max-w-xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-card2 border border-bdr">
          <div>
            <p className="text-sm text-txt font-medium">{nomePessoa(membro)}</p>
            <p className="text-[11px] text-txt3 font-mono">{membro.cargoNome ?? membro.patenteInterna ?? '—'}</p>
          </div>
          <div className="flex items-center gap-1">
            {([1, 2, 3] as const).map(n => (
              <AdvBox key={n} active={membro[`adv${n}`]} index={n} readonly={ocupado}
                onClick={() => void alternar(membro, n)} />
            ))}
          </div>
        </div>
        <p className="text-[11px] text-txt3 -mt-3">Clique num quadradinho para aplicar ou retirar só aquele ADV. O cargo no Discord acompanha.</p>

        <div className="space-y-3">
          <h4 className="font-mono text-xs text-gold tracking-wider flex items-center gap-1.5"><AlertTriangle size={13} /> APLICAR ADVERTÊNCIA</h4>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map(n => (
              <button key={n} type="button" onClick={() => setNivel(n)} disabled={membro[`adv${n}`]}
                title={membro[`adv${n}`] ? `Já está com ADV ${n}` : undefined}
                className={`py-2 rounded-lg border text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  nivel === n
                    ? n === 1 ? 'border-gold3 bg-gold3/20 text-gold3' : n === 2 ? 'border-orange-400 bg-orange-400/20 text-orange-400' : 'border-red bg-red/20 text-red'
                    : 'border-bdr2 text-txt2 hover:text-txt'
                }`}>
                ADV {n}{membro[`adv${n}`] ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
            placeholder="Motivo da advertência (obrigatório)"
            className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm text-txt resize-none" />
          <HudButton onClick={enviar} loading={advertir.isPending} disabled={membro[`adv${nivel}`]} className="w-full">APLICAR ADV {nivel}</HudButton>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-mono text-xs text-txt2 tracking-wider">HISTÓRICO</h4>
            {temAdv(membro) && (
              <button
                disabled={remover.isPending}
                onClick={async () => {
                  if (!(await confirmar({ titulo: 'Retirar advertências', mensagem: `Retirar as advertências de ${nomePessoa(membro)}? O histórico é mantido.`, tom: 'aviso', textoConfirmar: 'Retirar' }))) return
                  remover.mutate(membro.id, {
                    onSuccess: () => addToast('success', 'Advertências retiradas.'),
                    onError: e => addToast('error', erroApi(e, 'Erro ao retirar advertências.')),
                  })
                }}
                className="flex items-center gap-1 text-[11px] font-mono text-txt3 hover:text-red transition-colors">
                <Trash2 size={12} /> Retirar todas
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {historico.length === 0 && <p className="text-xs text-txt3 text-center py-3">Nenhuma advertência registrada.</p>}
            {historico.map((a, i) => (
              <div key={i} className="px-3 py-2 rounded-lg bg-card2 border border-bdr">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={a.removida ? 'text-txt3' : a.nivel === 1 ? 'text-gold3' : a.nivel === 2 ? 'text-orange-400' : 'text-red'}>
                    {a.removida ? `ADV ${a.nivel} retirada` : `ADV ${a.nivel}`}
                  </span>
                  <span className="text-txt3">{fmtData(a.data)} · {a.autor}</span>
                </div>
                {!a.removida && <p className="text-xs text-txt mt-1">{a.motivo}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

/** Exoneração com motivo obrigatório. */
export function ExonerarModal({ membro, open, onClose }: ModalProps) {
  const exonerar = useExonerar()
  const { addToast } = useUIStore()
  const [motivo, setMotivo] = useState('')

  function fechar() { setMotivo(''); onClose() }
  function enviar() {
    if (motivo.trim().length < 3) { addToast('error', 'Informe o motivo da exoneração.'); return }
    exonerar.mutate({ id: membro.id, motivo: motivo.trim() }, {
      onSuccess: () => { addToast('success', `${nomePessoa(membro)} foi exonerado.`); fechar() },
      onError: e => addToast('error', erroApi(e, 'Erro ao exonerar.')),
    })
  }

  return (
    <ModalOverlay open={open} onClose={fechar} title="EXONERAR MEMBRO">
      <div className="space-y-4">
        <div className="flex gap-3 px-3 py-3 rounded-lg border border-red/40 bg-red/10">
          <UserX size={18} className="text-red shrink-0 mt-0.5" />
          <p className="text-xs text-txt2 leading-relaxed">
            <span className="text-txt font-medium">{nomePessoa(membro)}</span> será removido do efetivo e <span className="text-red">perderá todo o acesso ao painel</span>.
            A exoneração é registrada no canal dele no Discord (❌). Ao tentar entrar, verá o aviso para procurar o Alto Comando.
          </p>
        </div>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
          placeholder="Motivo da exoneração (obrigatório)"
          className="input-gold w-full bg-card2 border border-bdr2 rounded px-3 py-2 text-sm text-txt resize-none" />
        <div className="flex gap-3">
          <button onClick={enviar} disabled={exonerar.isPending}
            className="flex-1 py-2.5 rounded-lg bg-red/20 border border-red/50 text-red text-sm font-mono hover:bg-red/30 transition-colors disabled:opacity-50">
            {exonerar.isPending ? 'EXONERANDO...' : 'CONFIRMAR EXONERAÇÃO'}
          </button>
          <HudButton variant="ghost" onClick={fechar} className="flex-1">CANCELAR</HudButton>
        </div>
      </div>
    </ModalOverlay>
  )
}
