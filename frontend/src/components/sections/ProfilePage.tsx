import { useRef, useState } from 'react'
import {
  CalendarDays, BadgeCheck, Link2, UserCog, FileSearch, ScrollText, FolderArchive, Images, Lock, ArrowRight,
  Image as ImageIcon, Check, Upload, X, Pencil, Save, Hourglass, XCircle, Gauge, Send, Fingerprint,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMe, useLinkMembro, useSetBanner, useUpdateMeuMembro, useMinhaSolicitacaoPerfil, useSolicitarNivel } from '@/hooks/useMe'
import { ROTULO_CAMPO } from '@/lib/perfil'
import { useMembros } from '@/hooks/useMembros'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import { resolveBanner, PRESET_BANNERS } from '@/lib/banners'
import { usePerms } from '@/hooks/usePerms'
import { relatoriosApi, boletinsApi, inqueritosApi, galeriaApi, dataBR } from '@/hooks/useInvestigacao'
import type { Membro } from '@/types'
import PersonalizarPerfil from '@/components/perfil/PersonalizarPerfil'
import LinksPerfil from '@/components/perfil/LinksPerfil'
import EmojiPerfil from '@/components/perfil/EmojiPerfil'
import ServidorDaUnidade from '@/components/perfil/ServidorDaUnidade'
import { ACEITA_FOTO, fotoDoArquivo, mensagemErroFoto } from '@/lib/imagemArquivo'
import { useOpcoesPerfil } from '@/hooks/useSetagem'

