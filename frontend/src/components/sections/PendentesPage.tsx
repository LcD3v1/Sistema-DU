import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, ClipboardList, Inbox, Scale, ShieldAlert, UserCog, UserPlus, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import BannerModulo from '@/components/ui/BannerModulo'
import LoadingHud from '@/components/ui/LoadingHud'
import AprovacoesPerfil from '@/components/sections/AprovacoesPerfil'
import PedidosAcesso from '@/components/sections/PedidosAcesso'
import { usePendentes } from '@/hooks/usePendentes'
import { usePerms } from '@/hooks/usePerms'
import { useCargosPermissao } from '@/hooks/useCargosPermissao'
import { useAprovarAusencia, useRecusarAusencia, type Ausencia } from '@/hooks/useAusencias'
import { useUIStore } from '@/store/uiStore'
import { decidir } from '@/lib/dialogo'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao
const dataBR = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'
const diasDe = (a: Ausencia) => Math.round((Date.parse(`${a.dataFim}T12:00:00`) - Date.parse(`${a.dataInicio}T12:00:00`)) / 86_400_000) + 1

/** Bloco de uma categoria de pedidos: título, contador e o conteúdo (ou "nada pendente"). */
function Categoria({ id, icone: Icone, titulo, descricao, total, children }: {
  id: string; icone: LucideIcon; titulo: string; descricao: string; total: number; children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0"><Icone size={17} className="text-gold3" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-txt flex items-center gap-2">
            {titulo}
            <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${total ? 'bg-red/90 text-white' : 'bg-white/5 text-txt3'}`}>{total}</span>
          </h2>
          <p className="text-xs text-txt3">{descricao}</p>
        </div>
      </div>
      {total === 0
        ? <p className="flex items-center gap-2 text-sm text-txt3 bg-card border border-bdr rounded-xl px-4 py-4"><CheckCircle2 size={15} className="text-green" /> Nada esperando aprovação.</p>
        : children}
    </section>
  )
}

function ListaAusencias({ lista }: { lista: Ausencia[] }) {
  const aprovar = useAprovarAusencia()
  const recusar = useRecusarAusencia()
  const { addToast } = useUIStore()
  async function analisar(a: Ausencia) {
    const r = await decidir({
      titulo: 'Solicitação de ausência',
      mensagem: 'Ao aprovar, o membro fica sem acesso ao painel durante o período.',
      detalhes: [
        { label: 'Membro', valor: a.nome },
        { label: 'Período', valor: `${dataBR(a.dataInicio)} → ${dataBR(a.dataFim)} (${diasDe(a)} dia${diasDe(a) > 1 ? 's' : ''})` },
        { label: 'Motivo', valor: a.motivo || 'não informado' },
        { label: 'Pedido por', valor: a.solicitadoPor ?? '—' },
      ],
    })
    if (r?.decisao === 'aprovar') aprovar.mutate(a.id, { onSuccess: () => addToast('success', `Ausência de ${a.nome} aprovada.`), onError: e => addToast('error', erroApi(e, 'Erro ao aprovar.')) })
    else if (r?.decisao === 'reprovar') recusar.mutate({ id: a.id, motivo: r.motivo || undefined }, { onSuccess: () => addToast('success', 'Ausência reprovada.'), onError: e => addToast('error', erroApi(e, 'Erro ao reprovar.')) })
  }
  return (
    <div className="bg-card border border-bdr rounded-xl divide-y divide-bdr/60">
      {lista.map(a => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-45">
            <p className="text-sm text-txt font-medium">{a.nome}</p>
            <p className="text-[11px] font-mono text-txt3">{dataBR(a.dataInicio)} → {dataBR(a.dataFim)} · {diasDe(a)} dia{diasDe(a) > 1 ? 's' : ''}{a.solicitadoPor ? ` · pedido por ${a.solicitadoPor}` : ''}</p>
            {a.motivo && <p className="text-xs text-txt2 mt-1 line-clamp-2">{a.motivo}</p>}
          </div>
          <button type="button" disabled={aprovar.isPending || recusar.isPending} onClick={() => analisar(a)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/40 text-gold3 text-xs font-medium hover:bg-gold/25 disabled:opacity-50">
            <Scale size={13} /> Analisar
          </button>
        </div>
      ))}
    </div>
  )
}

export default function PendentesPage() {
  const { listas, total, podeAprovar, carregando } = usePendentes()
  const { admin, dev } = usePerms()
  const { data: cargosTodos = [] } = useCargosPermissao(admin)
  // Cargo de dev só aparece (e só é atribuível) para um dev — igual a Configurações
  const cargos = cargosTodos.filter(c => dev || c.dev !== true)
  const cargoPadraoId = cargos.find(c => c.padrao)?.id

  if (carregando) return <LoadingHud />

  const resumo: { id: string; icone: LucideIcon; rotulo: string; n: number | null }[] = [
    { id: 'perfil', icone: UserCog, rotulo: 'Perfis', n: listas.perfil?.length ?? null },
    { id: 'acesso', icone: UserPlus, rotulo: 'Acesso e set', n: listas.acesso?.length ?? null },
    { id: 'ausencias', icone: CalendarDays, rotulo: 'Ausências', n: listas.ausencias?.length ?? null },
    { id: 'investigacoes', icone: ClipboardList, rotulo: 'Investigações', n: listas.investigacoes?.length ?? null },
  ].filter(r => r.n !== null)

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      <BannerModulo sobretitulo="Central de aprovações" icone={Inbox} titulo="Pendentes"
        subtitulo={total ? `${total} pedido${total > 1 ? 's' : ''} esperando a sua aprovação` : 'Nada esperando a sua aprovação'} />

      {!podeAprovar ? (
        <div className="bg-card border border-bdr rounded-2xl p-10 text-center">
          <ShieldAlert size={30} className="text-txt3 mx-auto mb-3" />
          <p className="text-sm text-txt2">Você não aprova nenhum tipo de pedido. Os seus pedidos aparecem no seu perfil e nas notificações.</p>
        </div>
      ) : (
        <>
          {/* Resumo: um cartão por tipo, com atalho para a lista */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {resumo.map((r, i) => (
              <motion.a key={r.id} href={`#${r.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`rounded-xl border p-4 transition-colors ${r.n ? 'border-red/40 bg-red/5 hover:border-red/60' : 'border-bdr bg-card hover:border-bdrg'}`}>
                <r.icone size={16} className={r.n ? 'text-red' : 'text-txt3'} />
                <p className="text-3xl font-bold text-txt mt-2 leading-none">{r.n}</p>
                <p className="font-mono text-[11px] text-txt2 tracking-wider uppercase mt-1.5">{r.rotulo}</p>
              </motion.a>
            ))}
          </div>

          <div className="space-y-10">
            {listas.perfil && (
              <Categoria id="perfil" icone={UserCog} titulo="Alterações de perfil" total={listas.perfil.length}
                descricao="Nada muda no perfil até você aprovar. Ao aprovar, patente, setor e apelido também mudam no Discord.">
                <AprovacoesPerfil />
              </Categoria>
            )}
            {listas.acesso && (
              <Categoria id="acesso" icone={UserPlus} titulo="Pedidos de acesso e de set" total={listas.acesso.length}
                descricao="Primeiro login pelo Discord e pedidos de set. Ao aprovar, a conta é criada.">
                <div className="bg-card border border-bdr rounded-xl p-4"><PedidosAcesso cargos={cargos} cargoPadraoId={cargoPadraoId} /></div>
              </Categoria>
            )}
            {listas.ausencias && (
              <Categoria id="ausencias" icone={CalendarDays} titulo="Ausências" total={listas.ausencias.length}
                descricao="Aprovada, o membro fica sem acesso ao painel durante o período.">
                <ListaAusencias lista={listas.ausencias} />
              </Categoria>
            )}
            {listas.investigacoes && (
              <Categoria id="investigacoes" icone={ClipboardList} titulo="Pedidos de investigação" total={listas.investigacoes.length}
                descricao="Autorize ou negue na tela de aprovação de investigações, com todos os detalhes do pedido.">
                <div className="bg-card border border-bdr rounded-xl divide-y divide-bdr/60">
                  {listas.investigacoes.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-45">
                        <p className="text-sm text-txt font-medium">{r.nome}</p>
                        <p className="text-[11px] font-mono text-txt3">{dataBR(r.data)}{r.hora ? ` às ${r.hora}` : ''} · responsável {r.autorNome} · {r.participantes.length} participante(s)</p>
                      </div>
                      <Link to="/investigacoes/aprovacoes" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/40 text-gold3 text-xs font-medium hover:bg-gold/25">
                        Analisar <ArrowRight size={13} />
                      </Link>
                    </div>
                  ))}
                </div>
              </Categoria>
            )}
          </div>
        </>
      )}
    </div>
  )
}
