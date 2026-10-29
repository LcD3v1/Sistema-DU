import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Upload, CreditCard, Send } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/axios'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import { useLogo } from '@/hooks/useConfig'
import { desenharCarteiraDU, validadePadrao, CARTEIRA_W, CARTEIRA_H, type DadosCarteira } from '@/lib/carteiraDU'
import emblemaPadrao from '@/assets/du-logo.webp'
import { ACEITA_FOTO, fotoDoArquivo, mensagemErroFoto } from '@/lib/imagemArquivo'

/** Membro com os dados já completados pelo backend (painel + pedido de set + Discord). */
interface MembroCarteira {
  id: number; nome: string; codinome: string; cargo: string; distintivo: string; passaporte: string; registro: string
  status: string; aprovado: boolean; noDiscord: boolean; temFoto: boolean; postadaNoForum: boolean
}

const erroApi = (e: unknown, padrao: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

export default function GerarCarteiraPage() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { canEdit } = usePerms()
  const podePostar = canEdit('carteira')
  // Fórum do Discord onde as carteirinhas são postadas (só quem edita a área)
  const forum = useQuery<{ canalId: string | null; foruns: { id: string; nome: string }[]; discordConfigurado: boolean }>({
    queryKey: ['carteira', 'forum'],
    queryFn: async () => (await api.get('/carteira/forum')).data,
    enabled: podePostar,
  })
  // Tópicos (posts) do fórum escolhido: dá para mandar a carteirinha num tópico específico
  const topicos = useQuery<{ topicos: { id: string; nome: string; arquivado: boolean }[] }>({
    queryKey: ['carteira', 'topicos', forum.data?.canalId ?? null],
    queryFn: async () => (await api.get('/carteira/topicos')).data,
    enabled: podePostar && Boolean(forum.data?.canalId),
  })
  const [topicoId, setTopicoId] = useState('')
  const salvarForum = useMutation({ mutationFn: async (canalId: string | null) => (await api.put('/carteira/forum', { canalId })).data })
  const postar = useMutation({ mutationFn: async (body: { membroId: number; imagem: string; topicoId: string | null }) => (await api.post<{ ok: true; novoTopico: boolean }>('/carteira/postar', body)).data })
  const membrosQ = useQuery<MembroCarteira[]>({
    queryKey: ['carteira', 'membros'],
    queryFn: async () => (await api.get('/carteira/membros')).data,
  })
  const membros = membrosQ.data
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
  const [carregandoFoto, setCarregandoFoto] = useState(false)
  const pedidoFoto = useRef(0)

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

  /** Foto automática do membro (enviada no site ou a do Discord), servida pelo próprio backend. */
  async function carregarFoto(id: number) {
    const pedido = ++pedidoFoto.current
    setCarregandoFoto(true)
    try {
      const blob: Blob = (await api.get(`/carteira/foto/${id}`, { responseType: 'blob' })).data
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        if (pedido === pedidoFoto.current) { fotoRef.current = img; setTemFoto(true); setTick(t => t + 1) }
        URL.revokeObjectURL(url)
      }
      img.onerror = () => URL.revokeObjectURL(url)
      img.src = url
    } catch {
      if (pedido === pedidoFoto.current) addToast('error', 'Não foi possível carregar a foto do membro. Envie uma manualmente.')
    } finally {
      if (pedido === pedidoFoto.current) setCarregandoFoto(false)
    }
  }

  function escolherMembro(id: string) {
    setMembroId(id)
    const m = membros?.find(x => String(x.id) === id)
    if (!m) return
    setDados(d => ({
      ...d, nome: m.nome, codinome: m.codinome, cargo: m.cargo,
      distintivo: m.distintivo, passaporte: m.passaporte, registro: m.registro,
    }))
    // Troca de membro: descarta a foto anterior e busca a dele (se tiver)
    pedidoFoto.current++
    fotoRef.current = null; setTemFoto(false); setCarregandoFoto(false); setTick(t => t + 1)
    if (m.temFoto) void carregarFoto(m.id)
  }
  const membroAtual = membros?.find(x => String(x.id) === membroId)
  const set = (k: keyof DadosCarteira) => (e: React.ChangeEvent<HTMLInputElement>) => setDados(d => ({ ...d, [k]: e.target.value }))

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
    const pedido = ++pedidoFoto.current // a foto enviada manualmente vence a automática
    setCarregandoFoto(false)
    fotoDoArquivo(f, { maxLado: 1200 }).then(url => {
      if (pedido !== pedidoFoto.current) return
      const img = new Image()
      img.onload = () => { fotoRef.current = img; setTemFoto(true); setTick(t => t + 1) }
      img.src = url
    }).catch(err => addToast('error', mensagemErroFoto(err)))
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

  /** Posta a carteirinha (imagem da prévia) no fórum: no tópico do membro, ou cria o tópico na 1ª vez. */
  function postarNoForum() {
    const c = canvasRef.current
    if (!c || !membroId) { addToast('error', 'Escolha o investigador antes de postar.'); return }
    postar.mutate({ membroId: Number(membroId), imagem: c.toDataURL('image/png'), topicoId: topicoId || null }, {
      onSuccess: r => { void membrosQ.refetch(); void topicos.refetch(); addToast('success', topicoId ? 'Carteirinha postada no tópico escolhido.' : r.novoTopico ? 'Carteirinha postada: tópico do membro criado no fórum.' : 'Carteirinha postada no tópico do membro.') },
      onError: e => addToast('error', erroApi(e, 'Não foi possível postar no fórum.')),
    })
  }

  const inputCls = 'input-gold w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2.5 text-sm text-txt placeholder-txt3'
  const labelCls = 'font-mono text-[11px] text-txt2 tracking-wider block mb-1.5'

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-txt2 hover:text-txt text-xs font-mono tracking-wider mb-4 transition-colors">
        <ChevronLeft size={14} /> VOLTAR
      </button>
      <div className="mb-6">
        <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1">Identificação</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2"><CreditCard size={26} className="text-gold" /> Carteirinha da DU</h1>
        <p className="text-sm text-txt2 mt-1">Escolha o investigador: os dados e a foto são preenchidos sozinhos com o que o painel e o Discord já sabem dele. Ajuste o que quiser e baixe ou poste no fórum.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4 sm:gap-6 items-start">
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-card border border-bdr rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-txt">Dados do investigador</h2>
            <div>
              <label className={labelCls}>Preencher a partir do membro</label>
              <select value={membroId} onChange={e => escolherMembro(e.target.value)} className={inputCls}>
                <option value="">— escolha um investigador —</option>
                {(membros ?? []).map(m => <option key={m.id} value={m.id}>{m.nome || `#${m.registro}`}{m.codinome ? ` "${m.codinome}"` : ''}{m.postadaNoForum ? ' · já no fórum' : ''}{m.aprovado ? '' : ' · sem acesso'}</option>)}
              </select>
              {membroAtual && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${membroAtual.aprovado ? 'border-green/40 text-green' : 'border-bdr2 text-txt3'}`}>{membroAtual.aprovado ? 'APROVADO' : 'SEM ACESSO AO PAINEL'}</span>
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${membroAtual.noDiscord ? 'border-gold/40 text-gold3' : 'border-bdr2 text-txt3'}`}>{membroAtual.noDiscord ? 'DISCORD VINCULADO' : 'SEM DISCORD'}</span>
                  {membroAtual.postadaNoForum && <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-gold/40 text-gold3">JÁ POSTADA NO FÓRUM</span>}
                </div>
              )}
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
                <Upload size={15} /> {carregandoFoto ? 'Carregando foto do membro…' : temFoto ? 'Trocar foto' : 'Enviar foto'}
                <input type="file" accept={ACEITA_FOTO} onChange={onFoto} className="hidden" />
              </label>
              {membroAtual && !membroAtual.temFoto && !temFoto && <p className="text-[11px] text-txt3 mt-1">Esse membro não tem foto no painel nem no Discord — envie uma.</p>}
            </div>
            <button onClick={baixar} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(139,92,246,0.7)]">
              <Download size={16} /> Baixar carteirinha
            </button>
          </div>

          {podePostar && (
            <div className="bg-card border border-bdr rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-txt">Fórum das carteirinhas</h2>
                <p className="text-[11px] text-txt3 mt-0.5">Só posta quando você clicar. Cada membro tem um tópico no fórum; as carteirinhas novas dele entram no mesmo tópico.</p>
              </div>
              {forum.data && !forum.data.discordConfigurado && <p className="text-xs text-red">O Discord não está configurado no servidor (.env).</p>}
              <div>
                <label className={labelCls}>Fórum do Discord</label>
                <select value={forum.data?.canalId ?? ''} disabled={salvarForum.isPending || !forum.data}
                  onChange={e => { setTopicoId(''); salvarForum.mutate(e.target.value || null, {
                    onSuccess: () => addToast('success', e.target.value ? 'Fórum das carteirinhas definido.' : 'Fórum removido.'),
                    onError: err => addToast('error', erroApi(err, 'Não foi possível salvar o fórum.')),
                  }) }}
                  className={inputCls}>
                  <option value="">— escolha o fórum —</option>
                  {(forum.data?.foruns ?? []).map(f => <option key={f.id} value={f.id}>#{f.nome}</option>)}
                  {forum.data?.canalId && !forum.data.foruns.some(f => f.id === forum.data!.canalId) && <option value={forum.data.canalId}>(fórum atual)</option>}
                </select>
                {forum.data && forum.data.foruns.length === 0 && forum.data.discordConfigurado && (
                  <p className="text-[11px] text-txt3 mt-1">Nenhum canal do tipo fórum no servidor. Crie um no Discord e recarregue.</p>
                )}
              </div>
              {forum.data?.canalId && (
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="cart-topico" className={labelCls}>Postar em</label>
                    <button type="button" onClick={() => void topicos.refetch()} className="font-mono text-[10px] text-txt3 hover:text-gold3 mb-1.5">{topicos.isFetching ? 'atualizando…' : 'atualizar lista'}</button>
                  </div>
                  <select id="cart-topico" value={topicoId} onChange={e => setTopicoId(e.target.value)} className={inputCls}>
                    <option value="">Tópico do próprio membro (cria na 1ª vez)</option>
                    {(topicos.data?.topicos ?? []).map(t => <option key={t.id} value={t.id}>{t.nome}{t.arquivado ? ' (arquivado)' : ''}</option>)}
                  </select>
                  {topicos.isError && <p className="text-[11px] text-red mt-1">{erroApi(topicos.error, 'Não foi possível ler os tópicos do fórum.')}</p>}
                  {topicoId && <p className="text-[11px] text-txt3 mt-1">A carteirinha vai para esse tópico; o tópico do membro não muda.</p>}
                </div>
              )}
              <button onClick={postarNoForum} disabled={!membroId || !forum.data?.canalId || postar.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gold/40 text-gold3 text-sm font-medium hover:bg-gold/10 transition-colors disabled:opacity-40">
                <Send size={16} /> {postar.isPending ? 'Postando…' : 'Postar no fórum'}
              </button>
              {!membroId && <p className="text-[11px] text-txt3">Escolha o investigador na lista acima para poder postar.</p>}
            </div>
          )}

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
