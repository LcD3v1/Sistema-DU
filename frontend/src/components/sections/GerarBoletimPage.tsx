import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ClipboardCheck, Eraser, Info, FileSearch } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAllAcoes } from '@/hooks/useAcoes'
import Brand from '@/components/ui/Brand'

const SLASHES = '/'.repeat(120)
const DASHES = '-'.repeat(90)
// Cabeçalho/rodapé alinhados à direita (mesmo visual do modelo enviado)
const LARGURA = 100
const alinharDir = (s: string) => ' '.repeat(Math.max(0, LARGURA - s.length)) + s

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function GerarBoletimPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const [params] = useSearchParams()
  const { data: acoesData } = useAllAcoes()

  const [bo, setBo] = useState('')
  const boCarregado = useRef<number | null>(null)

  const [oficial, setOficial] = useState('')
  const [relato, setRelato] = useState('')
  const [objetos, setObjetos] = useState('N/A')
  const [veiculos, setVeiculos] = useState('N/A')
  const [observacoes, setObservacoes] = useState('N/A')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [assinatura, setAssinatura] = useState('')

  const oficialTxt = oficial.trim() || 'Ofc. Peter Wolf 216F'
  const relatoTxt = relato.trim() || 'Descreva aqui o relato da ocorrência...'
  const assinaturaTxt = assinatura.trim() || 'Officer Wolf'

  function carregarBO(idRaw: string) {
    const id = parseInt(idRaw.replace(/\D/g, ''), 10)
    if (!id) { addToast('error', 'Informe um Nº de BO válido.'); return }
    const acao = acoesData?.acoes.find(a => a.id === id)
    if (!acao) { addToast('error', `BO Nº ${id} não encontrado.`); return }
    const dataBR = acao.data.split('-').reverse().join('/')
    setData(acao.data)
    setRelato(`Ocorrência de ${acao.qru}${acao.local ? ` na região de ${acao.local}` : ''} registrada em ${dataBR}. `)
    setObjetos('Em anexo')
    setObservacoes(acao.imagem || 'N/A')
    boCarregado.current = id
    addToast('success', `BO Nº ${id} carregado — QRU: ${acao.qru}.`)
  }

  useEffect(() => {
    const q = params.get('bo')
    if (q && acoesData && boCarregado.current === null) { setBo(q); carregarBO(q) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acoesData, params])

  const textoCopia = useMemo(() => {
    return [
      alinharDir('⚡'),
      '',
      alinharDir('North Police Department'),
      '',
      alinharDir(oficialTxt),
      '',
      SLASHES,
      '',
      '',
      `📝 Relato da ocorrência: ${relato.trim()}`,
      `📦 Objetos apreendidos: ${objetos.trim() || 'N/A'}`,
      `🚗 Veiculos apreendidos: ${veiculos.trim() || 'N/A'}`,
      `📝 Observações: ${observacoes.trim() || 'N/A'}`,
      '',
      DASHES,
      '',
      alinharDir(`${fmtDate(data)} - North Police Department`),
      alinharDir(`Atenciosamente, ${assinaturaTxt}.`),
    ].join('\n')
  }, [oficialTxt, relato, objetos, veiculos, observacoes, data, assinaturaTxt])

  function limpar() {
    setOficial(''); setRelato(''); setObjetos('N/A'); setVeiculos('N/A'); setObservacoes('N/A')
    setData(new Date().toISOString().slice(0, 10)); setAssinatura('')
    addToast('success', 'Formulário limpo.')
  }
  async function copiar(msg: string) {
    try { await navigator.clipboard.writeText(textoCopia); addToast('success', msg) }
    catch { addToast('error', 'Não foi possível copiar. Copie manualmente.') }
  }

  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Ferramenta interna</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt">Gerar boletim</h1>
          <p className="text-sm text-txt2 mt-1">Monte o boletim de ocorrência, confira a prévia e copie tudo de uma vez.</p>
        </div>
        <div className="flex items-center gap-2 text-txt2">
          <Brand size={30} />
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase">FAST / Boletim</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* ── Formulário ─────────────────────────────────────── */}
        <div className="bg-card border border-bdr rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-txt">Conteúdo do boletim</h2>
            <button onClick={limpar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-bdrg transition-colors">
              <Eraser size={13} /> Limpar
            </button>
          </div>
          <p className="text-xs text-txt3 mb-5">Preencha os dados da ocorrência.</p>

          <div className="space-y-4">
            {/* Carregar por Nº do BO */}
            <div className="rounded-lg border border-gold/25 bg-gold/4 p-3">
              <label className="font-mono text-[11px] text-gold3 tracking-wider mb-1.5 flex items-center gap-1.5"><FileSearch size={12} /> CARREGAR POR Nº DO BO</label>
              <div className="flex gap-2">
                <input value={bo} onChange={e => setBo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') carregarBO(bo) }}
                  placeholder="Ex: 1" className={inputCls} />
                <button type="button" onClick={() => carregarBO(bo)}
                  className="shrink-0 flex items-center gap-1.5 px-4 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors">
                  <FileSearch size={15} /> Carregar
                </button>
              </div>
              <p className="font-mono text-[10px] text-txt3 mt-1.5">Puxa automaticamente a QRU e o local da apreensão cadastrada.</p>
            </div>

            <div>
              <label className={labelCls}>Oficial responsável *</label>
              <input value={oficial} onChange={e => setOficial(e.target.value)} placeholder="Ofc. Peter Wolf 216F" className={inputCls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-mono text-[11px] text-txt2 tracking-wider">Relato da ocorrência *</label>
                <span className={`font-mono text-[10px] ${relato.length > 4000 ? 'text-red' : 'text-txt3'}`}>{relato.length}/4000</span>
              </div>
              <textarea value={relato} onChange={e => setRelato(e.target.value)} rows={7} maxLength={4000}
                placeholder="Descreva o que aconteceu na ocorrência..." className={`${inputCls} resize-none leading-relaxed`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Objetos apreendidos</label>
                <input value={objetos} onChange={e => setObjetos(e.target.value)} placeholder="N/A" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Veículos apreendidos</label>
                <input value={veiculos} onChange={e => setVeiculos(e.target.value)} placeholder="N/A" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Observações</label>
              <input value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="N/A" className={inputCls} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data *</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Assinatura final *</label>
                <input value={assinatura} onChange={e => setAssinatura(e.target.value)} placeholder="Officer Wolf" className={inputCls} />
              </div>
            </div>

            <div className="pt-2">
              <button onClick={() => copiar('Boletim copiado! Cole onde precisar.')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gold text-white text-sm font-semibold hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(58,114,196,0.7)]">
                <ClipboardCheck size={16} /> Copiar boletim
              </button>
              <p className="text-center font-mono text-[10px] text-txt3 mt-2">O texto vai para a área de transferência, pronto para colar.</p>
            </div>
          </div>
        </div>

        {/* ── Prévia ─────────────────────────────────────────── */}
        <div className="bg-card border border-bdr rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-txt">Prévia</h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-txt3 tracking-wider uppercase"><Info size={12} /> Atualização automática</span>
          </div>

          <div className="rounded-xl border border-gold/25 bg-[#0b0b0b] p-6">
            {/* Cabeçalho */}
            <div className="flex flex-col items-center gap-1.5 mb-3">
              <Brand size={64} />
              <p className="font-semibold italic underline decoration-gold3/60 text-gold3 text-sm mt-1">North Police Department</p>
              <p className="italic text-txt2 text-xs">{oficialTxt}</p>
            </div>

            {/* Divisória de barras */}
            <div className="text-gold/60 text-[11px] leading-none tracking-tighter overflow-hidden whitespace-nowrap select-none mb-4">{SLASHES}</div>

            {/* Relato */}
            <p className="text-[13px] text-txt leading-relaxed text-justify mb-4">
              <span className="text-red mr-1">📝</span>
              <span className="italic font-semibold text-gold3">Relato da ocorrência: </span>
              {relatoTxt}
            </p>

            {/* Itens */}
            <div className="space-y-1.5 text-[13px] mb-4">
              <p className="border-l-2 border-gold/50 pl-2 text-txt"><span className="mr-1">📦</span><span className="text-gold3 font-medium">Objetos apreendidos:</span> {objetos.trim() || 'N/A'}</p>
              <p className="border-l-2 border-red/50 pl-2 text-txt"><span className="mr-1">🚗</span><span className="text-red font-medium">Veiculos apreendidos:</span> {veiculos.trim() || 'N/A'}</p>
              <p className="border-l-2 border-blue/50 pl-2 text-txt"><span className="mr-1">📝</span><span className="text-blue font-medium">Observações:</span> {observacoes.trim() || 'N/A'}</p>
            </div>

            {/* Divisória tracejada */}
            <div className="text-txt3 text-xs leading-none overflow-hidden whitespace-nowrap select-none mb-3">{DASHES}</div>

            {/* Rodapé */}
            <div className="text-center">
              <p className="text-gold3 font-bold text-sm">{fmtDate(data)} - North Police Department</p>
              <p className="text-txt2 text-sm">Atenciosamente, {assinaturaTxt}.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
