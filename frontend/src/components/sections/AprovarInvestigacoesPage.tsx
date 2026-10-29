import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, CheckCircle2, XCircle, CalendarDays, Target, MapPin, AtSign, FileText, Search, Hourglass, Lock } from 'lucide-react'
import {
  useAprovacoesInvestigacao, useAprovacaoInvestigacao,
  MOTIVO_INVESTIGACAO, LOCAL_INVESTIGACAO, APROVACAO_INVESTIGACAO, ANDAMENTO_INVESTIGACAO, quandoInvestigacao, dataHoraBR,
  type RegistroInvestigacao,
} from '@/hooks/useRegistrosInvestigacao'
import { erroApi, normalizar } from '@/hooks/useInvestigacao'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import { confirmar } from '@/lib/dialogo'
import { CabecalhoPagina, BotaoPrimario, BotaoSecundario, Selo, Vazio, Secao } from '@/components/investigacao/Campos'

/**
 * Aprovar investigações — só para quem pode aprovar (investigacoes_gestao/editar).
 * Autorizar já coloca a investigação "em andamento" e cria a árvore de investigação
 * privada do responsável e dos participantes (feito no backend).
 */

const EASE = [0.16, 1, 0.3, 1] as const

function Pedido({ r, i, decidindo, onAutorizar, onNegar }: {
  r: RegistroInvestigacao; i: number; decidindo: boolean; onAutorizar: () => void; onNegar: () => void
}) {
  const ap = APROVACAO_INVESTIGACAO[r.aprovacao]
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: EASE }}
      className="rounded-xl border border-bdr bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-txt wrap-break-word">{r.nome}</p>
          <p className="text-xs text-txt3">Responsável: <span className="text-txt2">{r.autorNome}</span> · pedido em {dataHoraBR(r.criadoEm)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end">
          <Selo cor={ap.cor}>{ap.rotulo}</Selo>
          {r.aprovacao === 'autorizada' && <Selo cor={ANDAMENTO_INVESTIGACAO[r.andamento].cor}>{ANDAMENTO_INVESTIGACAO[r.andamento].rotulo}</Selo>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt2">
        <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-gold2" /> {quandoInvestigacao(r)}</span>
        <span className="inline-flex items-center gap-1"><Target size={12} className="text-gold2" /> {MOTIVO_INVESTIGACAO[r.motivo]}</span>
        <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gold2" /> {LOCAL_INVESTIGACAO[r.local]}</span>
      </div>
      <Secao titulo={`Participantes (${r.participantes.length})`} icone={AtSign}>
        <div className="flex flex-wrap gap-1.5">
          {r.participantes.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-bdr2 bg-card2 px-2.5 py-0.5 text-xs">
              <span className="text-gold3">@{p.codinome}</span><span className="font-mono text-txt3">ID {p.passaporte || '—'}</span>
            </span>
          ))}
        </div>
      </Secao>
      {r.detalhes && (
        <Secao titulo="Detalhes" icone={FileText}>
          <p className="text-sm text-txt2 whitespace-pre-line wrap-break-word">{r.detalhes}</p>
        </Secao>
      )}
      {r.aprovacao === 'pendente' ? (
        <div className="flex gap-2 pt-2 border-t border-bdr">
          <BotaoPrimario onClick={onAutorizar} disabled={decidindo} className="flex-1"><CheckCircle2 size={14} /> Autorizar</BotaoPrimario>
          <BotaoSecundario onClick={onNegar} disabled={decidindo} className="hover:text-red!"><XCircle size={14} /> Negar</BotaoSecundario>
        </div>
      ) : (
        <p className="text-xs text-txt2 pt-2 border-t border-bdr">
          {ap.rotulo} por <strong className="text-txt font-medium">{r.decididoPor}</strong>{r.decididoEm ? ` em ${dataHoraBR(r.decididoEm)}` : ''}
          {r.observacao ? ` · ${r.observacao}` : ''}
        </p>
      )}
    </motion.div>
  )
}

