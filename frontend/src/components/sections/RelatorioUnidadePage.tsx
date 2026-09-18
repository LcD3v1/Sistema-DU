import { useMemo, useState } from 'react'
import { Calendar, Download, FileText, Trophy, Users, ShieldCheck } from 'lucide-react'
import { useAllAcoes } from '@/hooks/useAcoes'
import { useMembros } from '@/hooks/useMembros'
import { useUIStore } from '@/store/uiStore'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import Brand from '@/components/ui/Brand'
import LoadingHud from '@/components/ui/LoadingHud'
import type { Acao, Membro } from '@/types'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Remove acentos para as fontes embutidas do jsPDF
function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function mesAtual() {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}
function rotuloMes(mes: string) {
  const [ano, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? '—'} de ${ano}`
}
function dataBR(d: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—'
}
function nomeMembro(m: Membro) {
  return m.nomeServidor?.trim() || m.policial?.trim() || m.discordUsername?.trim() || `#${m.id}`
}

export default function RelatorioUnidadePage() {
  const { data: acoesData, isLoading: carregandoAcoes } = useAllAcoes()
  const { data: membros, isLoading: carregandoMembros } = useMembros()
  const { addToast } = useUIStore()
  const [mes, setMes] = useState(mesAtual())
  const [gerando, setGerando] = useState(false)

  const acoes: Acao[] = useMemo(() => acoesData?.acoes ?? [], [acoesData])

  // Apreensões aprovadas dentro do mês selecionado
  const acoesMes = useMemo(
    () => acoes.filter(a => a.status !== 'pendente' && a.data?.startsWith(mes)),
    [acoes, mes],
  )

  const totais = useMemo(() => {
    const total = acoesMes.length
    const fechadas = acoesMes.filter(a => a.tipo === 'fechado' || a.resultado)
    const vitorias = fechadas.filter(a => a.resultado === 'Vitória').length
    const derrotas = fechadas.filter(a => a.resultado === 'Derrota').length
    const empates = fechadas.filter(a => a.resultado === 'Empate').length
    const winRate = fechadas.length ? Math.round((vitorias / fechadas.length) * 100) : 0
    return { total, fechadas: fechadas.length, vitorias, derrotas, empates, winRate }
  }, [acoesMes])

  // Desempenho por membro (só quem participou de alguma apreensão no mês)
  const porMembro = useMemo(() => {
    if (!membros) return []
    return membros
      .map(m => {
        const suas = acoesMes.filter(a => a.participants?.some(p => p.memberId === m.id))
        const vitorias = suas.filter(a => a.resultado === 'Vitória').length
        const derrotas = suas.filter(a => a.resultado === 'Derrota').length
        const fechadas = suas.filter(a => a.tipo === 'fechado' || a.resultado).length
        return {
          id: m.id,
          nome: nomeMembro(m),
          patente: m.patenteNPD || '—',
          total: suas.length,
          vitorias,
          derrotas,
          winRate: fechadas ? Math.round((vitorias / fechadas) * 100) : 0,
        }
      })
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total || b.winRate - a.winRate)
  }, [membros, acoesMes])

  // Assuntos (QRUs) tratados no mês
  const porQru = useMemo(() => {
    const mapa = new Map<string, { total: number; vitorias: number; derrotas: number }>()
    for (const a of acoesMes) {
      const chave = a.qru?.trim() || 'Sem QRU'
      const at = mapa.get(chave) ?? { total: 0, vitorias: 0, derrotas: 0 }
      at.total++
      if (a.resultado === 'Vitória') at.vitorias++
      if (a.resultado === 'Derrota') at.derrotas++
      mapa.set(chave, at)
    }
    return [...mapa.entries()]
      .map(([qru, v]) => ({ qru, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [acoesMes])

  // Promovidos no mês (data de promoção dentro do mês)
  const promovidos = useMemo(
    () => (membros ?? [])
      .filter(m => m.promocao?.startsWith(mes))
      .map(m => ({ id: m.id, nome: nomeMembro(m), patente: m.patenteNPD || '—', data: m.promocao }))
      .sort((a, b) => (a.data < b.data ? -1 : 1)),
    [membros, mes],
  )

  const ativos = useMemo(() => (membros ?? []).filter(m => m.status === 'Ativo').length, [membros])

  async function gerarPdf() {
    try {
      setGerando(true)
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const W = 210, M = 14
      const now = new Date()
      const doc = new jsPDF({ orientation: 'portrait', format: 'a4' })

      const tituloSecao = (label: string, y: number) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(80, 80, 80)
        doc.text(semAcento(label), M, y)
        doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3)
        doc.line(M, y + 1.5, W - M, y + 1.5)
      }
      const proxY = (fallback: number) => ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback)

      // Cabeçalho
      let y = 20
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(40, 40, 40)
      doc.text('FAST - NORTH POLICE DEPARTMENT', W / 2, y, { align: 'center' })
      y += 7
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 100)
      doc.text('Relatorio Mensal da Unidade', W / 2, y, { align: 'center' })
      y += 5
      doc.setFontSize(8)
      doc.text(`Referencia: ${semAcento(rotuloMes(mes))}`, W / 2, y, { align: 'center' })
      y += 4
      doc.text(`Gerado em: ${now.toLocaleString('pt-BR')}`, W / 2, y, { align: 'center' })
      y += 9

      // Resumo geral
      tituloSecao('RESUMO GERAL', y); y += 6
      autoTable(doc, {
        startY: y,
        head: [['Apreensoes', 'Acoes fechadas', 'Vitorias', 'Derrotas', 'Win Rate', 'Membros ativos', 'Promovidos']],
        body: [[totais.total, totais.fechadas, totais.vitorias, totais.derrotas, `${totais.winRate}%`, ativos, promovidos.length]],
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, halign: 'center' },
        theme: 'grid', margin: { left: M, right: M },
      })
      y = proxY(y + 20) + 8

      // Desempenho por membro
      tituloSecao('APREENSOES POR MEMBRO', y); y += 6
      autoTable(doc, {
        startY: y,
        head: [['#', 'Membro', 'Patente', 'Apreensoes', 'Vitorias', 'Derrotas', 'Win Rate']],
        body: porMembro.length
          ? porMembro.map((x, i) => [`${i + 1}`, semAcento(x.nome), semAcento(x.patente), x.total, x.vitorias, x.derrotas, `${x.winRate}%`])
          : [['—', 'Nenhuma apreensao registrada no mes', '', '', '', '', '']],
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' } },
        theme: 'grid', margin: { left: M, right: M },
      })
      y = proxY(y + 40) + 8

      // Assuntos (QRU)
      if (y > 250) { doc.addPage(); y = 20 }
      tituloSecao('ASSUNTOS TRATADOS (QRU)', y); y += 6
      autoTable(doc, {
        startY: y,
        head: [['QRU', 'Total', 'Vitorias', 'Derrotas']],
        body: porQru.length
          ? porQru.map(q => [semAcento(q.qru), q.total, q.vitorias, q.derrotas])
          : [['Nenhum assunto no mes', '', '', '']],
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: { 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 26, halign: 'center' }, 3: { cellWidth: 26, halign: 'center' } },
        theme: 'grid', margin: { left: M, right: M },
      })
      y = proxY(y + 30) + 8

      // Promoções
      if (y > 250) { doc.addPage(); y = 20 }
      tituloSecao('PROMOCOES NO MES', y); y += 6
      autoTable(doc, {
        startY: y,
        head: [['Membro', 'Nova patente', 'Data']],
        body: promovidos.length
          ? promovidos.map(p => [semAcento(p.nome), semAcento(p.patente), dataBR(p.data)])
          : [['Nenhuma promocao registrada no mes', '', '']],
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        theme: 'grid', margin: { left: M, right: M },
      })

      // Rodapé
      const paginas = doc.getNumberOfPages()
      for (let i = 1; i <= paginas; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
        doc.text(`FAST - NPD - Relatorio ${semAcento(rotuloMes(mes))} - Pagina ${i} de ${paginas}`, W / 2, 290, { align: 'center' })
      }

      doc.save(`relatorio-fast-${mes}.pdf`)
      addToast('success', 'Relatório gerado! Envie o PDF ao Comando.')
    } catch {
      addToast('error', 'Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  if (carregandoAcoes || carregandoMembros) return <LoadingHud />

  const semDados = acoesMes.length === 0 && promovidos.length === 0

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Comando</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt">Relatório da unidade</h1>
          <p className="text-sm text-txt2 mt-1">Consolidado mensal da FAST para envio ao Comando.</p>
        </div>
        <div className="flex items-center gap-2 text-txt2">
          <Brand size={30} />
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase">FAST / Relatório</span>
        </div>
      </div>

      {/* Barra: mês + download */}
      <GlowCard>
        <div className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4 flex-wrap">
          <Calendar size={15} className="text-gold shrink-0" />
          <label className="font-mono text-xs text-txt2 tracking-wider">MÊS DE REFERÊNCIA</label>
          <input
            type="month"
            value={mes}
            max={mesAtual()}
            onChange={e => setMes(e.target.value || mesAtual())}
            className="input-gold bg-card2 border border-bdr2 rounded-lg px-3 py-1.5 text-sm font-mono text-txt"
          />
          <span className="font-mono text-xs text-txt3 hidden sm:inline">{rotuloMes(mes)}</span>
          <span className="font-mono text-xs text-txt2 ml-auto">{acoesMes.length} apreensões no mês</span>
          <HudButton variant="ghost" size="sm" onClick={() => { void gerarPdf() }} disabled={gerando}>
            <Download size={14} className="inline mr-1.5" />
            {gerando ? 'Gerando…' : 'Baixar relatório (PDF)'}
          </HudButton>
        </div>
      </GlowCard>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: FileText, label: 'Apreensões', valor: totais.total, sub: `${totais.fechadas} ações fechadas` },
          { icon: Trophy, label: 'Win rate', valor: `${totais.winRate}%`, sub: `${totais.vitorias}V · ${totais.derrotas}D` },
          { icon: Users, label: 'Membros ativos', valor: ativos, sub: 'no efetivo' },
          { icon: ShieldCheck, label: 'Promovidos', valor: promovidos.length, sub: 'neste mês' },
        ].map(kpi => (
          <GlowCard key={kpi.label}>
            <div className="p-5">
              <div className="flex items-center gap-2 text-txt2 mb-3">
                <kpi.icon size={15} className="text-gold3" />
                <span className="font-mono text-[10px] tracking-wider uppercase">{kpi.label}</span>
              </div>
              <p className="text-3xl font-bold text-txt leading-none">{kpi.valor}</p>
              <p className="text-[11px] text-txt3 mt-2">{kpi.sub}</p>
            </div>
          </GlowCard>
        ))}
      </div>

      {semDados && (
        <GlowCard>
          <div className="p-10 text-center">
            <FileText size={28} className="text-txt3 mx-auto mb-3" />
            <p className="text-sm text-txt2">Nenhuma apreensão ou promoção registrada em {rotuloMes(mes)}.</p>
            <p className="text-xs text-txt3 mt-1">Escolha outro mês de referência acima.</p>
          </div>
        </GlowCard>
      )}

      {/* Desempenho por membro */}
      {porMembro.length > 0 && (
        <GlowCard>
          <div className="p-5">
            <h2 className="text-base font-semibold text-txt mb-4">Apreensões por membro</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-bdr">
                    {['#', 'Membro', 'Patente', 'Apreensões', 'Vitórias', 'Derrotas', 'Win rate'].map(h => (
                      <th key={h} className="text-left font-mono text-xs text-txt3 tracking-wider px-3 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porMembro.map((x, i) => (
                    <tr key={x.id} className="border-b border-bdr/50 hover:bg-bdr/30 transition-colors">
                      <td className="px-3 py-3 font-mono text-xs text-txt3">{i + 1}</td>
                      <td className="px-3 py-3 text-txt">{x.nome}</td>
                      <td className="px-3 py-3 font-mono text-xs text-txt2">{x.patente}</td>
                      <td className="px-3 py-3 font-mono text-xs text-gold3 font-semibold">{x.total}</td>
                      <td className="px-3 py-3 font-mono text-xs text-green">{x.vitorias}</td>
                      <td className="px-3 py-3 font-mono text-xs text-red">{x.derrotas}</td>
                      <td className="px-3 py-3 font-mono text-xs text-txt">{x.winRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </GlowCard>
      )}

      {/* Assuntos e promoções lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {porQru.length > 0 && (
          <GlowCard>
            <div className="p-5">
              <h2 className="text-base font-semibold text-txt mb-4">Assuntos tratados (QRU)</h2>
              <div className="space-y-2">
                {porQru.map(q => (
                  <div key={q.qru} className="flex items-center justify-between gap-3 rounded-lg border border-bdr2 bg-card2 px-3 py-2.5">
                    <span className="text-sm text-txt truncate">{q.qru}</span>
                    <span className="font-mono text-xs text-txt2 shrink-0">
                      <span className="text-gold3 font-semibold">{q.total}</span>
                      {(q.vitorias > 0 || q.derrotas > 0) && <span className="text-txt3"> · {q.vitorias}V/{q.derrotas}D</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </GlowCard>
        )}

        {promovidos.length > 0 && (
          <GlowCard>
            <div className="p-5">
              <h2 className="text-base font-semibold text-txt mb-4">Promoções no mês</h2>
              <div className="space-y-2">
                {promovidos.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-txt truncate">{p.nome}</p>
                      <p className="font-mono text-[10px] text-gold3">{p.patente}</p>
                    </div>
                    <span className="font-mono text-xs text-txt3 shrink-0">{dataBR(p.data)}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlowCard>
        )}
      </div>
    </div>
  )
}
