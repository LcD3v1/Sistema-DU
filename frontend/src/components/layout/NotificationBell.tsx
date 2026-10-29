import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Send, CheckCircle2, XCircle, Hourglass, ChevronsUp, ChevronsDown,
  AlertTriangle, CalendarDays, UserCheck, X, CheckCheck, Megaphone, Shirt, UserPlus, ClipboardCheck, ClipboardList, UserX, Users, BookOpen,
  FileSearch, ScrollText, FolderArchive, Images, ShieldAlert,
} from 'lucide-react'
import {
  useNotificacoes, useMarcarTodasLidas, useMarcarLida, useApagarNotificacao,
  type Notificacao, type TipoNotificacao,
} from '@/hooks/useNotificacoes'

const ICONE: Record<TipoNotificacao, { icon: typeof Bell; cor: string }> = {
  solicitacao:        { icon: Send,          cor: '#8b5cf6' },
  pendente_aprovacao: { icon: Hourglass,     cor: '#f39c12' },
  aprovada:           { icon: CheckCircle2,  cor: '#2ecc71' },
  recusada:           { icon: XCircle,       cor: '#e74c3c' },
  promocao:           { icon: ChevronsUp,    cor: '#2ecc71' },
  rebaixamento:       { icon: ChevronsDown,  cor: '#e67e22' },
  advertencia:        { icon: AlertTriangle, cor: '#f1c40f' },
  ausencia:           { icon: CalendarDays,  cor: '#8b5cf6' },
  cadastro:           { icon: UserCheck,     cor: '#8b5cf6' },
  aviso:              { icon: Megaphone,     cor: '#8b5cf6' },
  fardamento:         { icon: Shirt,         cor: '#9b59b6' },
  recrutamento:       { icon: UserPlus,      cor: '#1abc9c' },
  apreensao:          { icon: ClipboardCheck, cor: '#8b5cf6' },
  exoneracao:         { icon: UserX,         cor: '#e74c3c' },
  membro:             { icon: Users,         cor: '#2ecc71' },
  curso:              { icon: BookOpen,      cor: '#b8860b' },
  relatorio:          { icon: FileSearch,    cor: '#8b5cf6' },
  boletim:            { icon: ScrollText,    cor: '#8b5cf6' },
  inquerito:          { icon: FolderArchive, cor: '#8b5cf6' },
  investigacao:       { icon: ClipboardList, cor: '#8b5cf6' },
  galeria:            { icon: Images,        cor: '#8b5cf6' },
  seguranca:          { icon: ShieldAlert,   cor: '#e74c3c' },
}

function tempoRelativo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return `há ${d} dia${d > 1 ? 's' : ''}`
}

/** Sininho do topo: notificações do usuário (guardadas por 7 dias). */
export default function NotificationBell() {
  const navigate = useNavigate()
  const { data } = useNotificacoes()
  const marcarTodas = useMarcarTodasLidas()
  const marcarLida = useMarcarLida()
  const apagar = useApagarNotificacao()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  const lista = data?.notificacoes ?? []
  const naoLidas = data?.naoLidas ?? 0

  function abrir(n: Notificacao) {
    if (!n.lida) marcarLida.mutate(n.id)
    if (n.link) { setAberto(false); navigate(n.link) }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto(v => !v)}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
          aberto ? 'border-gold/50 bg-gold/10 text-gold3' : 'border-bdr2 text-txt2 hover:text-txt hover:border-bdr2 hover:bg-white/3'
        }`}
        aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ''}`}
      >
        <Bell size={16} className="text-gold" />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-90 max-w-[calc(100vw-24px)] bg-card border border-bdr2 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-bdr">
              <p className="text-sm font-semibold text-txt">Notificações</p>
              {naoLidas > 0 && (
                <button onClick={() => marcarTodas.mutate()}
                  className="flex items-center gap-1 text-[11px] font-mono text-txt3 hover:text-gold3 transition-colors">
                  <CheckCheck size={13} /> Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-105 overflow-y-auto">
              {lista.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-txt3">
                  <Bell size={24} className="opacity-40" />
                  <p className="text-xs">Nenhuma notificação</p>
                </div>
              ) : lista.map(n => {
                const { icon: Icon, cor } = ICONE[n.tipo] ?? ICONE.solicitacao
                return (
                  <div key={n.id}
                    className={`group relative flex gap-3 px-4 py-3 border-b border-bdr/60 last:border-0 transition-colors ${
                      n.lida ? '' : 'bg-gold/4'
                    } ${n.link ? 'cursor-pointer hover:bg-white/3' : ''}`}
                    onClick={() => abrir(n)}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: cor + '1a', border: `1px solid ${cor}55` }}>
                      <Icon size={15} style={{ color: cor }} />
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <p className={`text-[13px] leading-snug ${n.lida ? 'text-txt2' : 'text-txt font-medium'}`}>{n.titulo}</p>
                      <p className="text-xs text-txt2 leading-snug mt-0.5">{n.mensagem}</p>
                      <p className="text-[10px] font-mono text-txt3 mt-1">{tempoRelativo(n.criadaEm)}</p>
                    </div>
                    {!n.lida && <span className="absolute right-4 top-4 w-2 h-2 rounded-full bg-gold" />}
                    <button
                      onClick={e => { e.stopPropagation(); apagar.mutate(n.id) }}
                      className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 text-txt3 hover:text-red transition-all"
                      aria-label="Apagar notificação">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>

            <p className="px-4 py-2 border-t border-bdr text-[10px] font-mono text-txt3 text-center">
              Notificações são apagadas automaticamente após 7 dias
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
