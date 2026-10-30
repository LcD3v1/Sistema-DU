import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ChevronLeft, Plus, Minus, Maximize2, Download, MessageSquare, FileText, Trash2, Undo2, GitBranch, Lock,
} from 'lucide-react'
import {
  useArvore, useCriarNo, useAtualizarNo, useCriarLigacao, useAtualizarLigacao, useRemoverLigacao,
  type Lado, type NoArvore, type LigacaoArvore, type DadosNo,
} from '@/hooks/useArvores'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import FotoArvore from '@/components/arvore/FotoArvore'
import EditorCard from '@/components/arvore/EditorCard'
import PainelArvore from '@/components/arvore/PainelArvore'
import { baixarArvoreComoImagem } from '@/components/arvore/exportarImagem'
import {
  CARD_W, CARD_H, LADOS, OPOSTO, CORES_LINHA, pontoDoLado, ladoMaisProximo, curvaDaLinha, caminhoSvg,
  resolverCurvas, pontoNaCurva, tMaisProximo,
  posicaoAoLado, limites, type Ponto, type Posicao,
} from '@/components/arvore/geometria'

type Erro = { response?: { data?: { error?: string } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao
const ZOOM_MIN = 0.25, ZOOM_MAX = 2.5
const vazio: DadosNo = { x: 0, y: 0, nome: '', apelido: '', telefone: '', funcao: '', faccao: '', endereco: '', veiculo: '', observacoes: '', status: '' }

type Gesto =
  | { tipo: 'pan'; sx: number; sy: number; px: number; py: number }
  | { tipo: 'card'; id: number; sx: number; sy: number; ox: number; oy: number; moveu: boolean }
  | { tipo: 'linha'; origem: Origem }
  | { tipo: 'segurarLinha'; lig: number; sx: number; sy: number }   // apertou na linha: clique seleciona, arrastar puxa linha nova
  | { tipo: 'curva'; id: number; base: Ponto }

/** De onde sai uma linha nova: lado de um card OU um ponto (t) de outra linha. */
type Origem = { no: number; lado: Lado } | { lig: number; t: number }

/** Posição do "+" e do ponto de ligação em cada lado do card (fora / na borda). */
const ESTILO_LADO: Record<Lado, string> = {
  cima: 'left-1/2 -translate-x-1/2', baixo: 'left-1/2 -translate-x-1/2', esquerda: 'top-1/2 -translate-y-1/2', direita: 'top-1/2 -translate-y-1/2',
}
const PONTO_LADO: Record<Lado, string> = { cima: '-top-1.5', baixo: '-bottom-1.5', esquerda: '-left-1.5', direita: '-right-1.5' }
const MAIS_LADO: Record<Lado, string> = { cima: '-top-11', baixo: '-bottom-11', esquerda: '-left-11', direita: '-right-11' }

export default function ArvoreQuadroPage() {
  const id = Number(useParams().id)
  const { addToast } = useUIStore()
  const [arrastando, setArrastando] = useState(false)
  const { data: arvore, isLoading, isError } = useArvore(id, arrastando)
  const criarNo = useCriarNo(id)
  const atualizarNo = useAtualizarNo(id)
  const criarLigacao = useCriarLigacao(id)
  const atualizarLigacao = useAtualizarLigacao(id)
  const removerLigacao = useRemoverLigacao(id)

  const viewport = useRef<HTMLDivElement>(null)
  const gesto = useRef<Gesto | null>(null)
  const [pan, setPan] = useState({ x: 80, y: 80 })
  const [zoom, setZoom] = useState(1)
  const [mov, setMov] = useState<{ id: number; x: number; y: number } | null>(null)
  const [linhaTemp, setLinhaTemp] = useState<{ origem: Origem; ponta: Ponto } | null>(null)
  const [curvaTemp, setCurvaTemp] = useState<{ id: number; dx: number; dy: number } | null>(null)
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [editor, setEditor] = useState<number | null>(null)
  const [painel, setPainel] = useState<'dados' | 'chat' | null>(null)
  const [rotulo, setRotulo] = useState('')
  const [exportando, setExportando] = useState(false)
  const podeEditar = Boolean(arvore?.podeEditar)

  const posicoes = useMemo(() => {
    const m = new Map<number, Posicao>((arvore?.nos ?? []).map(n => [n.id, { x: n.x, y: n.y }]))
    if (mov) m.set(mov.id, { x: mov.x, y: mov.y })
    return m
  }, [arvore?.nos, mov])
  const ligacoes = useMemo(() => (arvore?.ligacoes ?? []).map(l => (curvaTemp?.id === l.id ? { ...l, curva: { dx: curvaTemp.dx, dy: curvaTemp.dy } } : l)), [arvore?.ligacoes, curvaTemp])
  /** Curva de cada linha (inclusive as que saem do meio de outra linha). */
  const curvas = useMemo(() => resolverCurvas(ligacoes, posicoes), [ligacoes, posicoes])

  /** Coordenada da tela → coordenada do quadro (desfaz pan e zoom). */
  const paraMundo = useCallback((cx: number, cy: number): Ponto => {
    const r = viewport.current!.getBoundingClientRect()
    return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom }
  }, [pan, zoom])

  const enquadrar = useCallback(() => {
    const el = viewport.current
    const caixa = limites(arvore?.nos ?? [])
    if (!el || !caixa) { setPan({ x: 80, y: 80 }); setZoom(1); return }
    const r = el.getBoundingClientRect()
    const z = Math.min(1.2, Math.max(ZOOM_MIN, Math.min((r.width - 160) / caixa.w, (r.height - 160) / caixa.h)))
    setZoom(z)
    setPan({ x: (r.width - caixa.w * z) / 2 - caixa.x * z, y: (r.height - caixa.h * z) / 2 - caixa.y * z })
  }, [arvore?.nos])

  // Enquadra uma vez ao abrir a árvore
  const enquadrou = useRef<number | null>(null)
  useEffect(() => {
    if (arvore && enquadrou.current !== arvore.id) { enquadrou.current = arvore.id; enquadrar() }
  }, [arvore, enquadrar])

  // Zoom com a roda do mouse, centrado no cursor (listener não-passivo para impedir a rolagem da página)
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const aoRodar = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      setZoom(z => {
        const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
        setPan(p => ({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) }))
        return nz
      })
    }
    el.addEventListener('wheel', aoRodar, { passive: false })
    return () => el.removeEventListener('wheel', aoRodar)
  }, [arvore?.id])

  // Teclado: Delete apaga a linha selecionada; Esc solta tudo
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === 'Escape') { setSelecionada(null); setLinhaTemp(null) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecionada && podeEditar) {
        removerLigacao.mutate(selecionada, { onError: er => addToast('error', erroApi(er, 'Não foi possível apagar a linha.')) })
        setSelecionada(null)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [selecionada, podeEditar, removerLigacao, addToast])

  if (isLoading) return <LoadingHud />
  if (isError || !arvore) return (
    <div className="p-6 text-sm text-txt2">Árvore não encontrada. <Link to="/arvores" className="text-gold3 underline">Voltar às árvores</Link></div>
  )

  const capturar = (e: React.PointerEvent) => viewport.current?.setPointerCapture(e.pointerId)

  function aoApertarFundo(e: React.PointerEvent) {
    if (e.button !== 0) return
    gesto.current = { tipo: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
    setSelecionada(null)
    capturar(e)
  }
  function aoApertarCard(e: React.PointerEvent, n: NoArvore) {
    if (e.button !== 0) return
    e.stopPropagation()
    gesto.current = { tipo: 'card', id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moveu: false }
    capturar(e)
  }
  function aoApertarPonto(e: React.PointerEvent, n: NoArvore, lado: Lado) {
    e.stopPropagation()
    if (!podeEditar) return
    gesto.current = { tipo: 'linha', origem: { no: n.id, lado } }
    setLinhaTemp({ origem: { no: n.id, lado }, ponta: paraMundo(e.clientX, e.clientY) })
    capturar(e)
  }
  /** Apertar na linha: clique seleciona (cor/rótulo); segurar e arrastar puxa uma linha nova daquele ponto. */
  function aoApertarLinha(e: React.PointerEvent, l: LigacaoArvore) {
    e.stopPropagation()
    setSelecionada(l.id); setRotulo(l.rotulo)
    if (!podeEditar || e.button !== 0) return
    gesto.current = { tipo: 'segurarLinha', lig: l.id, sx: e.clientX, sy: e.clientY }
    capturar(e)
  }
  function aoApertarCurva(e: React.PointerEvent, l: LigacaoArvore) {
    e.stopPropagation()
    const c = curvas.get(l.id)
    if (!c || !podeEditar) return
    gesto.current = { tipo: 'curva', id: l.id, base: c.meioBase }
    setArrastando(true)
    capturar(e)
  }

  function aoMover(e: React.PointerEvent) {
    const g = gesto.current
    if (!g) return
    if (g.tipo === 'pan') setPan({ x: g.px + e.clientX - g.sx, y: g.py + e.clientY - g.sy })
    else if (g.tipo === 'card') {
      const dx = (e.clientX - g.sx) / zoom, dy = (e.clientY - g.sy) / zoom
      if (!g.moveu && Math.hypot(dx, dy) < 4) return
      if (!podeEditar) return
      if (!g.moveu) { g.moveu = true; setArrastando(true) }
      setMov({ id: g.id, x: Math.round(g.ox + dx), y: Math.round(g.oy + dy) })
    } else if (g.tipo === 'segurarLinha') {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return
      const c = curvas.get(g.lig)
      if (!c) return
      const origem = { lig: g.lig, t: tMaisProximo(c, paraMundo(g.sx, g.sy)) }
      gesto.current = { tipo: 'linha', origem }
      setSelecionada(null)
      setLinhaTemp({ origem, ponta: paraMundo(e.clientX, e.clientY) })
    } else if (g.tipo === 'linha') setLinhaTemp(t => (t ? { ...t, ponta: paraMundo(e.clientX, e.clientY) } : t))
    else if (g.tipo === 'curva') {
      const p = paraMundo(e.clientX, e.clientY)
      setCurvaTemp({ id: g.id, dx: Math.round(((p.x - g.base.x) * 4) / 3), dy: Math.round(((p.y - g.base.y) * 4) / 3) })
    }
  }

  function aoSoltar(e: React.PointerEvent) {
    const g = gesto.current
    gesto.current = null
    if (!g) return
    if (g.tipo === 'card') {
      if (!g.moveu) { setEditor(g.id); setPainel(null); return }   // clique = abrir os dados da pessoa
      const fim = mov
      setArrastando(false)
      if (fim) {
        atualizarNo.mutate({ id: fim.id, x: fim.x, y: fim.y }, {
          onSettled: () => setMov(null),
          onError: er => addToast('error', erroApi(er, 'Não foi possível mover o card.')),
        })
      }
    } else if (g.tipo === 'linha') {
      setLinhaTemp(null)
      const mundo = paraMundo(e.clientX, e.clientY)
      const alvo = document.elementFromPoint(e.clientX, e.clientY)
      const ponto = alvo?.closest<HTMLElement>('[data-ponto]')
      const card = alvo?.closest<HTMLElement>('[data-no]')
      const naLinha = alvo?.closest<SVGElement>('[data-lig]')
      const o = g.origem
      const de = 'no' in o ? { de: o.no, deLado: o.lado } : { deLig: o.lig, deT: o.t }
      let para: { para: number; paraLado: Lado } | { paraLig: number; paraT: number } | null = null
      const noAlvo = Number(ponto?.dataset.no ?? card?.dataset.no)
      if (noAlvo) {
        const pos = posicoes.get(noAlvo)
        if (!pos || ('no' in o && o.no === noAlvo)) return
        para = { para: noAlvo, paraLado: (ponto?.dataset.ponto as Lado | undefined) ?? ladoMaisProximo(pos, mundo) }
      } else if (naLinha) {
        const ligAlvo = Number(naLinha.dataset.lig)
        const c = curvas.get(ligAlvo)
        if (!c || ('lig' in o && o.lig === ligAlvo)) return
        para = { paraLig: ligAlvo, paraT: tMaisProximo(c, mundo) }
      }
      if (!para) return
      criarLigacao.mutate({ ...de, ...para, cor: '#ffffff' }, {
        onError: er => addToast('error', erroApi(er, 'Não foi possível ligar.')),
      })
    } else if (g.tipo === 'curva') {
      setArrastando(false)
      const c = curvaTemp
      if (c) atualizarLigacao.mutate({ id: c.id, curva: { dx: c.dx, dy: c.dy } }, {
        onSettled: () => setCurvaTemp(null),
        onError: er => addToast('error', erroApi(er, 'Não foi possível ajustar a linha.')),
      })
    }
  }

  /** "+" do lado do card: cria a pessoa ao lado, já ligada, e abre os dados para colocar a foto. */
  function adicionarAoLado(n: NoArvore, lado: Lado) {
    const pos = posicaoAoLado(n, lado, [...posicoes.values()])
    criarNo.mutate({ ...vazio, ...pos, foto: null, fotos: [] }, {
      onSuccess: r => {
        criarLigacao.mutate({ de: n.id, deLado: lado, para: r.no.id, paraLado: OPOSTO[lado], cor: '#ffffff' })
        setEditor(r.no.id); setPainel(null)
      },
      onError: er => addToast('error', erroApi(er, 'Não foi possível adicionar.')),
    })
  }
  /** Pessoa nova solta no meio da tela (primeiro card ou sem ligação). */
  function adicionarNoCentro() {
    const r = viewport.current!.getBoundingClientRect()
    const c = paraMundo(r.left + r.width / 2, r.top + r.height / 2)
    const centro = { x: Math.round(c.x - CARD_W / 2), y: Math.round(c.y - CARD_H / 2) }
    // No meio da tela; se já tiver alguém lá, o lugar livre mais perto
    const livre = posicaoAoLado({ x: centro.x - CARD_W - 130, y: centro.y }, 'direita', [...posicoes.values()])
    criarNo.mutate({ ...vazio, ...livre, foto: null, fotos: [] }, {
      onSuccess: res => { setEditor(res.no.id); setPainel(null) },
      onError: er => addToast('error', erroApi(er, 'Não foi possível adicionar.')),
    })
  }
  function mudarZoom(fator: number) {
    const r = viewport.current!.getBoundingClientRect()
    const mx = r.width / 2, my = r.height / 2
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * fator))
    setPan(p => ({ x: mx - (mx - p.x) * (nz / zoom), y: my - (my - p.y) * (nz / zoom) }))
    setZoom(nz)
  }
  async function baixar() {
    setExportando(true)
    try { await baixarArvoreComoImagem(arvore!); addToast('success', 'Imagem da árvore baixada.') }
    catch { addToast('error', 'Não foi possível gerar a imagem.') }
    finally { setExportando(false) }
  }

  const ligSel = ligacoes.find(l => l.id === selecionada)
  const curvaSel = ligSel ? curvas.get(ligSel.id) ?? null : null
  /** Ponto de onde sai a linha que está sendo puxada. */
  const origemTemp = (() => {
    if (!linhaTemp) return null
    const o = linhaTemp.origem
    if ('no' in o) { const p = posicoes.get(o.no); return p ? { ponto: pontoDoLado(p, o.lado), lado: o.lado as Lado | null } : null }
    const c = curvas.get(o.lig)
    return c ? { ponto: pontoNaCurva(c, o.t), lado: null } : null
  })()
  const noEditor = arvore.nos.find(n => n.id === editor)
  const botao = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt2 hover:text-txt hover:bg-card2 disabled:opacity-40'

  return (
    <div className="relative h-full min-h-120 w-full overflow-hidden bg-bg">
      {/* Barra do topo */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-card/95 backdrop-blur rounded-xl px-2 py-1.5 shadow-lg min-w-0">
          <Link to="/arvores" className={botao} title="Voltar às árvores"><ChevronLeft size={15} /></Link>
          <GitBranch size={16} className="text-gold shrink-0" />
          <div className="min-w-0 pr-2">
            <h1 className="text-sm font-semibold text-txt truncate max-w-[40vw]">{arvore.nome}</h1>
            <p className="text-[10px] font-mono text-txt3 truncate max-w-[40vw]">
              {arvore.inquerito?.titulo ? `INQ ${arvore.inquerito.numero} · ${arvore.inquerito.titulo}` : 'Sem inquérito'} · {arvore.nos.length} pessoa(s)
            </p>
          </div>
          {!podeEditar && <span className="flex items-center gap-1 text-[10px] font-mono text-txt3 pr-2"><Lock size={11} /> só leitura</span>}
        </div>
        <span className="flex-1" />
        <div className="pointer-events-auto flex items-center gap-1 bg-card/95 backdrop-blur rounded-xl px-1.5 py-1.5 shadow-lg">
          {podeEditar && <button type="button" onClick={adicionarNoCentro} disabled={criarNo.isPending} className={`${botao} text-gold3`}><Plus size={14} /> Pessoa</button>}
          <button type="button" onClick={() => mudarZoom(1 / 1.2)} className={botao} aria-label="Diminuir zoom"><Minus size={14} /></button>
          <span className="w-11 text-center font-mono text-[11px] text-txt2">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => mudarZoom(1.2)} className={botao} aria-label="Aumentar zoom"><Plus size={14} /></button>
          <button type="button" onClick={enquadrar} className={botao} title="Mostrar a árvore inteira"><Maximize2 size={14} /></button>
          <button type="button" onClick={() => void baixar()} disabled={exportando || !arvore.nos.length} className={botao} title="Baixar a árvore como imagem (PNG)">
            <Download size={14} /> {exportando ? 'Gerando…' : 'Imagem'}
          </button>
          <span className="w-px h-5 bg-bdr mx-0.5" />
          <button type="button" onClick={() => { setPainel(p => (p === 'dados' ? null : 'dados')); setEditor(null) }} aria-pressed={painel === 'dados'}
            className={`${botao} ${painel === 'dados' ? 'bg-gold/20 text-gold3' : ''}`}><FileText size={14} /> Dados</button>
          <button type="button" onClick={() => { setPainel(p => (p === 'chat' ? null : 'chat')); setEditor(null) }} aria-pressed={painel === 'chat'}
            className={`${botao} ${painel === 'chat' ? 'bg-gold/20 text-gold3' : ''}`}><MessageSquare size={14} /> Chat <span className="font-mono text-txt3">{arvore.mensagens.length}</span></button>
        </div>
      </div>

      {/* Quadro */}
      <div ref={viewport} className="absolute inset-0 touch-none select-none cursor-grab active:cursor-grabbing"
        style={{ backgroundImage: 'radial-gradient(rgba(139,92,246,0.16) 1px, transparent 1px)', backgroundSize: `${28 * zoom}px ${28 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
        onPointerDown={aoApertarFundo} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
        <div className="absolute top-0 left-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Linhas */}
          <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden="true">
            {ligacoes.map(l => {
              const c = curvas.get(l.id)
              if (!c) return null
              const d = caminhoSvg(c)
              return (
                <g key={l.id}>
                  <path d={d} data-lig={l.id} fill="none" stroke="transparent" strokeWidth={16 / zoom} className="cursor-pointer" style={{ pointerEvents: 'stroke' }}
                    onPointerDown={e => aoApertarLinha(e, l)}><title>Clique para cor e rótulo · segure e arraste para puxar outra linha daqui</title></path>
                  <path d={d} fill="none" stroke={l.cor} strokeWidth={selecionada === l.id ? 3.5 : 2.5} strokeLinecap="round"
                    style={{ filter: selecionada === l.id ? `drop-shadow(0 0 6px ${l.cor})` : undefined, pointerEvents: 'none' }} />
                  {/* Ponto onde esta linha encosta em outra linha */}
                  {l.deLig != null && <circle cx={c.p0.x} cy={c.p0.y} r={4.5} fill={l.cor} stroke="#07050b" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
                  {l.paraLig != null && <circle cx={c.p3.x} cy={c.p3.y} r={4.5} fill={l.cor} stroke="#07050b" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
                </g>
              )
            })}
            {linhaTemp && origemTemp && (
              <>
                <path d={caminhoSvg(curvaDaLinha(origemTemp.ponto, origemTemp.lado, linhaTemp.ponta, null, null))} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeDasharray="6 6" style={{ pointerEvents: 'none' }} />
                <circle cx={origemTemp.ponto.x} cy={origemTemp.ponto.y} r={5} fill="#ffffff" style={{ pointerEvents: 'none' }} />
              </>
            )}
            {curvaSel && podeEditar && (
              <circle cx={curvaSel.meio.x} cy={curvaSel.meio.y} r={7 / zoom} fill={ligSel!.cor} stroke="#07050b" strokeWidth={2 / zoom}
                className="cursor-move" onPointerDown={e => aoApertarCurva(e, ligSel!)}><title>Arraste para curvar a linha</title></circle>
            )}
          </svg>

          {/* Rótulos das linhas */}
          {ligacoes.map(l => {
            if (!l.rotulo) return null
            const c = curvas.get(l.id)
            if (!c) return null
            return (
              <span key={`r${l.id}`} className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-card text-txt whitespace-nowrap pointer-events-none"
                style={{ left: c.meio.x, top: c.meio.y - 16, border: `1px solid ${l.cor}` }}>{l.rotulo}</span>
            )
          })}

          {/* Cards */}
          {arvore.nos.map(n => {
            const p = posicoes.get(n.id)!
            const ativo = editor === n.id || mov?.id === n.id
            return (
              <div key={n.id} data-no={n.id}
                className={`group absolute rounded-2xl bg-card shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] ring-1 transition-shadow ${ativo ? 'ring-gold shadow-[0_0_0_4px_rgba(139,92,246,0.25)]' : 'ring-bdrg hover:ring-gold/60'} ${podeEditar ? 'cursor-move' : 'cursor-pointer'}`}
                style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H, zIndex: ativo ? 5 : 1 }}
                onPointerDown={e => aoApertarCard(e, n)}>
                <div className="p-2.5 h-full flex flex-col pointer-events-none">
                  <FotoArvore foto={n.foto} nome={n.nome || n.apelido} className="w-full h-32 rounded-xl" />
                  <p className="mt-2 text-sm font-semibold text-txt truncate">{n.nome || 'Sem nome'}</p>
                  <p className="text-xs text-gold3 truncate">{n.apelido ? `"${n.apelido}"` : n.funcao || '—'}</p>
                  {(n.faccao || n.status) && <p className="mt-auto font-mono text-[10px] text-txt2 uppercase tracking-wider truncate">{[n.faccao, n.status].filter(Boolean).join(' · ')}</p>}
                </div>
                {podeEditar && LADOS.map(lado => (
                  <span key={lado}>
                    {/* Ponto de ligação: arraste até outro card */}
                    <button type="button" data-ponto={lado} data-no={n.id} aria-label={`Ligar pelo lado ${lado}`} title="Arraste até outra pessoa para ligar"
                      onPointerDown={e => aoApertarPonto(e, n, lado)}
                      className={`absolute ${PONTO_LADO[lado]} ${ESTILO_LADO[lado]} w-3 h-3 rounded-full bg-white ring-2 ring-gold opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-crosshair transition-opacity`} />
                    {/* + : pessoa nova deste lado, já ligada */}
                    <button type="button" aria-label={`Adicionar pessoa ${lado === 'cima' ? 'acima' : lado === 'baixo' ? 'abaixo' : `à ${lado}`}`}
                      onPointerDown={e => e.stopPropagation()} onClick={() => adicionarAoLado(n, lado)} disabled={criarNo.isPending}
                      className={`absolute ${MAIS_LADO[lado]} ${ESTILO_LADO[lado]} w-7 h-7 rounded-full bg-gold text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-gold2 transition-opacity`}>
                      <Plus size={15} />
                    </button>
                  </span>
                ))}
              </div>
            )
          })}
        </div>

        {/* Quadro vazio */}
        {arvore.nos.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto" onPointerDown={e => e.stopPropagation()}>
              {podeEditar ? (
                <button type="button" onClick={adicionarNoCentro} disabled={criarNo.isPending}
                  className="w-24 h-24 mx-auto rounded-3xl border-2 border-dashed border-gold/50 text-gold3 hover:bg-gold/10 hover:border-gold flex items-center justify-center transition-colors">
                  <Plus size={36} />
                </button>
              ) : <GitBranch size={40} className="mx-auto text-txt3" />}
              <p className="mt-3 text-sm text-txt2">{podeEditar ? 'Adicione a primeira pessoa da árvore' : 'Esta árvore ainda está vazia'}</p>
              {podeEditar && <p className="text-[11px] text-txt3 mt-1">Depois use o <b>+</b> em cada lado do card para ligar outras pessoas.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Linha selecionada: cor, rótulo, endireitar e apagar */}
      {ligSel && curvaSel && podeEditar && (
        <div className="absolute z-20 -translate-x-1/2 flex flex-wrap items-center gap-1.5 bg-card/97 backdrop-blur rounded-xl px-2.5 py-2 shadow-xl ring-1 ring-bdrg"
          style={{ left: pan.x + curvaSel.meio.x * zoom, top: pan.y + curvaSel.meio.y * zoom + 22 }}
          onPointerDown={e => e.stopPropagation()}>
          {CORES_LINHA.map(cor => (
            <button key={cor} type="button" aria-label={`Cor ${cor}`} onClick={() => atualizarLigacao.mutate({ id: ligSel.id, cor })}
              className={`w-5 h-5 rounded-full ring-2 ${ligSel.cor.toLowerCase() === cor ? 'ring-gold3' : 'ring-transparent'}`} style={{ background: cor }} />
          ))}
          <CorLivre key={ligSel.id} cor={ligSel.cor} onEscolher={cor => atualizarLigacao.mutate({ id: ligSel.id, cor })} />
          <input value={rotulo} onChange={e => setRotulo(e.target.value)} maxLength={40} placeholder="Rótulo (ex.: irmão)" aria-label="Rótulo da linha"
            onBlur={() => rotulo !== ligSel.rotulo && atualizarLigacao.mutate({ id: ligSel.id, rotulo })}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-36 bg-card2 rounded px-2 py-1 text-xs text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold" />
          {ligSel.curva && <button type="button" title="Endireitar a linha" onClick={() => atualizarLigacao.mutate({ id: ligSel.id, curva: null })} className="p-1 rounded text-txt2 hover:text-txt"><Undo2 size={14} /></button>}
          <button type="button" title="Apagar a linha" onClick={() => { removerLigacao.mutate(ligSel.id); setSelecionada(null) }} className="p-1 rounded text-red hover:bg-red/10"><Trash2 size={14} /></button>
        </div>
      )}

      {/* Dica de uso */}
      {podeEditar && arvore.nos.length > 0 && !editor && !painel && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden md:block text-[11px] text-txt3 bg-card/80 rounded-full px-3 py-1 pointer-events-none">
          Arraste o card para mover · clique para os dados · <b>+</b> adiciona ao lado · puxe a bolinha para ligar · segure e arraste uma linha para puxar outra dela · clique na linha para cor e rótulo
        </p>
      )}

      {noEditor && <EditorCard key={noEditor.id} arvoreId={arvore.id} no={noEditor} podeEditar={podeEditar} onFechar={() => setEditor(null)} />}
      {painel && !noEditor && (
        <PainelArvore arvore={arvore} aba={painel} setAba={setPainel} onFechar={() => setPainel(null)} onAbrirNo={n => { setEditor(n.id); setPainel(null) }} />
      )}
    </div>
  )
}

/**
 * Seletor de cor livre da linha: o navegador dispara "mudou" a cada movimento do mouse no seletor —
 * a cor muda na hora na tela, mas só é GRAVADA quando a pessoa para de mexer (sem flood no servidor).
 */
function CorLivre({ cor, onEscolher }: { cor: string; onEscolher: (cor: string) => void }) {
  const [valor, setValor] = useState(cor)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <input type="color" value={valor} aria-label="Outra cor"
      onChange={e => {
        const nova = e.target.value
        setValor(nova)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => { if (nova.toLowerCase() !== cor.toLowerCase()) onEscolher(nova) }, 500)
      }}
      className="w-6 h-6 rounded bg-transparent cursor-pointer" />
  )
}
