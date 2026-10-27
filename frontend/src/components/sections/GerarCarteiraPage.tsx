import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Upload, CreditCard } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useMembros } from '@/hooks/useMembros'
import { useLogo } from '@/hooks/useConfig'
import { desenharCarteiraDU, validadePadrao, CARTEIRA_W, CARTEIRA_H, type DadosCarteira } from '@/lib/carteiraDU'
import emblemaPadrao from '@/assets/du-logo.webp'

export default function GerarCarteiraPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { data: membros } = useMembros()
  const { data: logoData } = useLogo()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fotoRef = useRef<HTMLImageElement | null>(null)
  const emblemaRef = useRef<HTMLImageElement | null>(null)

  const [membroId, setMembroId] = useState('')
  const [dados, setDados] = useState<DadosCarteira>(() => ({
    nome: '', codinome: '', cargo: '', distintivo: '', passaporte: '', registro: '',
    emissao: new Date().toLocaleDateString('pt-BR'), validade: validadePadrao(), assinatura: '',
  }))
  const [temFoto, setTemFoto] = useState(false)
  const [, setTick] = useState(0)

  // Emblema: logo enviada em Configurações (data URL) ou o emblema padrão da DU
  const emblemaSrc = logoData?.logo || emblemaPadrao
  useEffect(() => {
    const i = new Image()
    i.onload = () => { emblemaRef.current = i; setTick(t => t + 1) }
    i.src = emblemaSrc
  }, [emblemaSrc])
  useEffect(() => { document.fonts?.ready.then(() => setTick(t => t + 1)) }, [])
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) desenharCarteiraDU(ctx, dados, { foto: fotoRef.current, emblema: emblemaRef.current })
  })

  function escolherMembro(id: string) {
    setMembroId(id)
    const m = membros?.find(x => String(x.id) === id)
    if (!m) return
    setDados(d => ({
      ...d, nome: m.policial, codinome: m.codinome ?? '', cargo: m.cargoNome || m.patenteInterna || m.patenteNPD,
      distintivo: m.badge, passaporte: m.passaporte, registro: String(m.id).padStart(4, '0'),
    }))
  }
  const set = (k: keyof DadosCarteira) => (e: React.ChangeEvent<HTMLInputElement>) => setDados(d => ({ ...d, [k]: e.target.value }))

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
      a.download = `carteirinha-du-${(dados.codinome || dados.nome || dados.registro || 'membro').replace(/\s+/g, '_')}.png`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      addToast('success', 'Carteirinha baixada!')
    }, 'image/png')
  }

  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  return (
    <div className="w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="mb-6">
        <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Identificação</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2"><CreditCard size={26} className="text-gold" /> Carteirinha da DU</h1>
        <p className="text-sm text-txt2 mt-1">Escolha o investigador para preencher os dados, envie a foto e baixe a carteirinha.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4 sm:gap-6 items-start">
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-card border border-bdr rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-txt">Dados do investigador</h2>
            <div>
              <label className={labelCls}>Preencher a partir do membro</label>
              <select value={membroId} onChange={e => escolherMembro(e.target.value)} className={inputCls}>
                <option value="">— escolha um investigador —</option>
                {(membros ?? []).map(m => <option key={m.id} value={m.id}>{m.policial}{m.codinome ? ` "${m.codinome}"` : ''}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Nome</label><input value={dados.nome} onChange={set('nome')} maxLength={60} placeholder="Ex: Peter Wolf" className={inputCls} /></div>
            <div><label className={labelCls}>Codinome</label><input value={dados.codinome} onChange={set('codinome')} maxLength={40} placeholder="Ex: Raven" className={inputCls} /></div>
            <div><label className={labelCls}>Cargo</label><input value={dados.cargo} onChange={set('cargo')} maxLength={50} placeholder="Ex: Senior Detective" className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Distintivo</label><input value={dados.distintivo} onChange={set('distintivo')} maxLength={20} placeholder="Ex: 4521" className={`${inputCls} font-mono`} /></div>
              <div><label className={labelCls}>Passaporte</label><input value={dados.passaporte} onChange={set('passaporte')} maxLength={20} placeholder="Ex: 10293" className={`${inputCls} font-mono`} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Registro</label><input value={dados.registro} onChange={set('registro')} maxLength={12} placeholder="0001" className={`${inputCls} font-mono`} /></div>
              <div><label className={labelCls}>Emissão</label><input value={dados.emissao} onChange={set('emissao')} maxLength={10} className={`${inputCls} font-mono`} /></div>
              <div><label className={labelCls}>Validade</label><input value={dados.validade} onChange={set('validade')} maxLength={10} className={`${inputCls} font-mono`} /></div>
            </div>
            <div><label className={labelCls}>Assinatura do comandante</label>
              <input value={dados.assinatura} onChange={set('assinatura')} maxLength={40} placeholder="Ex: Peter Wolf" className={inputCls} style={{ fontFamily: '"Great Vibes", cursive', fontSize: 22 }} /></div>
            <div>
              <label className={labelCls}>Foto do investigador</label>
              <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-bdr2 text-txt2 text-sm hover:border-gold/40 hover:text-txt cursor-pointer transition-colors">
                <Upload size={15} /> {temFoto ? 'Trocar foto' : 'Enviar foto'}
                <input type="file" accept="image/*" onChange={onFoto} className="hidden" />
              </label>
            </div>
            <button onClick={baixar} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(139,92,246,0.7)]">
              <Download size={16} /> Baixar carteirinha
            </button>
          </div>

        </div>

        <div className="bg-card border border-bdr rounded-xl p-5 lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-txt">Prévia</h2>
            <span className="font-mono text-[10px] text-txt3 tracking-wider uppercase">1536 × 968 · atualização automática</span>
          </div>
          <div className="rounded-2xl overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.18),transparent_60%)] p-2 sm:p-4">
            <canvas ref={canvasRef} width={CARTEIRA_W} height={CARTEIRA_H} className="w-full h-auto block drop-shadow-[0_24px_40px_rgba(0,0,0,0.6)]" />
          </div>
        </div>
      </div>
    </div>
  )
}