export default function AprovarInvestigacoesPage() {
  const { canEdit } = usePerms()
  const podeAprovar = canEdit('investigacoes_gestao')
  const { data: registros, isLoading, isError } = useAprovacoesInvestigacao(podeAprovar)
  const aprovar = useAprovacaoInvestigacao()
  const { addToast } = useUIStore()
  const [aba, setAba] = useState<'pendentes' | 'decididas'>('pendentes')
  const [busca, setBusca] = useState('')

  const pendentes = useMemo(() => (registros ?? []).filter(r => r.aprovacao === 'pendente'), [registros])
  const lista = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean)
    return (registros ?? [])
      .filter(r => (aba === 'pendentes') === (r.aprovacao === 'pendente'))
      .filter(r => {
        if (termos.length === 0) return true
        const texto = normalizar(`${r.nome} ${r.autorNome} ${r.detalhes} ${r.participantes.map(p => `${p.codinome} ${p.passaporte}`).join(' ')}`)
        return termos.every(t => texto.includes(t))
      })
  }, [registros, aba, busca])

  async function autorizar(r: RegistroInvestigacao) {
    if (!(await confirmar({
      titulo: 'Autorizar investigação', tom: 'sucesso', textoConfirmar: 'Autorizar',
      mensagem: `"${r.nome}" já fica em andamento e a árvore de investigação é criada para o responsável e os participantes.`,
    }))) return
    aprovar.mutate({ id: r.id, aprovacao: 'autorizada' }, {
      onSuccess: () => addToast('success', 'Investigação autorizada — em andamento e com árvore criada.'),
      onError: e => addToast('error', erroApi(e)),
    })
  }
  async function negar(r: RegistroInvestigacao) {
    const res = await confirmar({ titulo: 'Negar investigação', tom: 'perigo', textoConfirmar: 'Negar', mensagem: `Negar "${r.nome}"?`, motivo: 'opcional', rotuloMotivo: 'Motivo (opcional)' })
    if (!res) return
    aprovar.mutate({ id: r.id, aprovacao: 'negada', observacao: res.motivo }, {
      onSuccess: () => addToast('success', 'Investigação negada.'),
      onError: e => addToast('error', erroApi(e)),
    })
  }

  if (!podeAprovar) {
    return (
      <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
        <Vazio icone={Lock}>Só quem pode aprovar investigações acessa esta página.</Vazio>
      </div>
    )
  }
  if (isLoading) return <LoadingHud />

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      <CabecalhoPagina sobretitulo="Investigação" titulo="Aprovar investigações" icone={ShieldCheck}
        descricao="Autorize ou negue os pedidos. Ao autorizar, a investigação já começa e a árvore de investigação é criada para os envolvidos." />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-5">
        <div className="flex gap-1.5">
          {(['pendentes', 'decididas'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} aria-pressed={aba === a}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${aba === a ? 'bg-gold/15 text-gold3 border border-gold/40' : 'text-txt2 border border-bdr2 hover:text-txt'}`}>
              {a === 'pendentes' ? `Pendentes (${pendentes.length})` : 'Já avaliadas'}
            </button>
          ))}
        </div>
        <div className="relative sm:w-80 sm:ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, responsável, participante…" aria-label="Buscar pedidos"
            className="input-gold w-full bg-card border border-bdr2 rounded-lg pl-9 pr-3 py-2 text-sm text-txt" />
        </div>
      </div>

      {isError ? (
        <div className="border border-bdr rounded-xl bg-card py-16 text-center text-sm text-red">Não foi possível carregar os pedidos.</div>
      ) : lista.length === 0 ? (
        <Vazio icone={aba === 'pendentes' ? Hourglass : Search}>{aba === 'pendentes' ? 'Nenhum pedido aguardando aprovação.' : 'Nenhum pedido avaliado.'}</Vazio>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {lista.map((r, i) => (
            <Pedido key={r.id} r={r} i={i} decidindo={aprovar.isPending} onAutorizar={() => autorizar(r)} onNegar={() => negar(r)} />
          ))}
        </div>
      )}
    </div>
  )
}
