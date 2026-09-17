import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, X, Calendar } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts'
import { useAllAcoes } from '@/hooks/useAcoes'
import { useMembros } from '@/hooks/useMembros'
import { useQrus } from '@/hooks/useConfig'
import GlowCard from '@/components/ui/GlowCard'
import HudButton from '@/components/ui/HudButton'
import LoadingHud from '@/components/ui/LoadingHud'
import { calcWinRate } from '@/lib/utils'
import type { Membro, Acao } from '@/types'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const ROW_VARIANTS = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
}
const TABLE_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; fill: string }>; label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-bdr rounded p-2 text-xs font-mono">
      <p className="text-txt2 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

function formatDateBR(d: string) {
  return d.split('-').reverse().join('/')
}

// Strip Portuguese diacritics for jsPDF built-in fonts
function n(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function EstatisticasPage() {
  const { data: acoesData, isLoading: acoesLoading } = useAllAcoes()
  const { data: membros, isLoading: membrosLoading } = useMembros()
  const { data: qrus } = useQrus()

  const [fromDate, setFromDate] = useState('')

  const acoes: Acao[] = useMemo(() => acoesData?.acoes ?? [], [acoesData])

  const filteredAcoes = useMemo(() => {
    if (!fromDate) return acoes
    return acoes.filter(a => a.data >= fromDate)
  }, [acoes, fromDate])

  // Ações por dia da semana
  const weekdayData = useMemo(() => {
    const counts = Array(7).fill(0)
    filteredAcoes.forEach(a => {
      const d = new Date(a.data + 'T12:00:00')
      counts[d.getDay()]++
    })
    return WEEKDAYS.map((day, i) => ({ dia: day, ações: counts[i] }))
  }, [filteredAcoes])

  // Performance por operador
  const operatorData = useMemo(() => {
    if (!membros) return []
    return membros
      .map((m: Membro) => {
        const memAcoes = filteredAcoes.filter(a => a.participants.some(p => p.memberId === m.id))
        return {
          nome: m.policial,
          total: memAcoes.length,
          vitorias: memAcoes.filter(a => a.resultado === 'Vitória').length,
          derrotas: memAcoes.filter(a => a.resultado === 'Derrota').length,
          winRate: calcWinRate(memAcoes),
        }
      })
      .filter(o => o.total > 0)
      .sort((a, b) => b.winRate - a.winRate)
  }, [membros, filteredAcoes])

  // Dados por QRU — unificado para gráfico e tabela
  const qruExtData = useMemo(() => {
    return (qrus ?? []).map(q => {
      const qAcoes = filteredAcoes.filter(a => a.qru === q)
      const total = qAcoes.length
      const vitorias = qAcoes.filter(a => a.resultado === 'Vitória').length
      const derrotas = qAcoes.filter(a => a.resultado === 'Derrota').length
      const empates = qAcoes.filter(a => a.resultado === 'Empate').length
      return {
        qru: q,
        total,
        Vitórias: vitorias,
        Derrotas: derrotas,
        Empates: empates,
        vitorias,
        derrotas,
        empates,
        winRate: total > 0 ? Math.round((vitorias / total) * 100) : 0,
      }
    }).filter(q => q.total > 0)
      .sort((a, b) => b.winRate - a.winRate)
  }, [filteredAcoes, qrus])

  async function generatePdf() {
    // jsPDF (~430 KB) só é baixado quando alguém exporta
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const W = 210, M = 14
    const now = new Date()
    const toDate = now.toISOString().slice(0, 10)

    const totalAll = acoes.length
    const vitAll = acoes.filter(a => a.resultado === 'Vitória').length
    const derAll = acoes.filter(a => a.resultado === 'Derrota').length
    const empAll = acoes.filter(a => a.resultado === 'Empate').length
    const wrAll  = calcWinRate(acoes)
    const ativos = (membros ?? []).filter((m: Membro) => m.status === 'Ativo').length
    const comAdv = (membros ?? []).filter((m: Membro) => m.adv1 || m.adv2 || m.adv3).length

    const total = filteredAcoes.length
    const vitorias = filteredAcoes.filter(a => a.resultado === 'Vitória').length
    const derrotas = filteredAcoes.filter(a => a.resultado === 'Derrota').length
    const empates = filteredAcoes.filter(a => a.resultado === 'Empate').length
    const winRate = total > 0 ? ((vitorias / total) * 100).toFixed(1) : '0.0'
    const periodText = fromDate
      ? `${formatDateBR(fromDate)} a ${formatDateBR(toDate)}`
      : `Todos os registros ate ${formatDateBR(toDate)}`

    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' })

    // ── HELPERS ──────────────────────────────────────────────────────────
    const sectionTitle = (label: string, y: number) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text(label, M, y)
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.line(M, y + 1.5, W - M, y + 1.5)
    }

    // Cabeçalho
    let y = 20
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(40, 40, 40)
    doc.text('FAST — NORTH POLICE DEPARTMENT', W / 2, y, { align: 'center' })
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('Relatorio de Estatisticas', W / 2, y, { align: 'center' })
    y += 5
    doc.setFontSize(7.5)
    doc.text(`Periodo: ${periodText}`, W / 2, y, { align: 'center' })
    y += 4
    doc.text(`Gerado em: ${now.toLocaleString('pt-BR')}`, W / 2, y, { align: 'center' })
    y += 8

    // Resumo geral
    sectionTitle('RESUMO GERAL', y)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [['Total de Acoes', 'Vitorias', 'Derrotas', 'Empates', 'Win Rate', 'Membros Ativos', 'Com Advertencias']],
      body: [[totalAll, vitAll, derAll, empAll, `${wrAll}%`, ativos, comAdv]],
      headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, halign: 'center' },
      theme: 'grid',
      margin: { left: M, right: M },
    })
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8

    // Performance por operador
    sectionTitle('PERFORMANCE POR OPERADOR', y)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [['#', 'Operador', 'Total', 'Vitorias', 'Derrotas', 'Win Rate']],
      body: operatorData.length > 0
        ? operatorData.map((op, i) => [`${i + 1}`, n(op.nome), op.total, op.vitorias, op.derrotas, `${op.winRate}%`])
        : [['—', 'Sem dados no periodo selecionado', '', '', '', '']],
      headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 24, halign: 'center' },
      },
      theme: 'grid',
      margin: { left: M, right: M },
    })
    y = ((doc as any).lastAutoTable?.finalY ?? y + 50) + 8

    // Resultados por QRU
    if (y > 250) { doc.addPage(); y = 20 }
    sectionTitle('RESULTADOS POR QRU', y)
    y += 6
    autoTable(doc, {
      startY: y,
      head: [['QRU', 'Total', 'Vitorias', 'Derrotas', 'Empates', 'Win Rate']],
      body: qruExtData.length > 0
        ? qruExtData.map(q => [n(q.qru), q.total, q.vitorias, q.derrotas, q.empates, `${q.winRate}%`])
        : [['Sem dados no periodo selecionado', '', '', '', '', '']],
      headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 24, halign: 'center' },
      },
      theme: 'grid',
      margin: { left: M, right: M },
    })

    // Rodapé
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text(`FAST — NPD — ${now.toLocaleDateString('pt-BR')} — Pagina ${i} de ${pageCount}`, W / 2, 290, { align: 'center' })
    }

    doc.save(`estatisticas-tatica-${toDate}.pdf`)
  }

  if (acoesLoading || membrosLoading) return <LoadingHud />

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Filtros e exportação */}
      <GlowCard>
        <div className="p-4 flex items-center gap-4 flex-wrap">
          <Calendar size={15} className="text-gold shrink-0" />
          <label className="font-mono text-xs text-txt2 tracking-wider">A PARTIR DE:</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="input-gold bg-card2 border border-bdr2 rounded px-3 py-1.5 text-sm font-mono text-txt"
          />
          {fromDate && (
            <button
              onClick={() => setFromDate('')}
              className="text-txt3 hover:text-txt transition-colors"
              title="Limpar filtro"
            >
              <X size={14} />
            </button>
          )}
          <span className="font-mono text-xs text-txt2 ml-auto">
            {filteredAcoes.length}
            {filteredAcoes.length !== acoes.length ? ` / ${acoes.length} ações` : ' ações'}
          </span>
          <HudButton variant="ghost" size="sm" onClick={() => { void generatePdf() }}>
            <Download size={14} className="inline mr-1.5" />
            Baixar PDF
          </HudButton>
        </div>
      </GlowCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Ações por dia da semana */}
        <GlowCard>
          <div className="p-4">
            <h3 className="font-orbitron text-xs text-txt2 tracking-wider mb-4">AÇÕES POR DIA DA SEMANA</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekdayData}>
                <XAxis dataKey="dia" tick={{ fill: '#787878', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                <YAxis tick={{ fill: '#787878', fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ações" radius={[3, 3, 0, 0]}>
                  {weekdayData.map((_, i) => (
                    <Cell key={i} fill={i === 0 || i === 6 ? '#2980b9' : '#3a72c4'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>

        {/* Resultados por QRU — gráfico empilhado */}
        <GlowCard>
          <div className="p-4">
            <h3 className="font-orbitron text-xs text-txt2 tracking-wider mb-4">RESULTADOS POR QRU</h3>
            {qruExtData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={qruExtData}>
                  <XAxis dataKey="qru" tick={{ fill: '#787878', fontSize: 10, fontFamily: 'Share Tech Mono' }} />
                  <YAxis tick={{ fill: '#787878', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={v => <span className="font-mono text-[10px] text-txt2">{v}</span>} />
                  <Bar dataKey="Vitórias" stackId="a" fill="#27ae60" />
                  <Bar dataKey="Derrotas" stackId="a" fill="#b8433a" />
                  <Bar dataKey="Empates" stackId="a" fill="#2980b9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <p className="font-mono text-xs text-txt3">Sem dados</p>
              </div>
            )}
          </div>
        </GlowCard>
      </div>

      {/* Tabela de performance por operador */}
      <GlowCard>
        <div className="p-4">
          <h3 className="font-orbitron text-xs text-txt2 tracking-wider mb-4">PERFORMANCE POR OPERADOR</h3>
          {operatorData.length === 0 ? (
            <p className="font-mono text-xs text-txt3 text-center py-8">Sem dados suficientes</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-bdr">
                  {['Operador', 'Total', 'Vitórias', 'Derrotas', 'Win Rate'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-txt3 tracking-wider px-4 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={TABLE_VARIANTS} initial="hidden" animate="visible">
                {operatorData.map(op => (
                  <motion.tr
                    key={op.nome}
                    variants={ROW_VARIANTS}
                    className="border-b border-bdr/50 hover:bg-bdr/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-txt">{op.nome}</td>
                    <td className="px-4 py-3 font-mono text-xs text-txt2">{op.total}</td>
                    <td className="px-4 py-3 font-mono text-xs text-green">{op.vitorias}</td>
                    <td className="px-4 py-3 font-mono text-xs text-red">{op.derrotas}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded bg-bdrg overflow-hidden">
                          {/* scaleX (GPU) no lugar de animar width (layout) */}
                          <motion.div
                            className="h-full rounded bg-gold origin-left"
                            style={{ width: `${op.winRate}%` }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.7 }}
                          />
                        </div>
                        <span className="font-orbitron text-xs text-gold w-10 text-right">{op.winRate}%</span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
            </div>
          )}
        </div>
      </GlowCard>

      {/* Tabela de estatísticas por QRU */}
      <GlowCard>
        <div className="p-4">
          <h3 className="font-orbitron text-xs text-txt2 tracking-wider mb-4">ESTATÍSTICAS POR QRU</h3>
          {qruExtData.length === 0 ? (
            <p className="font-mono text-xs text-txt3 text-center py-8">Sem dados suficientes</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-bdr">
                  {['QRU', 'Total', 'Vitórias', 'Derrotas', 'Part.', 'Win Rate'].map(h => (
                    <th key={h} className="text-left font-mono text-xs text-txt3 tracking-wider px-4 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={TABLE_VARIANTS} initial="hidden" animate="visible">
                {qruExtData.map((q, idx) => (
                  <motion.tr
                    key={q.qru}
                    variants={ROW_VARIANTS}
                    className="border-b border-bdr/50 hover:bg-bdr/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-txt font-bold">{q.qru}</td>
                    <td className="px-4 py-3 font-mono text-xs text-txt2">{q.total}</td>
                    <td className="px-4 py-3 font-mono text-xs text-green">{q.vitorias}</td>
                    <td className="px-4 py-3 font-mono text-xs text-red">{q.derrotas}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue">{q.empates}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-bdrg overflow-hidden">
                          <motion.div
                            className="h-full flex origin-left"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.7, delay: idx * 0.04 }}
                          >
                            <div className="h-full" style={{ background: '#27ae60', width: `${q.total > 0 ? (q.vitorias / q.total) * 100 : 0}%` }} />
                            <div className="h-full" style={{ background: '#b8433a', width: `${q.total > 0 ? (q.derrotas / q.total) * 100 : 0}%` }} />
                          </motion.div>
                        </div>
                        <span className="font-orbitron text-xs text-gold w-10 text-right">{q.winRate}%</span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  )
}
