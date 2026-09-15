import { useMemo, useRef, useState } from 'react'
import {
  Shield, Trophy, Target, Crosshair, CalendarDays, BadgeCheck, Link2, UserCog, Award, Percent,
  Camera, Image as ImageIcon, Crown, Check, Lock, Upload, X, Pencil, Save,
} from 'lucide-react'
import { useMe, useLinkMembro, useSetAvatar, useSetBanner, useUpdateMeuMembro } from '@/hooks/useMe'
import { useMembros } from '@/hooks/useMembros'
import { useAllAcoes } from '@/hooks/useAcoes'
import { useUIStore } from '@/store/uiStore'
import LoadingHud from '@/components/ui/LoadingHud'
import { resolveBanner, unlockedTiers, PRESET_BANNERS, TIER_BANNERS } from '@/lib/banners'
import type { Membro, Acao, Nivel } from '@/types'

const NIVEL_LABEL: Record<Nivel, string> = { admin: 'Comando', moderador: 'Supervisor', membro: 'Officer', view_only: 'Observador' }
const NIVEL_CLS: Record<Nivel, string> = {
  admin: 'text-red border-red/40 bg-red/10',
  moderador: 'text-gold3 border-gold/40 bg-gold/10',
  membro: 'text-blue border-blue/40 bg-blue/10',
  view_only: 'text-txt2 border-bdr2 bg-white/5',
}

