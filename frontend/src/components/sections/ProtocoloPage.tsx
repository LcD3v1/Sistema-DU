import { useState } from 'react'
import { BookOpen, Maximize2, ExternalLink, ShieldCheck, Pencil, Save, Send, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import Brand from '@/components/ui/Brand'
import LoadingHud from '@/components/ui/LoadingHud'
import ModalOverlay from '@/components/ui/ModalOverlay'
import ImagensPainel from '@/components/ui/ImagensPainel'
import { envioGrandeDemais, imagemGrandeDemais, type ImagemPainel } from '@/lib/imagensPainel'
import {
  useProtocolo, useSalvarProtocolo, usePublicarProtocolo, useCanaisProtocolo, LINK_HEYZINE, MOTIVO_ERRO_PAINEL, type Protocolo,
} from '@/hooks/useProtocolo'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'

type Erro = { response?: { data?: { error?: string } } }
const campo = 'w-full bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold'
const rotulo = 'block font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1.5'
/** Link colado do navegador: sem espaços, sem "#página"/"?…" e sem barra no fim. */
const limparLink = (l: string) => l.trim().replace(/[?#].*$/, '').replace(/\/+$/, '')

/** Caneta: trocar o livro (link do flipbook do Heyzine) e os capítulos listados. */
function TrocarLivro({ aberto, onFechar, flipbook, secoes }: { aberto: boolean; onFechar: () => void; flipbook: string; secoes: string[] }) {
  const salvar = useSalvarProtocolo()
  const { addToast } = useUIStore()
  const [link, setLink] = useState(flipbook)
  const [capitulos, setCapitulos] = useState(secoes.join('\n'))
  const limpo = limparLink(link)
  const valido = LINK_HEYZINE.test(limpo)

  const enviar = () => salvar.mutate({ flipbook: limpo, secoes: capitulos.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30) }, {
    onSuccess: () => { addToast('success', 'Livro do protocolo trocado.'); onFechar() },
    onError: e => addToast('error', (e as Erro)?.response?.data?.error ?? 'Não foi possível trocar o livro.'),
  })

  return (
    <ModalOverlay open={aberto} onClose={onFechar} title="TROCAR LIVRO DO PROTOCOLO">
      <div className="space-y-4">
        <div>
          <label htmlFor="p-link" className={rotulo}>Link do flipbook (Heyzine)</label>
          <input id="p-link" value={link} onChange={e => setLink(e.target.value)} maxLength={200} autoFocus
            placeholder="https://heyzine.com/flip-book/xxxxxxxx.html" className={campo} />
          <p className={`text-[11px] mt-1 ${link && !valido ? 'text-red' : 'text-txt3'}`}>
            {link && !valido
              ? 'Use um link de flipbook do Heyzine: https://heyzine.com/flip-book/…'
              : 'No Heyzine, abra o livro → Compartilhar → copie o link. Só links do Heyzine aparecem dentro da página.'}
          </p>
        </div>
        <div>
          <label htmlFor="p-caps" className={rotulo}>Capítulos <span className="normal-case tracking-normal text-txt3">(um por linha, opcional)</span></label>
          <textarea id="p-caps" value={capitulos} onChange={e => setCapitulos(e.target.value)} rows={7} className={campo}
            placeholder={'Introdução\nJuramento\nDiretrizes Gerais'} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Cancelar</button>
          <button type="button" onClick={enviar} disabled={!valido || salvar.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium transition-colors disabled:opacity-50">
            <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

/** Painel no Discord: imagens (no topo), canal, mensagem; salvar publica/atualiza a mensagem do bot. */
function PainelDiscord({ aberto, onFechar, protocolo }: { aberto: boolean; onFechar: () => void; protocolo: Protocolo }) {
  const salvar = useSalvarProtocolo()
  const publicar = usePublicarProtocolo()
  const canais = useCanaisProtocolo(protocolo.discordConfigurado)
  const { addToast } = useUIStore()
  const { painel } = protocolo
  const [canalId, setCanalId] = useState(painel.canalId)
  const [descricao, setDescricao] = useState(painel.descricao ?? '')
  const [imagens, setImagens] = useState<ImagemPainel[]>(painel.imagens)

  const resultado = (d: Protocolo, ok: string) => addToast(d.painel.erro ? 'error' : 'success', d.painel.erro ? `Salvo, mas não publicado: ${MOTIVO_ERRO_PAINEL[d.painel.erro]}` : ok)
  const enviar = () => {
    const corpo = { flipbook: protocolo.flipbook, secoes: protocolo.secoes, canalId, descricao: descricao.trim() || null, imagens: imagens.filter(i => i.url) }
    const grande = imagemGrandeDemais(corpo.imagens.map((i, k) => ({ rotulo: `Imagem ${k + 1}`, url: i.url })))
    if (grande) { addToast('error', `${grande} passa de 1 MB. Remova e escolha de novo (o site comprime sozinho) ou cole um link.`); return }
    if (envioGrandeDemais(corpo)) { addToast('error', 'As imagens enviadas passam de 5 MB juntas. Use link em algumas ou imagens menores.'); return }
    salvar.mutate(corpo, {
      onSuccess: d => { resultado(d, d.painel.canalId ? 'Painel salvo e publicado no Discord.' : 'Painel salvo. Escolha um canal para publicar.'); onFechar() },
      onError: e => addToast('error', (e as Erro)?.response?.data?.error ?? 'Não foi possível salvar o painel.'),
    })
  }

  return (
    <ModalOverlay open={aberto} onClose={onFechar} title="PAINEL DO PROTOCOLO NO DISCORD" maxWidth="max-w-2xl">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {!protocolo.discordConfigurado && <p className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-red/10 text-red"><AlertTriangle size={15} className="shrink-0" /> O Discord não está configurado no servidor (.env).</p>}
        <p className={`flex items-center gap-1.5 text-xs font-mono ${painel.publicado ? 'text-green' : 'text-txt3'}`}>
          {painel.publicado ? <CheckCircle2 size={14} /> : <Clock size={14} />}
          {painel.publicado ? 'Publicado no Discord' : 'Ainda não publicado'}
          {painel.erro && <span className="text-red normal-case"> · {MOTIVO_ERRO_PAINEL[painel.erro]}</span>}
        </p>

        <div>
          <p className={rotulo}>Imagens do painel</p>
          <ImagensPainel imagens={imagens} onChange={setImagens} onErro={m => addToast('error', m)}
            posicoes={[
              { valor: 'topo', rotulo: '1 · Topo (acima do título)' },
              { valor: 'titulo', rotulo: '2 · Depois do título e da mensagem' },
              { valor: 'passos', rotulo: '3 · Depois dos capítulos (antes do botão)' },
              { valor: 'botao', rotulo: '4 · Logo depois do botão "Abrir o protocolo"' },
              { valor: 'fim', rotulo: '5 · Fim (antes do rodapé)' },
            ]} />
        </div>

        <div>
          <label htmlFor="p-canal" className={rotulo}>Canal do painel</label>
          <select id="p-canal" value={canalId ?? ''} onChange={e => setCanalId(e.target.value || null)} className={campo}>
            <option value="">Escolha um canal…</option>
            {(canais.data?.canais ?? []).map(c => <option key={c.id} value={c.id}>#{c.nome}</option>)}
            {canalId && !canais.data?.canais.some(c => c.id === canalId) && <option value={canalId}>(canal atual)</option>}
          </select>
        </div>

        <div>
          <label htmlFor="p-desc" className={rotulo}>Mensagem <span className="normal-case tracking-normal text-txt3">(opcional)</span></label>
          <textarea id="p-desc" value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={500} rows={3} className={campo}
            placeholder="Documento oficial da unidade. Leia com atenção: todo membro deve conhecer e seguir o protocolo." />
          <p className="text-[11px] text-txt3 mt-1">O painel mostra o título, esta mensagem, os capítulos do livro e o botão "Abrir o protocolo". O rodapé é o padrão (fotinha + nome do servidor).</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {painel.publicado && (
            <button type="button" onClick={() => publicar.mutate(undefined, { onSuccess: d => resultado(d, 'Painel atualizado no Discord.'), onError: () => addToast('error', 'Não foi possível atualizar agora.') })}
              disabled={publicar.isPending} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card2 text-sm text-txt2 hover:text-txt disabled:opacity-40">
              <RefreshCw size={14} className={publicar.isPending ? 'animate-spin' : ''} /> Atualizar agora
            </button>
          )}
          <button type="button" onClick={onFechar} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Cancelar</button>
          <button type="button" onClick={enviar} disabled={salvar.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium transition-colors disabled:opacity-50">
            <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar e publicar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default function ProtocoloPage() {
  const { data, isLoading } = useProtocolo()
  const { canEdit } = usePerms()
  const [carregado, setCarregado] = useState<string | null>(null)   // link do livro que já terminou de abrir
  const [editando, setEditando] = useState(false)
  const [painelAberto, setPainelAberto] = useState(false)
  if (isLoading || !data) return <LoadingHud />
  const { flipbook, secoes } = data
  const loaded = carregado === flipbook

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      {/* ── Banner ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/25 mb-6"
           style={{ background: 'radial-gradient(120% 140% at 15% 0%, rgba(139, 92, 246,0.28), rgba(20,33,61,0.5) 40%, #070a12 80%)' }}>
        <div className="absolute inset-0 grain-noise opacity-[0.05] pointer-events-none" />
        <div className="relative flex items-center gap-3 sm:gap-5 p-4 sm:p-6 md:p-8 flex-wrap">
          <div className="shrink-0" style={{ filter: 'drop-shadow(0 0 24px rgba(139, 92, 246,0.4))' }}>
            <Brand size={84} />
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1 flex items-center gap-2">
              <ShieldCheck size={13} /> Documento oficial
            </p>
            <h1 className="wordmark text-2xl md:text-3xl text-white tracking-wide">Protocolo Operacional</h1>
            <p className="text-sm text-white/70 mt-1">Force Action Strike Terrestrial — Detroit Police Department</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit('protocolo') && (
              <button type="button" onClick={() => setEditando(true)} title="Trocar o livro (link do flipbook)" aria-label="Trocar o livro do protocolo"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                <Pencil size={15} /> <span className="hidden sm:inline">Trocar livro</span>
              </button>
            )}
            {canEdit('protocolo') && (
              <button type="button" onClick={() => setPainelAberto(true)} title="Publicar o protocolo como painel no Discord" aria-label="Painel do protocolo no Discord"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                <Send size={15} /> <span className="hidden sm:inline">Painel no Discord</span>
                {data.painel.publicado && <span className="w-1.5 h-1.5 rounded-full bg-green" title="Publicado" />}
              </button>
            )}
            <a href={flipbook} target="_blank" rel="noopener noreferrer"
               className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors shadow-[0_10px_30px_-12px_rgba(139, 92, 246,0.7)]">
              <Maximize2 size={15} /> Abrir em tela cheia
            </a>
          </div>
        </div>
      </div>

      {/* ── Índice de seções ───────────────────────────────── */}
      {secoes.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase flex items-center gap-1.5 mr-1">
            <BookOpen size={12} /> Conteúdo
          </span>
          {secoes.map(s => (
            <span key={s} className="px-3 py-1 rounded-full border border-bdr2 bg-card2/60 text-txt2 text-xs">{s}</span>
          ))}
        </div>
      )}

      {/* ── Flipbook ───────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-bdr bg-card overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-txt3">
              <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              <p className="font-mono text-xs tracking-wider">Carregando protocolo…</p>
            </div>
          </div>
        )}
        <iframe
          key={flipbook}
          src={flipbook}
          title="Protocolo Operacional DU"
          onLoad={() => setCarregado(flipbook)}
          allowFullScreen
          className="w-full h-[72vh] min-h-130 block"
          style={{ border: 0, opacity: loaded ? 1 : 0, transition: 'opacity 0.4s' }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="font-mono text-[11px] text-txt3">
          {data.atualizadoPor ? `Livro trocado por ${data.atualizadoPor} em ${new Date(data.atualizadoEm!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
        </p>
        <a href={flipbook} target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1.5 font-mono text-[11px] text-txt3 hover:text-gold3 transition-colors">
          Abrir o protocolo em nova aba <ExternalLink size={12} />
        </a>
      </div>

      {/* key: reabre com os valores atuais */}
      {editando && <TrocarLivro key={flipbook} aberto={editando} onFechar={() => setEditando(false)} flipbook={flipbook} secoes={secoes} />}
      {painelAberto && <PainelDiscord aberto={painelAberto} onFechar={() => setPainelAberto(false)} protocolo={data} />}
    </div>
  )
}