function initials(n: string) { return n.split(/[.\s]+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') }
function fmt(d?: string) { if (!d) return '—'; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

function Stat({ icon: Icon, label, value, color = '#8b5cf6', to }: { icon: typeof FileSearch; label: string; value: string | number; color?: string; to?: string }) {
  const corpo = (
    <div className="bg-card border border-bdr rounded-xl p-4 h-full hover:border-gold/40 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18', border: `1px solid ${color}40` }}><Icon size={15} style={{ color }} /></div>
        <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase">{label}</p>
      </div>
      <p className="text-2xl font-bold text-txt">{value}</p>
    </div>
  )
  return to ? <Link to={to} className="block">{corpo}</Link> : corpo
}

export default function ProfilePage() {
  const { data: me, isLoading: lme } = useMe()
  const qMembros = useMembros()
  const { data: membros } = qMembros
  const { canView } = usePerms()
  const { data: relatorios } = relatoriosApi.useLista(canView('relatorios'))
  const { data: boletins } = boletinsApi.useLista(canView('boletins'))
  const { data: inqueritos } = inqueritosApi.useLista(canView('inqueritos'))
  const { data: fotos } = galeriaApi.useLista(canView('galeria'))
  const link = useLinkMembro()
  const setBanner = useSetBanner()
  const updateMeuMembro = useUpdateMeuMembro()
  const { data: minhaSolicitacao } = useMinhaSolicitacaoPerfil()
  const solicitarNivel = useSolicitarNivel()
  const { addToast } = useUIStore()
  const [sel, setSel] = useState('')
  const [pickBanner, setPickBanner] = useState(false)
  const [editMembro, setEditMembro] = useState(false)
  const [editNivel, setEditNivel] = useState(false)
  const [novoNivel, setNovoNivel] = useState('')
  const [form, setForm] = useState({ nivel: '', policial: '', codinome: '', badge: '', passaporte: '', patenteInterna: '', setor: '' })
  const { data: opcoes } = useOpcoesPerfil()
  const bannerInput = useRef<HTMLInputElement>(null)

  const membrosList: Membro[] = membros ?? []
  const membro = me?.membroId ? membrosList.find(m => m.id === me.membroId) ?? null : null


  // Só a PRIMEIRA carga mostra a tela de carregamento. Uma consulta que falhou (403, 503…)
  // volta a "carregando" a cada nova tentativa — e o sistema recarrega tudo sempre que
  // alguém grava algo —, o que trocava a página inteira pelo loader e fazia o
  // "Personalizar perfil" sumir (perdendo o que estava sendo digitado).
  const primeiraCarga = (q: { isLoading: boolean; errorUpdateCount: number }) => q.isLoading && q.errorUpdateCount === 0
  if (lme || primeiraCarga(qMembros)) return <LoadingHud />
  if (!me) return null

  const nome = me.nome || membro?.codinome || me.nomeServidor || membro?.policial || me.username   // codinome (regra)
  const banner = resolveBanner(me.banner, nome)
  const doMembro = <T extends { investigadores: number[] }>(lista: T[] | undefined) => membro ? (lista ?? []).filter(x => x.investigadores.includes(membro.id)) : []
  const meusRel = doMembro(relatorios)
  const meusBol = doMembro(boletins)
  const meusInq = doMembro(inqueritos)
  const minhasFotos = (fotos ?? []).filter(f => f.podeEditar)

  function onBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
    fotoDoArquivo(f, { maxLado: 1920, formato: 'image/webp', qualidade: 0.88 })
      .then(url => setBanner.mutate(url, { onSuccess: () => { addToast('success', 'Banner atualizado!'); setPickBanner(false) } }))
      .catch(err => addToast('error', mensagemErroFoto(err)))
  }
  function escolherBanner(key: string) { setBanner.mutate(key, { onSuccess: () => { addToast('success', 'Banner atualizado!'); setPickBanner(false) } }) }
  function vincular() { if (sel) link.mutate(Number(sel), { onSuccess: () => { addToast('success', 'Perfil vinculado!'); setSel('') } }) }
  const nivelPendente = minhaSolicitacao?.status === 'pendente'
    ? minhaSolicitacao.alteracoes.find(a => a.campo === 'nivel')?.para ?? null
    : null
  function enviarNivel() {
    const n = Number(novoNivel)
    if (!Number.isInteger(n) || n < 1 || n > 999) { addToast('error', 'Informe um nível entre 1 e 999.'); return }
    if (n === me?.nivelMembro) { addToast('error', 'Esse já é o seu nível atual.'); return }
    solicitarNivel.mutate(n, {
      onSuccess: r => {
        addToast('success', r.data.pendente
          ? 'Pedido enviado! O nível muda assim que um superior aprovar.'
          : 'Nível atualizado!')
        setEditNivel(false); setNovoNivel('')
      },
      onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao enviar.'),
    })
  }
  function abrirEdicao() {
    if (!membro) return
    setForm({ nivel: me?.nivelMembro ? String(me.nivelMembro) : '', policial: membro.policial, codinome: membro.codinome ?? '', badge: membro.badge, passaporte: membro.passaporte, patenteInterna: membro.patenteInterna, setor: membro.setor ?? '' })
    setEditMembro(true)
  }
  function salvarEdicao() {
    if (!form.policial.trim()) { addToast('error', 'O nome é obrigatório.'); return }
    const { nivel, ...resto } = form
    updateMeuMembro.mutate(nivel.trim() ? { ...resto, nivel: Number(nivel) } : resto, {
      onSuccess: r => {
        addToast('success', r.data.pendente
          ? 'Solicitação enviada! Você está aguardando a aprovação de um superior.'
          : 'Perfil atualizado!')
        setEditMembro(false)
      },
      onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar.'),
    })
  }

  return (
    <div className="w-full max-w-450 mx-auto p-3 sm:p-6 lg:px-8">
      {/* ── Hero com banner ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-bdr mb-6">
        {banner.img
          ? <img src={banner.img} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0" style={{ background: banner.css }} />}
        {banner.overlay && <div className="absolute inset-0" style={{ background: banner.overlay }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,5,0.85) 0%, rgba(5,7,12,0.5) 55%, rgba(5,7,12,0.1) 100%)' }} />

        {/* editar banner */}
        <button onClick={() => setPickBanner(v => !v)}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur border border-white/15 text-white/80 text-xs hover:text-white transition-colors">
          <ImageIcon size={13} /> Editar banner
        </button>

        <div className="relative px-4 pt-14 pb-14 sm:p-6 md:p-8 flex items-center gap-3 sm:gap-5 flex-wrap">
          {/* Avatar */}
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center text-2xl font-bold text-white backdrop-blur">
              {me.avatarAtual ? <img src={me.avatarAtual} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : initials(nome)}
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{nome}{me.emojisPerfil?.length ? <span className="ml-2 inline-flex items-center gap-1.5 align-middle" aria-hidden="true">{me.emojisPerfil.map((e, i) => <EmojiPerfil key={i} valor={e} />)}</span> : null}</h1>
            {membro?.codinome && (
              <p className="mt-1.5 inline-flex items-center gap-2 rounded-md border border-gold/50 bg-gold/15 px-3 py-1 font-display text-base sm:text-lg uppercase tracking-[0.22em] text-gold3 shadow-[0_0_24px_-8px_rgba(139,92,246,0.9)]">
                <Fingerprint size={16} className="text-gold2" /> {membro.codinome}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-mono tracking-wider uppercase ${me.admin ? 'text-red border-red/40 bg-red/10' : 'text-gold3 border-gold/40 bg-gold/10'}`}>{me.admin ? 'Administrador' : 'Investigador'}</span>
              {membro && <span className="px-2.5 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/80 text-[11px] font-mono">{membro.patenteInterna || membro.patenteDPD}</span>}
              {me.nivelMembro !== null && <span className="px-2.5 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/80 text-[11px] font-mono flex items-center gap-1"><Gauge size={11} /> Nv. {me.nivelMembro}</span>}
            </div>
            <LinksPerfil links={me.links ?? []} className="mt-3" />
          </div>
        </div>
      </div>

      {/* ── Seletor de banner ───────────────────────────────── */}
      {pickBanner && (
        <div className="bg-card border border-bdr rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-txt">Escolher banner</h3>
            <button onClick={() => setPickBanner(false)} className="text-txt3 hover:text-txt"><X size={16} /></button>
          </div>

          {/* Presets */}
          <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-2">Artes da DU e fundos roxos</p>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-5">
            {PRESET_BANNERS.map(p => {
              const active = me.banner === p.key
              return (
                <button key={p.key} onClick={() => escolherBanner(p.key)}
                  className={`relative h-20 rounded-lg overflow-hidden border transition ${active ? 'border-gold ring-2 ring-gold/40' : 'border-white/10 hover:border-gold/50'}`}
                  style={p.css ? { background: p.css } : undefined}>
                  {p.img && <img src={p.img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                  <span className="absolute bottom-1 left-1.5 text-[10px] text-white/90 drop-shadow">{p.label}</span>
                  {active && <span className="absolute top-1.5 right-1.5 text-gold3"><Check size={14} /></span>}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
            <button onClick={() => bannerInput.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-bdr2 text-txt2 text-xs hover:text-txt hover:border-gold/40 transition-colors">
              <Upload size={14} /> Enviar imagem do computador
            </button>
            {me.banner && <button onClick={() => setBanner.mutate(null, { onSuccess: () => addToast('success', 'Banner redefinido.') })} className="px-3 py-2 rounded-lg text-txt3 hover:text-red text-xs transition-colors">Redefinir</button>}
            <input ref={bannerInput} type="file" accept={ACEITA_FOTO} onChange={onBannerUpload} className="hidden" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Conta + membro */}
        <div className="space-y-4">
          <div className="bg-card border border-bdr rounded-xl p-5">
            <h2 className="text-sm font-semibold text-txt flex items-center gap-2 mb-4"><UserCog size={16} className="text-gold" /> Conta</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-txt2">Usuário</dt><dd className="text-txt font-medium">{me.username}</dd></div>
              <div className="flex justify-between"><dt className="text-txt2">Acesso</dt><dd className="text-txt font-medium">{me.admin ? 'Administrador' : 'Membro'}</dd></div>
              <div className="flex justify-between"><dt className="text-txt2">Nome no Discord</dt><dd className="text-txt font-medium">{me.nomeServidor || me.username}</dd></div>
            </dl>
          </div>

          <ServidorDaUnidade />

          <div className="bg-card border border-bdr rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-txt flex items-center gap-2"><BadgeCheck size={16} className="text-gold" /> Perfil de membro</h2>
              {membro && !editMembro && (
                <button onClick={abrirEdicao} className="flex items-center gap-1 text-xs text-txt3 hover:text-gold3 transition-colors font-mono"><Pencil size={12} /> Editar</button>
              )}
            </div>
            {minhaSolicitacao?.status === 'pendente' && !editMembro && (
              <div className="mb-4 px-3 py-2.5 rounded-lg border border-orange-400/40 bg-orange-400/10">
                <p className="flex items-center gap-1.5 text-xs font-medium text-orange-400"><Hourglass size={13} /> Alteração aguardando aprovação</p>
                <div className="mt-1.5 space-y-0.5">
                  {minhaSolicitacao.alteracoes.map(a => (
                    <p key={a.campo} className="text-[11px] text-txt2"><span className="text-txt3">{ROTULO_CAMPO[a.campo] ?? a.campo}:</span> {a.de || '—'} → <span className="text-txt">{a.para || '—'}</span></p>
                  ))}
                </div>
              </div>
            )}
            {minhaSolicitacao?.status === 'recusada' && !editMembro && (
              <div className="mb-4 px-3 py-2 rounded-lg border border-red/30 bg-red/10">
                <p className="flex items-center gap-1.5 text-xs font-medium text-red"><XCircle size={13} /> Última alteração recusada{minhaSolicitacao.decididoPor ? ` por ${minhaSolicitacao.decididoPor}` : ''}</p>
                {minhaSolicitacao.motivoRecusa && <p className="text-[11px] text-txt2 mt-0.5">Motivo: {minhaSolicitacao.motivoRecusa}</p>}
              </div>
            )}
            {membro && editMembro ? (
              <div className="space-y-3">
                <p className="text-[11px] text-txt3">As alterações só valem depois da aprovação de um superior. Aprovadas, a patente, o setor e o apelido mudam também no Discord.</p>
                {([
                  ['nivel', 'Nível', 'Ex.: 48'],
                  ['policial', 'Nome do investigador', 'Ex.: Peter Wolf'],
                  ['codinome', 'Codinome', 'Ex.: Raven'],
                  ['badge', 'Badge', 'Ex.: 4521'],
                  ['passaporte', 'Passaporte / ID', 'Ex.: 10293'],
                ] as const).map(([key, label, ph]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="font-mono text-[10px] text-txt2 tracking-wider uppercase">{label}</label>
                    <input
                      value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      placeholder={ph}
                      className="input-gold bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt"
                    />
                  </div>
                ))}
                {([
                  ['patenteInterna', 'Patente', opcoes?.patentes ?? []],
                  ['setor', 'Setor (subunidade)', opcoes?.setores ?? []],
                ] as const).map(([key, label, lista]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label htmlFor={`perfil-${key}`} className="font-mono text-[10px] text-txt2 tracking-wider uppercase">{label}</label>
                    <select id={`perfil-${key}`} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      className="input-gold bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm text-txt">
                      {key === 'setor' && <option value="">— sem setor —</option>}
                      {form[key] && !lista.includes(form[key]) && <option value={form[key]}>{form[key]} (atual)</option>}
                      {lista.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={salvarEdicao} disabled={updateMeuMembro.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
                    <Save size={14} /> {updateMeuMembro.isPending ? 'Enviando...' : 'Enviar para aprovação'}
                  </button>
                  <button onClick={() => setEditMembro(false)} className="px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt transition-colors">Cancelar</button>
                </div>
              </div>
            ) : membro ? (
              <>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-txt2">Nome</dt><dd className="text-txt font-medium">{membro.policial}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2 flex items-center gap-1"><Fingerprint size={12} /> Codinome</dt><dd className="text-gold3 font-medium">{membro.codinome || '—'}</dd></div>
                  <div>
                    <div className="flex justify-between items-center gap-2">
                      <dt className="text-txt2 flex items-center gap-1"><Gauge size={12} /> Nível</dt>
                      <dd className="flex items-center gap-2">
                        <span className="text-txt font-medium font-mono">{me.nivelMembro ?? '—'}</span>
                        {me.nivelMembro !== null && !editNivel && (
                          <button onClick={() => { setNovoNivel(nivelPendente ?? String(me.nivelMembro)); setEditNivel(true) }}
                            className="text-[11px] text-txt3 hover:text-gold3 transition-colors font-mono flex items-center gap-1"><Pencil size={11} /> Atualizar</button>
                        )}
                      </dd>
                    </div>
                    {nivelPendente && !editNivel && (
                      <p className="mt-1 text-[11px] text-orange-400 flex items-center gap-1"><Hourglass size={11} /> Nível {nivelPendente} aguardando aprovação</p>
                    )}
                    {editNivel && (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                          <input type="number" min={1} max={999} inputMode="numeric" autoFocus aria-label="Novo nível"
                            value={novoNivel} onChange={e => setNovoNivel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') enviarNivel(); if (e.key === 'Escape') setEditNivel(false) }}
                            placeholder="Novo nível"
                            className="input-gold flex-1 min-w-0 bg-card2 border border-bdr2 rounded-lg px-3 py-1.5 text-sm font-mono text-txt" />
                          <button onClick={enviarNivel} disabled={solicitarNivel.isPending}
                            className="flex items-center gap-1 px-3 rounded-lg bg-gold text-white text-xs font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
                            <Send size={12} /> {solicitarNivel.isPending ? 'Enviando...' : 'Enviar'}
                          </button>
                          <button onClick={() => setEditNivel(false)} aria-label="Cancelar" className="px-2 rounded-lg border border-bdr2 text-txt2 hover:text-txt transition-colors"><X size={14} /></button>
                        </div>
                        <p className="text-[11px] text-txt3">O nível só muda depois da aprovação de um superior. Aprovado, ele é atualizado em todo o sistema.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between"><dt className="text-txt2">Badge</dt><dd className="text-txt font-medium font-mono">{membro.badge || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Passaporte</dt><dd className="text-txt font-medium font-mono">{membro.passaporte || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Patente</dt><dd className="text-txt font-medium">{membro.patenteInterna || membro.patenteDPD || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Setor</dt><dd className="text-txt font-medium">{membro.setor || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Status</dt><dd className="text-txt font-medium">{membro.status}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2"><CalendarDays size={12} className="inline mr-1" />Entrada</dt><dd className="text-txt font-medium">{fmt(membro.entrada)}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Última promoção</dt><dd className="text-txt font-medium">{fmt(membro.promocao)}</dd></div>
                </dl>
                <button onClick={() => link.mutate(null, { onSuccess: () => addToast('success', 'Desvinculado.') })} className="mt-4 w-full text-xs text-txt3 hover:text-red transition-colors font-mono">Desvincular</button>
              </>
            ) : (
              <div>
                <p className="text-xs text-txt3 mb-3">Vincule seu perfil de membro para ver sua atividade investigativa.</p>
                <div className="flex gap-2">
                  <select value={sel} onChange={e => setSel(e.target.value)} className="input-gold flex-1 bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm font-mono text-txt">
                    <option value="">Selecione o membro...</option>
                    {membrosList.map(m => <option key={m.id} value={m.id}>{m.policial} {m.badge ? `(${m.badge})` : ''}</option>)}
                  </select>
                  <button onClick={vincular} disabled={!sel || link.isPending} className="flex items-center gap-1.5 px-3 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50"><Link2 size={15} /> Vincular</button>
                </div>
              </div>
            )}
          </div>

          <PersonalizarPerfil me={me} onAbrirFundo={() => { setPickBanner(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        </div>

        {/* Atividade investigativa */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Detective Unit</p>
            <h2 className="text-xl font-semibold text-txt">Atividade investigativa</h2>
          </div>
          {membro ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {canView('relatorios') && <Stat icon={FileSearch} label="Relatórios" value={meusRel.length} to="/relatorios" />}
                {canView('boletins') && <Stat icon={ScrollText} label="Boletins" value={meusBol.length} color="#f5c451" to="/boletins" />}
                {canView('inqueritos') && <Stat icon={FolderArchive} label="Inquéritos" value={meusInq.length} color="#c4b5fd" to="/inqueritos" />}
                {canView('galeria') && <Stat icon={Images} label="Fotos publicadas" value={minhasFotos.length} color="#2ecc71" to="/galeria" />}
              </div>
              {canView('relatorios') && (
                <div className="bg-card border border-bdr rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-txt flex items-center gap-2"><FileSearch size={15} className="text-gold" /> Meus relatórios recentes</h3>
                    <Link to="/relatorios" className="text-xs text-gold3 hover:text-gold2 inline-flex items-center gap-1">Ver todos <ArrowRight size={12} /></Link>
                  </div>
                  {meusRel.length === 0 ? <p className="text-sm text-txt3 py-4 text-center">Você ainda não aparece em nenhum relatório.</p> : (
                    <ul className="divide-y divide-bdr">
                      {meusRel.slice(0, 6).map(r => (
                        <li key={r.id} className="py-2.5 flex items-center gap-3">
                          <span className="font-mono text-[11px] text-gold3 w-32 shrink-0 truncate">{r.numero}</span>
                          <span className="flex-1 min-w-0 truncate text-sm text-txt">{r.sigiloso && <Lock size={11} className="inline mr-1 text-red" />}{r.titulo}</span>
                          <span className="text-[11px] text-txt3 font-mono shrink-0">{dataBR(r.data)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {canView('inqueritos') && meusInq.length > 0 && (
                <div className="bg-card border border-bdr rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-txt flex items-center gap-2 mb-3"><FolderArchive size={15} className="text-gold" /> Inquéritos em que atuo</h3>
                  <ul className="divide-y divide-bdr">
                    {meusInq.slice(0, 6).map(i => (
                      <li key={i.id} className="py-2.5 flex items-center gap-3">
                        <span className="font-mono text-[11px] text-gold3 w-32 shrink-0 truncate">{i.numero}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-txt">{i.titulo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="border border-bdr rounded-xl bg-card py-16 text-center">
              <FileSearch size={30} className="text-txt3 mx-auto mb-3" />
              <p className="text-txt2 text-sm">Vincule seu perfil de membro para ver sua atividade.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
