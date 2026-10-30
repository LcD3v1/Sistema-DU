import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck, Check, ExternalLink } from 'lucide-react'
import { ICONES_TERMOS } from '@/components/ui/iconesTermos'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useMe } from '@/hooks/useMe'
import { DOCUMENTOS, EMPRESAS, TERMOS } from '@/content/termos'

// Aceite guardado neste navegador (só versão, data e o nº das contas que aceitaram aqui — nada sensível).
// Logado: o aceite que vale é o da conta no servidor; o daqui só evita pedir de novo enquanto o
// registro não chega (servidor fora, IP limitado…) e é reenviado sozinho.
const KEY = 'du_termos_aceite'
const EASE = [0.16, 1, 0.3, 1] as const
// Telas onde o aceite não deve cobrir: a própria leitura dos termos e o retorno do OAuth
const SEM_POPUP = ['/termos']
// Aceitou na tela de login há pouco (antes de entrar): vale para a conta que acabou de entrar
const JANELA_LOGIN_MS = 30 * 60_000

interface AceiteLocal { versao?: string; em?: string; contas?: number[] }
function lerLocal(): AceiteLocal | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AceiteLocal | null
    return v?.versao === TERMOS.versao ? v : null
  } catch { return null }
}
function marcarNoNavegador(contaId?: number): void {
  const atual = lerLocal()
  const contas = [...new Set([...(atual?.contas ?? []), ...(contaId ? [contaId] : [])])].slice(-20)
  try { localStorage.setItem(KEY, JSON.stringify({ versao: TERMOS.versao, em: new Date().toISOString(), contas })) } catch { /* storage bloqueado */ }
}
const aceitoPelaConta = (contaId: number) => lerLocal()?.contas?.includes(contaId) === true
function aceitoAgoraNoNavegador(): boolean {
  const v = lerLocal()
  return !!v && Date.now() - Date.parse(v.em ?? '') < JANELA_LOGIN_MS
}

/**
 * Aceite dos documentos legais (Termos de Uso, Privacidade, Cookies, Propriedade
 * Intelectual, Licença de Uso e Responsabilidades).
 * Visitante: aparece na primeira visita (por navegador). Logado: aparece até a
 * conta aceitar a versão vigente — e de novo sempre que a versão mudar.
 * Aceitou: fecha na hora e não volta mais para aquela conta; o registro no servidor
 * é reenviado em segundo plano até dar certo.
 */
