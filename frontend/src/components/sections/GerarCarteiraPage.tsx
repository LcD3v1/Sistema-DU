import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Upload, CreditCard } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'

const TEMPLATE = '/media/carteira-modelo.png'
const W = 1536
const H = 1024

// Coordenadas medidas sobre o modelo (1536x1024)
const FIELDS: { key: 'nome' | 'passaporte' | 'registro' | 'data'; x: number; y: number }[] = [
  { key: 'nome',       x: 312, y: 378 },
  { key: 'passaporte', x: 388, y: 491 },
  { key: 'registro',   x: 470, y: 603 },
  { key: 'data',       x: 455, y: 713 },
]
const PHOTO = { x: 1157, y: 319, w: 291, h: 367, r: 14 }
const SIG = { cx: 1246, y: 846 }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height, r = w / h
  let dw: number, dh: number, dx: number, dy: number
  if (ir > r) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; dy = y }
  else { dw = w; dh = w / ir; dx = x; dy = y - (dh - h) / 2 }
  ctx.drawImage(img, dx, dy, dw, dh)
}

export default function GerarCarteiraPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fotoRef = useRef<HTMLImageElement | null>(null)
  const tplRef = useRef<HTMLImageElement | null>(null)

  const [nome, setNome] = useState('')
  const [passaporte, setPassaporte] = useState('')
  const [registro, setRegistro] = useState('')
  const [data, setData] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [temFoto, setTemFoto] = useState(false)
  const [tplOk, setTplOk] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const i = new Image()
    i.onload = () => { tplRef.current = i; setTplOk(true); setTick(t => t + 1) }
    i.onerror = () => addToast('error', 'Não foi possível carregar o modelo da carteira.')
    i.src = TEMPLATE
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { document.fonts?.ready.then(() => setTick(t => t + 1)) }, [])
  useEffect(() => { draw() })

  function draw() {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    if (tplRef.current) ctx.drawImage(tplRef.current, 0, 0, W, H)

    // Foto (na moldura OFFICER PHOTO)
    if (fotoRef.current) {
      ctx.save(); roundRect(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, PHOTO.r); ctx.clip()
      drawCover(ctx, fotoRef.current, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h)
      ctx.restore()
    }

    // Campos de texto
    const vals: Record<string, string> = { nome, passaporte, registro, data }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.font = '600 34px Geist, sans-serif'; ctx.fillStyle = '#eef2fb'
    for (const f of FIELDS) {
      const v = vals[f.key]?.trim()
      if (v) ctx.fillText(v, f.x, f.y)
    }

    // Assinatura (fonte manuscrita, sobre a linha)
    if (assinatura.trim()) {
      ctx.textAlign = 'center'
      ctx.font = '400 68px "Great Vibes", cursive'
      ctx.fillStyle = '#f0d98c'
      ctx.fillText(assinatura.trim(), SIG.cx, SIG.y)
      ctx.textAlign = 'left'
    }
  }

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 6_000_000) { addToast('error', 'Imagem muito grande (máx 6MB).'); return }
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => { fotoRef.current = img; setTemFoto(true); setTick(t => t + 1) }
    img.src = url
  }

  function baixar() {
    const c = canvasRef.current; if (!c) return
    c.toBlob(b => {
      if (!b) { addToast('error', 'Falha ao gerar a imagem.'); return }
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `carteira-${(nome || registro || 'fast').toString().replace(/\s+/g, '_')}.png`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      addToast('success', 'Carteira baixada!')
    }, 'image/png')
  }

  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm font-mono text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  return (
    <div className="p-6 max-w-[1400px]">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="mb-6">
        <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Ferramenta interna</p>
        <h1 className="text-3xl font-bold text-txt flex items-center gap-2"><CreditCard size={26} className="text-gold" /> Gerar carteira</h1>
        <p className="text-sm text-txt2 mt-1">Preencha os dados sobre o modelo oficial e baixe a carteira pronta.</p>
      </div>

      <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
        {/* Formulário */}
        <div className="bg-card border border-bdr rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-txt">Dados da carteira</h2>

          <div><label className={labelCls}>Name</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Peter Wolf" className={inputCls} /></div>
          <div><label className={labelCls}>Passport</label>
            <input value={passaporte} onChange={e => setPassaporte(e.target.value)} placeholder="Ex: 12345" className={inputCls} /></div>
          <div><label className={labelCls}>Registration</label>
            <input value={registro} onChange={e => setRegistro(e.target.value)} placeholder="Ex: 216F" className={inputCls} /></div>
          <div><label className={labelCls}>Date of issue</label>
            <input value={data} onChange={e => setData(e.target.value)} placeholder="Ex: 14/09/2026" className={inputCls} /></div>
          <div><label className={labelCls}>Assinatura do comandante</label>
            <input value={assinatura} onChange={e => setAssinatura(e.target.value)} placeholder="Ex: Peter Wolf" className={inputCls} style={{ fontFamily: '"Great Vibes", cursive', fontSize: 22 }} /></div>

          <div>
            <label className={labelCls}>Foto do oficial</label>
            <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-bdr2 text-txt2 text-sm hover:border-gold/40 hover:text-txt cursor-pointer transition-colors">
              <Upload size={15} /> {temFoto ? 'Trocar foto' : 'Enviar foto'}
              <input type="file" accept="image/*" onChange={onFoto} className="hidden" />
            </label>
          </div>

          <button onClick={baixar} disabled={!tplOk} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50 shadow-[0_10px_30px_-12px_rgba(58,114,196,0.7)]">
            <Download size={16} /> Baixar carteira
          </button>
        </div>

        {/* Prévia */}
        <div className="bg-card border border-bdr rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-txt">Prévia</h2>
            <span className="font-mono text-[10px] text-txt3 tracking-wider uppercase">Atualização automática</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-bdr bg-black/40">
            <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto block" />
          </div>
        </div>
      </div>
    </div>
  )
}