function initials(n: string) { return n.split(/[.\s]+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') }
function fmt(d?: string) { if (!d) return '—'; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }
function fileToDataUrl(file: File, cb: (s: string) => void) { const r = new FileReader(); r.onload = () => cb(r.result as string); r.readAsDataURL(file) }

function Stat({ icon: Icon, label, value, color = '#3a72c4' }: { icon: typeof Trophy; label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-card border border-bdr rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18', border: `1px solid ${color}40` }}><Icon size={15} style={{ color }} /></div>
        <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase">{label}</p>
      </div>
      <p className="text-2xl font-bold text-txt">{value}</p>
    </div>
  )
}

export default function ProfilePage() {
  const { data: me, isLoading: lme } = useMe()
  const { data: membros, isLoading: lm } = useMembros()
  const { data: acoesData, isLoading: la } = useAllAcoes()
  const link = useLinkMembro()
  const setAvatar = useSetAvatar()
  const setBanner = useSetBanner()
  const updateMeuMembro = useUpdateMeuMembro()
  const { addToast } = useUIStore()
  const [sel, setSel] = useState('')
  const [pickBanner, setPickBanner] = useState(false)
  const [editMembro, setEditMembro] = useState(false)
  const [form, setForm] = useState({ policial: '', badge: '', passaporte: '', patenteNPD: '', patenteInterna: '' })
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  const membrosList: Membro[] = membros ?? []
  const membro = me?.membroId ? membrosList.find(m => m.id === me.membroId) ?? null : null

  const desempenho = useMemo(() => {
    if (!membro) return null
    const acoes: Acao[] = (acoesData?.acoes ?? []).filter(a => (a.status ?? 'aprovada') === 'aprovada')
    const ranking = membrosList
      .map(m => ({ id: m.id, s: acoes.filter(a => a.resultado === 'Vitória' && a.participants.some(p => p.memberId === m.id)).length }))
      .filter(r => r.s > 0).sort((a, b) => b.s - a.s)
    const mine = acoes.filter(a => a.participants.some(p => p.memberId === membro.id))
    const vitorias = mine.filter(a => a.resultado === 'Vitória').length
    const derrotas = mine.filter(a => a.resultado === 'Derrota').length
    const fechadas = vitorias + derrotas
    const pos = ranking.findIndex(r => r.id === membro.id)
    return { posicao: pos >= 0 ? pos + 1 : null, sucedidas: vitorias, total: mine.length, vitorias, derrotas, winRate: fechadas ? Math.round((vitorias / fechadas) * 100) : 0 }
  }, [membro, membrosList, acoesData])

  if (lme || lm || la) return <LoadingHud />
  if (!me) return null

  const rankPos = desempenho?.posicao ?? null
  const nome = membro?.policial || me.username
  const banner = resolveBanner(me.banner, rankPos)
  const tiers = unlockedTiers(rankPos)

  function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 2_000_000) { addToast('error', 'Imagem muito grande (máx 2MB).'); return }
    fileToDataUrl(f, url => setAvatar.mutate(url, { onSuccess: () => addToast('success', 'Foto atualizada!') }))
  }
  function onBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 3_000_000) { addToast('error', 'Imagem muito grande (máx 3MB).'); return }
    fileToDataUrl(f, url => setBanner.mutate(url, { onSuccess: () => { addToast('success', 'Banner atualizado!'); setPickBanner(false) } }))
  }
  function escolherBanner(key: string) { setBanner.mutate(key, { onSuccess: () => { addToast('success', 'Banner atualizado!'); setPickBanner(false) } }) }
  function vincular() { if (sel) link.mutate(Number(sel), { onSuccess: () => { addToast('success', 'Perfil vinculado!'); setSel('') } }) }
  function abrirEdicao() {
    if (!membro) return
    setForm({ policial: membro.policial, badge: membro.badge, passaporte: membro.passaporte, patenteNPD: membro.patenteNPD, patenteInterna: membro.patenteInterna })
    setEditMembro(true)
  }
  function salvarEdicao() {
    if (!form.policial.trim()) { addToast('error', 'O nome é obrigatório.'); return }
    updateMeuMembro.mutate(form, {
      onSuccess: () => { addToast('success', 'Perfil atualizado!'); setEditMembro(false) },
      onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao salvar.'),
    })
  }

  return (
    <div className="p-6 max-w-[1200px]">
      {/* ── Hero com banner ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-bdr mb-6">
        {banner.img
          ? <img src={banner.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0" style={{ background: banner.css }} />}
        {banner.overlay && <div className="absolute inset-0" style={{ background: banner.overlay }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,5,0.85) 0%, rgba(5,7,12,0.5) 55%, rgba(5,7,12,0.1) 100%)' }} />

        {/* selo de tier */}
        {banner.tier && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm border font-mono text-[11px] tracking-wider uppercase"
               style={{ color: banner.tier.glow, borderColor: banner.tier.glow + '66', background: banner.tier.glow + '1a' }}>
            <Crown size={13} /> {banner.tier.label} · {banner.tier.sub}
          </div>
        )}

        {/* editar banner */}
        <button onClick={() => setPickBanner(v => !v)}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur border border-white/15 text-white/80 text-xs hover:text-white transition-colors">
          <ImageIcon size={13} /> Editar banner
        </button>

        <div className="relative p-6 md:p-8 flex items-center gap-5">
          {/* Avatar */}
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center text-2xl font-bold text-white backdrop-blur">
              {me.avatar ? <img src={me.avatar} alt="" className="w-full h-full object-cover" /> : initials(nome)}
            </div>
            <button onClick={() => avatarInput.current?.click()}
              className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
              <Camera size={22} />
            </button>
            <input ref={avatarInput} type="file" accept="image/*" onChange={onAvatar} className="hidden" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-white truncate">{nome}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-mono tracking-wider uppercase ${NIVEL_CLS[me.nivel]}`}>{NIVEL_LABEL[me.nivel]}</span>
              {membro && <span className="px-2.5 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/80 text-[11px] font-mono">{membro.patenteInterna || membro.patenteNPD}</span>}
              {rankPos && <span className="px-2.5 py-0.5 rounded-full border border-gold/40 bg-gold/10 text-gold3 text-[11px] font-mono flex items-center gap-1"><Trophy size={11} /> {rankPos}º no ranking</span>}
            </div>
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

          {/* Tiers exclusivos */}
          <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-2">Exclusivos do ranking</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {TIER_BANNERS.map(t => {
              const unlocked = tiers.some(u => u.key === t.key)
              const active = me.banner === t.key
              return (
                <button key={t.key} disabled={!unlocked} onClick={() => escolherBanner(t.key)}
                  className={`relative h-20 rounded-lg overflow-hidden border text-left transition ${active ? 'border-gold ring-2 ring-gold/40' : 'border-white/10'} ${unlocked ? 'hover:border-gold/50' : 'opacity-45 cursor-not-allowed'}`}>
                  <img src={t.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: t.overlay }} />
                  <div className="absolute inset-0 p-2 flex flex-col justify-between">
                    <span className="font-mono text-[10px] text-white/90 tracking-wider uppercase flex items-center gap-1"><Crown size={11} /> {t.label}</span>
                    <span className="text-[10px] text-white/70">{t.sub}</span>
                  </div>
                  {!unlocked && <span className="absolute top-2 right-2 text-white/80"><Lock size={13} /></span>}
                  {active && <span className="absolute top-2 right-2 text-gold3"><Check size={14} /></span>}
                </button>
              )
            })}
          </div>

          {/* Presets */}
          <p className="font-mono text-[10px] text-txt2 tracking-wider uppercase mb-2">Padrão</p>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-5">
            {PRESET_BANNERS.map(p => {
              const active = me.banner === p.key
              return (
                <button key={p.key} onClick={() => escolherBanner(p.key)}
                  className={`relative h-20 rounded-lg overflow-hidden border transition ${active ? 'border-gold ring-2 ring-gold/40' : 'border-white/10 hover:border-gold/50'}`}
                  style={p.css ? { background: p.css } : undefined}>
                  {p.img && <img src={p.img} alt="" className="w-full h-full object-cover" />}
                  <span className="absolute bottom-1 left-1.5 text-[10px] text-white/90 drop-shadow">{p.label}</span>
                  {active && <span className="absolute top-1.5 right-1.5 text-gold3"><Check size={14} /></span>}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
            <button onClick={() => bannerInput.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-bdr2 text-txt2 text-xs hover:text-txt hover:border-gold/40 transition-colors">
              <Upload size={14} /> Enviar imagem própria
            </button>
            {me.banner && <button onClick={() => setBanner.mutate(null, { onSuccess: () => addToast('success', 'Banner redefinido.') })} className="px-3 py-2 rounded-lg text-txt3 hover:text-red text-xs transition-colors">Redefinir</button>}
            <input ref={bannerInput} type="file" accept="image/*" onChange={onBannerUpload} className="hidden" />
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
              <div className="flex justify-between"><dt className="text-txt2">Nível</dt><dd className="text-txt font-medium">{NIVEL_LABEL[me.nivel]}</dd></div>
              <div className="flex justify-between"><dt className="text-txt2">Discord</dt><dd className="text-txt font-medium">{me.discordUsername ? `@${me.discordUsername}` : 'não vinculado'}</dd></div>
            </dl>
          </div>

          <div className="bg-card border border-bdr rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-txt flex items-center gap-2"><BadgeCheck size={16} className="text-gold" /> Perfil de membro</h2>
              {membro && !editMembro && (
                <button onClick={abrirEdicao} className="flex items-center gap-1 text-xs text-txt3 hover:text-gold3 transition-colors font-mono"><Pencil size={12} /> Editar</button>
              )}
            </div>
            {membro && editMembro ? (
              <div className="space-y-3">
                {([
                  ['policial', 'Nome do policial', 'Ex.: Peter Wolf'],
                  ['badge', 'Badge', 'Ex.: 4521'],
                  ['passaporte', 'Passaporte / ID', 'Ex.: 10293'],
                  ['patenteNPD', 'Patente NPD', 'Ex.: Soldado'],
                  ['patenteInterna', 'Cargo / patente interna', 'Ex.: Operador'],
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
                <div className="flex gap-2 pt-1">
                  <button onClick={salvarEdicao} disabled={updateMeuMembro.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
                    <Save size={14} /> {updateMeuMembro.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => setEditMembro(false)} className="px-3 py-2 rounded-lg border border-bdr2 text-txt2 text-sm hover:text-txt transition-colors">Cancelar</button>
                </div>
              </div>
            ) : membro ? (
              <>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-txt2">Nome</dt><dd className="text-txt font-medium">{membro.policial}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Badge</dt><dd className="text-txt font-medium font-mono">{membro.badge || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Passaporte</dt><dd className="text-txt font-medium font-mono">{membro.passaporte || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Patente</dt><dd className="text-txt font-medium">{membro.patenteInterna || membro.patenteNPD || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Status</dt><dd className="text-txt font-medium">{membro.status}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2"><CalendarDays size={12} className="inline mr-1" />Entrada</dt><dd className="text-txt font-medium">{fmt(membro.entrada)}</dd></div>
                  <div className="flex justify-between"><dt className="text-txt2">Última promoção</dt><dd className="text-txt font-medium">{fmt(membro.promocao)}</dd></div>
                </dl>
                <button onClick={() => link.mutate(null, { onSuccess: () => addToast('success', 'Desvinculado.') })} className="mt-4 w-full text-xs text-txt3 hover:text-red transition-colors font-mono">Desvincular</button>
              </>
            ) : (
              <div>
                <p className="text-xs text-txt3 mb-3">Vincule seu perfil de membro para ver seu desempenho e ranking.</p>
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
        </div>

        {/* Desempenho */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Desempenho operacional</p>
            <h2 className="text-xl font-semibold text-txt">Estatísticas</h2>
          </div>
          {membro && desempenho ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat icon={Trophy} label="Ranking" value={desempenho.posicao ? `${desempenho.posicao}º` : '—'} color="#f5c451" />
                <Stat icon={Target} label="QRUs sucedidas" value={desempenho.sucedidas} color="#3a72c4" />
                <Stat icon={Percent} label="Aproveitamento" value={`${desempenho.winRate}%`} color="#2ecc71" />
                <Stat icon={Crosshair} label="Total de ações" value={desempenho.total} color="#8fb8ee" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-bdr rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Award size={16} className="text-green" /><span className="text-sm text-txt2">Vitórias</span></div>
                  <span className="text-2xl font-bold text-green">{desempenho.vitorias}</span>
                </div>
                <div className="bg-card border border-bdr rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Shield size={16} className="text-red" /><span className="text-sm text-txt2">Derrotas</span></div>
                  <span className="text-2xl font-bold text-red">{desempenho.derrotas}</span>
                </div>
              </div>
              <div className="bg-card border border-bdr rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] text-txt2 tracking-wider uppercase">Aproveitamento</span>
                  <span className="text-sm font-bold text-gold3">{desempenho.winRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-bdr overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-gold to-gold3" style={{ width: `${desempenho.winRate}%` }} /></div>
              </div>
            </>
          ) : (
            <div className="border border-bdr rounded-xl bg-card py-16 text-center">
              <Trophy size={30} className="text-txt3 mx-auto mb-3" />
              <p className="text-txt2 text-sm">Vincule seu perfil de membro para ver seu desempenho.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