export default function TermoAceite() {
  const { pathname } = useLocation()
  const token = useAuthStore(s => s.token)
  const restaurando = useAuthStore(s => s.restaurando)
  const logout = useAuthStore(s => s.logout)
  const { data: me } = useMe()
  const [localOk, setLocalOk] = useState(() => lerLocal() !== null)
  const [, setVersaoLocal] = useState(0)   // re-renderiza depois de marcar a conta no navegador
  const [concordo, setConcordo] = useState(false)
  const [recusado, setRecusado] = useState(false)

  const aceitar = useMutation({
    mutationFn: () => api.post('/auth/me/termos', { versao: TERMOS.versao }),
    retry: 3,
    retryDelay: n => Math.min(15_000 * 2 ** n, 60_000),
    onSuccess: () => {
      queryClient.setQueryData<typeof me>(['me'], old => old && { ...old, termos: { atual: TERMOS.versao, aceita: TERMOS.versao } })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  const servidorPendente = !!token && !!me && me.termos?.aceita !== TERMOS.versao
  const pendenteConta = servidorPendente && !aceitoPelaConta(me.contaId) && !aceitoAgoraNoNavegador()

  // Aceitou neste navegador (agora há pouco no login, ou antes com esta conta) e o servidor ainda não
  // registrou: envia sozinho, sem mostrar os termos de novo
  const enviouSozinho = useRef<number | null>(null)
  useEffect(() => {
    if (!servidorPendente || !me || enviouSozinho.current === me.contaId) return
    const jaAceitou = aceitoPelaConta(me.contaId) || aceitoAgoraNoNavegador()
    if (!jaAceitou) return
    enviouSozinho.current = me.contaId
    marcarNoNavegador(me.contaId)
    aceitar.mutate()
  }, [servidorPendente, me, aceitar])
  const pendenteVisitante = !token && !restaurando && !localOk
  const aberto = !SEM_POPUP.some(p => pathname.startsWith(p)) && (pendenteConta || pendenteVisitante)

  // Fechou: desmarca "concordo" e o aviso de recusa (ajuste durante a renderização, sem efeito)
  const [abertoAntes, setAbertoAntes] = useState(aberto)
  if (aberto !== abertoAntes) { setAbertoAntes(aberto); if (!aberto) { setConcordo(false); setRecusado(false) } }

  function confirmar() {
    if (!concordo) return
    // Fecha na hora: o aceite fica marcado para esta conta e o registro vai para o servidor
    marcarNoNavegador(me?.contaId)
    setLocalOk(true)
    setVersaoLocal(v => v + 1)
    if (token && me) { enviouSozinho.current = me.contaId; aceitar.mutate() }
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="termos"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[10000] grid place-items-center p-4"
          style={{ background: 'rgba(4,5,8,0.84)', backdropFilter: 'blur(4px)' }}
          role="dialog" aria-modal="true" aria-labelledby="termos-titulo"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.34, ease: EASE }}
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border border-bdr2 overflow-hidden shadow-2xl"
            style={{ background: 'linear-gradient(180deg,#121212,#0b0b0b)' }}
          >
            {/* Cabeçalho */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bdr">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-gold/15 border border-gold/40 flex items-center justify-center">
                <ShieldCheck size={20} className="text-gold3" />
              </div>
              <div>
                <p className="font-mono text-[10px] text-gold3 tracking-[0.28em] uppercase mb-1">{EMPRESAS}</p>
                <h2 id="termos-titulo" className="text-xl font-bold text-txt leading-tight">
                  {me?.termos?.aceita ? 'Nossos termos foram atualizados' : 'Antes de continuar'}
                </h2>
                <p className="text-[13px] text-txt2 mt-1.5 leading-relaxed">
                  Para usar o sistema DU, confirme que leu e concorda com os documentos abaixo.
                </p>
              </div>
            </div>

            {/* Corpo */}
            <div className="px-6 py-4 overflow-y-auto">
              {recusado && (
                <div className="mb-4 px-3 py-2.5 rounded-lg border border-red/40 bg-red/10 text-[12.5px] text-txt2 leading-relaxed">
                  É preciso concordar com os termos para usar o sistema.
                  {token && (
                    <button type="button" onClick={() => void logout()} className="ml-1 underline text-txt hover:text-gold3">
                      Sair da conta
                    </button>
                  )}
                </div>
              )}
              <ul className="flex flex-col gap-2">
                {DOCUMENTOS.map(d => {
                  const Icone = ICONES_TERMOS[d.id]
                  return (
                    <li key={d.id}>
                      <Link to={`/termos#${d.id}`} target="_blank" rel="noopener"
                        className="group flex items-start gap-3 rounded-xl border border-bdr px-3.5 py-3 hover:border-gold/40 hover:bg-gold/5 transition-colors">
                        <Icone size={17} className="text-gold3 shrink-0 mt-0.5" />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-txt">
                            {d.titulo}
                            <ExternalLink size={12} className="text-txt3 group-hover:text-gold3 transition-colors" />
                          </span>
                          <span className="block text-[12.5px] text-txt2 leading-snug mt-0.5">{d.resumo}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-4 pt-3.5 border-t border-dashed border-bdr flex flex-wrap gap-y-2 gap-x-6">
                {[['Vigência', TERMOS.vigencia], ['Atualização', TERMOS.atualizacao], ['Lei aplicável', TERMOS.leiAplicavel]].map(([k, v]) => (
                  <div key={k}><p className="font-mono text-[10px] text-txt3 tracking-wider uppercase">{k}</p><p className="text-[11px] text-txt2 mt-0.5">{v}</p></div>
                ))}
              </div>
            </div>

            {/* Rodapé */}
            <div className="px-6 pt-4 pb-5 border-t border-bdr bg-black/20">
              <label className="group flex gap-3 items-start cursor-pointer select-none mb-4">
                <input
                  type="checkbox" checked={concordo}
                  onChange={e => { setConcordo(e.target.checked); if (e.target.checked) setRecusado(false) }}
                  className="peer sr-only"
                />
                <span className="w-5 h-5 mt-0.5 shrink-0 rounded-md border-[1.5px] border-bdrg bg-white/[0.02] grid place-items-center transition-colors peer-checked:bg-gold peer-checked:border-gold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold peer-focus-visible:outline-offset-2">
                  <Check size={13} strokeWidth={3.2} className={`text-white transition-opacity ${concordo ? 'opacity-100' : 'opacity-0'}`} />
                </span>
                <span className="text-[13.5px] leading-snug text-txt">
                  Li e concordo com os Termos de Uso, a Política de Privacidade, a Política de Cookies, a Política de Propriedade Intelectual, a Licença de Uso e os Termos de Responsabilidade da {EMPRESAS}.
                </span>
              </label>
              <div className="flex gap-2.5">
                <button
                  type="button" onClick={() => setRecusado(true)}
                  className="px-4 py-3 rounded-xl border border-bdr2 text-txt2 text-sm font-medium hover:text-txt hover:border-txt2 transition-colors"
                >
                  Recusar
                </button>
                <button
                  type="button" onClick={confirmar} disabled={!concordo}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-gold text-white hover:bg-gold2 transition-colors disabled:bg-card2 disabled:text-txt3 disabled:cursor-not-allowed"
                >
                  Aceitar e continuar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
