import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props { children: ReactNode; telaCheia?: boolean }
interface State { erro: boolean }

/**
 * Se uma página falhar ao carregar (sem conexão, versão nova publicada…), mostra um aviso
 * com botão de recarregar em vez de deixar a tela em branco. Não exibe detalhes do erro.
 */
export default class LimiteErro extends Component<Props, State> {
  state: State = { erro: false }
  static getDerivedStateFromError(): State { return { erro: true } }
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className={`${this.props.telaCheia ? 'altura-tela' : 'min-h-[60vh]'} w-full flex items-center justify-center p-6 bg-bg`} role="alert">
        <div className="max-w-sm text-center bg-card border border-bdr2 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-txt">Não foi possível carregar esta tela</h2>
          <p className="text-sm text-txt2 mt-1.5">Verifique sua conexão ou recarregue para pegar a versão mais recente.</p>
          <button onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold2 transition-colors">
            <RefreshCw size={14} /> Recarregar
          </button>
        </div>
      </div>
    )
  }
}
