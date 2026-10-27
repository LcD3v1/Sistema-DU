import { useState } from 'react'
import { Palette, Image as ImageIcon, Plus, Trash2, Save, SmilePlus, Link2, X } from 'lucide-react'
import { useSetPersonalizacao, type LinkPerfil, type Me } from '@/hooks/useMe'
import { useUIStore } from '@/store/uiStore'
import { linkSeguro, plataformaDoLink } from '@/lib/plataformas'
import EmojiPicker from './EmojiPicker'
import EmojiPerfil from './EmojiPerfil'

const MAX_LINKS = 8
const MAX_EMOJIS = 6

type Seletor = { alvo: 'destaque' } | { alvo: 'link'; indice: number } | null

/**
 * Módulo "Personalizar perfil": foto de fundo, emojis ao lado do nome e links
 * (TikTok, Instagram, Twitch ou qualquer site). Tudo aparece também no perfil
 * aberto pela tela inicial (Membros).
 */
export default function PersonalizarPerfil({ me, onAbrirFundo }: { me: Me; onAbrirFundo: () => void }) {
  const salvar = useSetPersonalizacao()
  const { addToast } = useUIStore()
  const [links, setLinks] = useState<LinkPerfil[]>(me.links ?? [])
  const [emojis, setEmojis] = useState<string[]>(me.emojisPerfil ?? [])
  const [seletor, setSeletor] = useState<Seletor>(null)

  const alterado = JSON.stringify({ links, emojis }) !== JSON.stringify({ links: me.links ?? [], emojis: me.emojisPerfil ?? [] })

  function escolherEmoji(emoji: string) {
    if (seletor?.alvo === 'destaque') {
      setEmojis(e => (e.length >= MAX_EMOJIS ? e : [...e, emoji]))
    } else if (seletor?.alvo === 'link') {
      const i = seletor.indice
      setLinks(ls => ls.map((l, j) => (j === i ? { ...l, emoji } : l)))
    }
    setSeletor(null)
  }
  function editarLink(i: number, campo: 'rotulo' | 'url', valor: string) {
    setLinks(ls => ls.map((l, j) => {
      if (j !== i) return l
      const novo = { ...l, [campo]: valor }
      // Nome automático pela plataforma, enquanto a pessoa não escolheu um
      if (campo === 'url' && (!l.rotulo || l.rotulo === plataformaDoLink(l.url).nome) && linkSeguro(valor.trim())) {
        const p = plataformaDoLink(valor.trim())
        if (p.nome !== 'Link') novo.rotulo = p.nome
      }
      return novo
    }))
  }
  function enviar() {
    const limpos = links.map(l => ({ ...l, rotulo: l.rotulo.trim(), url: l.url.trim() }))
    const ruim = limpos.findIndex(l => !l.rotulo || !linkSeguro(l.url))
    if (ruim >= 0) { addToast('error', `Confira o link ${ruim + 1}: precisa de um nome e começar com http:// ou https://`); return }
    salvar.mutate({ links: limpos.map(l => (l.emoji ? l : { rotulo: l.rotulo, url: l.url })), emojis }, {
      onSuccess: () => addToast('success', 'Perfil personalizado!'),
      onError: (err: unknown) => {
        const d = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data
        addToast('error', d?.details?.[0]?.replace(/^[\w.]+: /, '') ?? d?.error ?? 'Erro ao salvar.')
      },
    })
  }

  return (
    <div className="bg-card border border-bdr rounded-xl p-5">
      <h2 className="text-sm font-semibold text-txt flex items-center gap-2 mb-1"><Palette size={16} className="text-gold" /> Personalizar perfil</h2>
      <p className="text-[11px] text-txt3 mb-4">Aparece no seu perfil e quando clicam no seu nome em Membros, na tela inicial.</p>

      {/* Foto de fundo */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase">Foto de fundo</p>
          <p className="text-[11px] text-txt3">Imagem atrás da sua foto de perfil.</p>
        </div>
        <button onClick={onAbrirFundo} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bdr2 text-txt2 text-xs hover:text-txt hover:border-gold/40 transition-colors">
          <ImageIcon size={13} /> Trocar fundo
        </button>
      </div>

      {/* Emojis de destaque */}
      <div className="mb-5">
        <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-2">Emojis ao lado do nome</p>
        <div className="relative flex flex-wrap items-center gap-1.5">
          {emojis.map((e, i) => (
            <button key={`${e}-${i}`} onClick={() => setEmojis(es => es.filter((_, j) => j !== i))} title="Remover" aria-label="Remover emoji"
              className="group relative w-9 h-9 rounded-lg bg-card2 border border-bdr2 text-xl leading-none hover:border-red/50 inline-flex items-center justify-center">
              <EmojiPerfil valor={e} /><X size={10} className="absolute -top-1 -right-1 text-red opacity-0 group-hover:opacity-100" />
            </button>
          ))}
          {emojis.length < MAX_EMOJIS && (
            <button onClick={() => setSeletor({ alvo: 'destaque' })} aria-label="Adicionar emoji"
              className="w-9 h-9 rounded-lg border border-dashed border-bdr2 text-txt3 hover:text-gold3 hover:border-gold/40 flex items-center justify-center"><SmilePlus size={16} /></button>
          )}
          {seletor?.alvo === 'destaque' && <div className="absolute left-0 top-full"><EmojiPicker onPick={escolherEmoji} onClose={() => setSeletor(null)} /></div>}
        </div>
      </div>

      {/* Links */}
      <div className="mb-4">
        <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-2">Links (TikTok, Instagram, Twitch…)</p>
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="relative flex gap-1.5 items-start">
              <button onClick={() => setSeletor({ alvo: 'link', indice: i })} title="Escolher emoji do link" aria-label="Escolher emoji do link"
                className="shrink-0 w-9 h-9 rounded-lg bg-card2 border border-bdr2 text-lg leading-none hover:border-gold/40 inline-flex items-center justify-center"><EmojiPerfil valor={l.emoji || plataformaDoLink(l.url).emoji} /></button>
              <div className="flex-1 min-w-0 space-y-1">
                <input value={l.rotulo} maxLength={30} onChange={e => editarLink(i, 'rotulo', e.target.value)} placeholder="Nome (ex.: Meu TikTok)" aria-label="Nome do link"
                  className="input-gold w-full bg-card2 border border-bdr2 rounded-lg px-2.5 py-1.5 text-xs text-txt" />
                <input value={l.url} maxLength={300} onChange={e => editarLink(i, 'url', e.target.value)} placeholder="https://..." aria-label="Endereço do link" inputMode="url"
                  className={`input-gold w-full bg-card2 border rounded-lg px-2.5 py-1.5 text-xs font-mono text-txt ${l.url && !linkSeguro(l.url.trim()) ? 'border-red/60' : 'border-bdr2'}`} />
              </div>
              <button onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))} aria-label="Remover link" className="shrink-0 p-2 text-txt3 hover:text-red"><Trash2 size={14} /></button>
              {seletor?.alvo === 'link' && seletor.indice === i && <div className="absolute left-0 top-9"><EmojiPicker onPick={escolherEmoji} onClose={() => setSeletor(null)} /></div>}
            </div>
          ))}
        </div>
        {links.length < MAX_LINKS && (
          <button onClick={() => setLinks(ls => [...ls, { rotulo: '', url: '' }])}
            className="mt-2 flex items-center gap-1.5 text-xs text-txt3 hover:text-gold3 transition-colors font-mono"><Plus size={13} /><Link2 size={12} /> Adicionar link</button>
        )}
      </div>

      <button onClick={enviar} disabled={!alterado || salvar.isPending}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
        <Save size={14} /> {salvar.isPending ? 'Salvando...' : 'Salvar personalização'}
      </button>
    </div>
  )
}
