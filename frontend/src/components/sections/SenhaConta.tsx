import { useState } from 'react'
import { KeyRound, Eye, EyeOff, MonitorX } from 'lucide-react'
import { confirmar } from '@/lib/dialogo'
import api from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useRedefinirSenha } from '@/hooks/useContas'

const erroApi = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao

const campo = 'w-full bg-card2 border border-bdr2 rounded-lg px-3 py-2 text-sm font-mono text-txt placeholder-txt3 outline-none focus:border-gold transition-colors'

/** Perfil: troca a própria senha. Ao trocar, a sessão é encerrada e a pessoa entra de novo. */
export function TrocarSenha() {
  const { addToast } = useUIStore()
  const logout = useAuthStore(s => s.logout)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nova.length < 8) { addToast('error', 'A nova senha precisa de pelo menos 8 caracteres.'); return }
    if (nova !== confirma) { addToast('error', 'A confirmação não bate com a nova senha.'); return }
    setEnviando(true)
    try {
      await api.put('/auth/me/senha', { senhaAtual: atual, novaSenha: nova })
      addToast('success', 'Senha alterada. Entre de novo com a nova senha.')
      logout()
    } catch (err) {
      addToast('error', erroApi(err, 'Não foi possível trocar a senha.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="bg-card border border-bdr rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-txt flex items-center gap-2"><KeyRound size={15} className="text-gold" /> Trocar senha</h3>
      <input type={ver ? 'text' : 'password'} value={atual} onChange={e => setAtual(e.target.value)} placeholder="Senha atual" autoComplete="current-password" className={campo} />
      <div className="relative">
        <input type={ver ? 'text' : 'password'} value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)" autoComplete="new-password" className={`${campo} pr-10`} />
        <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar senhas' : 'Mostrar senhas'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-txt3 hover:text-txt">{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>
      <input type={ver ? 'text' : 'password'} value={confirma} onChange={e => setConfirma(e.target.value)} placeholder="Confirme a nova senha" autoComplete="new-password" className={campo} />
      <button type="submit" disabled={enviando || !atual || !nova}
        className="w-full px-4 py-2.5 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors disabled:opacity-50">
        {enviando ? 'Salvando...' : 'Salvar nova senha'}
      </button>
      <p className="text-[11px] text-txt3">Ao trocar a senha, todas as sessões abertas em outros aparelhos são encerradas.</p>
      <button type="button" onClick={async () => {
        if (!(await confirmar({ titulo: 'Sair de todos os aparelhos', mensagem: 'Encerrar a sessão em todos os aparelhos, inclusive neste? Use se perdeu um aparelho ou desconfia de acesso indevido.', tom: 'perigo', textoConfirmar: 'Sair de todos' }))) return
        try { await api.post('/auth/sair-de-todos'); addToast('success', 'Sessões encerradas. Entre de novo.'); logout() }
        catch (err) { addToast('error', erroApi(err, 'Não foi possível encerrar as sessões.')) }
      }} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red/40 text-red text-xs font-mono hover:bg-red/10 transition-colors">
        <MonitorX size={14} /> Sair de todos os aparelhos
      </button>
    </form>
  )
}

/** Configurações → Contas: admin define uma senha nova (ex.: membro esqueceu a dele). */
export function RedefinirSenhaBotao({ contaId, nome }: { contaId: number; nome: string }) {
  const { addToast } = useUIStore()
  const redefinir = useRedefinirSenha()
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} title={`Redefinir a senha de ${nome}`} aria-label={`Redefinir a senha de ${nome}`}
        className="text-txt3 hover:text-gold3 transition-colors">
        <KeyRound size={14} />
      </button>
    )
  }
  return (
    <form className="flex items-center gap-1.5" onSubmit={e => {
      e.preventDefault()
      if (senha.length < 8) { addToast('error', 'A senha precisa de pelo menos 8 caracteres.'); return }
      redefinir.mutate({ id: contaId, novaSenha: senha }, {
        onSuccess: () => { addToast('success', `Senha de ${nome} redefinida. Passe a nova senha para a pessoa.`); setSenha(''); setAberto(false) },
        onError: err => addToast('error', erroApi(err, 'Não foi possível redefinir a senha.')),
      })
    }}>
      <input autoFocus type="text" value={senha} onChange={e => setSenha(e.target.value)} placeholder="nova senha" autoComplete="off"
        className="w-28 bg-card2 border border-bdr2 rounded px-2 py-0.5 text-xs font-mono text-txt outline-none focus:border-gold" />
      <button type="submit" disabled={redefinir.isPending} className="text-[11px] font-mono text-gold3 hover:text-gold">salvar</button>
      <button type="button" onClick={() => { setAberto(false); setSenha('') }} className="text-[11px] font-mono text-txt3 hover:text-txt">cancelar</button>
    </form>
  )
}
