import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Check, Printer } from 'lucide-react'
import Brand from '@/components/ui/Brand'
import { useAuthStore } from '@/store/authStore'
import { ICONES_TERMOS } from '@/components/ui/iconesTermos'
import { DOCUMENTOS, EMPRESAS, TERMOS } from '@/content/termos'

const EASE = [0.16, 1, 0.3, 1] as const

/** Página pública (sem login) com os documentos legais. A aba vem do hash: /termos#privacidade */
export default function TermosPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const logado = !!useAuthStore(s => s.token)
  const ativo = (DOCUMENTOS.find(d => `#${d.id}` === hash) ?? DOCUMENTOS[0])

  useEffect(() => { document.title = `${ativo.titulo} · DU` }, [ativo.titulo])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [ativo.id])

  return (
    <div className="min-h-screen w-full bg-bg text-txt">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 border-b border-bdr bg-bg/90 backdrop-blur print:static">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link to={logado ? '/dashboard' : '/login'}
            className="flex items-center gap-1.5 text-[13px] text-txt2 hover:text-txt transition-colors print:hidden">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">{logado ? 'Voltar ao painel' : 'Voltar ao login'}</span>
          </Link>
          <div className="flex items-center gap-2.5 mx-auto sm:mx-0 sm:ml-4">
            <Brand size={30} />
            <div className="leading-tight">
              <p className="font-mono text-[9px] text-gold3 tracking-[0.28em] uppercase">Central de termos</p>
              <p className="text-[13px] font-semibold">{EMPRESAS}</p>
            </div>
          </div>
          <button type="button" onClick={() => window.print()}
            className="ml-auto hidden sm:flex items-center gap-1.5 text-[12px] text-txt2 hover:text-txt border border-bdr2 rounded-lg px-3 py-1.5 transition-colors print:hidden">
            <Printer size={14} /> Imprimir / PDF
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
        {/* Navegação entre documentos */}
        <nav aria-label="Documentos" className="mb-6 lg:mb-0 print:hidden">
          <ul className="flex lg:flex-col gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:sticky lg:top-24">
            {DOCUMENTOS.map(d => {
              const Icone = ICONES_TERMOS[d.id]
              const sel = d.id === ativo.id
              return (
                <li key={d.id} className="shrink-0">
                  <button type="button" onClick={() => navigate({ hash: d.id }, { replace: true })}
                    aria-current={sel ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors ${
                      sel ? 'border-gold/50 bg-gold/10 text-txt' : 'border-bdr text-txt2 hover:text-txt hover:border-bdr2'}`}>
                    <Icone size={16} className={sel ? 'text-gold3' : 'text-txt3'} />
                    <span className="whitespace-nowrap font-medium">{d.titulo}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Documento */}
        <AnimatePresence mode="wait">
          <motion.article key={ativo.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="min-w-0">
            <p className="font-mono text-[10px] text-gold3 tracking-[0.28em] uppercase mb-2">{EMPRESAS}</p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{ativo.titulo}</h1>
            <p className="text-[14px] text-txt2 mt-2 max-w-2xl">{ativo.resumo}</p>

            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-y border-dashed border-bdr py-3.5">
              {[['Vigência', TERMOS.vigencia], ['Atualização', TERMOS.atualizacao], ['Versão', TERMOS.versao], ['Lei aplicável', TERMOS.leiAplicavel]].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[10px] text-txt3 tracking-wider uppercase">{k}</dt>
                  <dd className="text-[12px] text-txt2 mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-col gap-8">
              {ativo.secoes.map(s => (
                <section key={s.titulo}>
                  <h2 className="text-[16px] font-semibold mb-3">{s.titulo}</h2>
                  {s.texto?.map((p, i) => (
                    <p key={i} className="text-[14px] leading-relaxed text-txt2 mb-3 max-w-3xl">{p}</p>
                  ))}
                  {s.itens && (
                    <ul className="flex flex-col gap-2.5 max-w-3xl">
                      {s.itens.map(it => (
                        <li key={it.t} className="flex gap-2.5 text-[14px] leading-relaxed text-txt2">
                          <Check size={15} className="text-gold3 shrink-0 mt-1" strokeWidth={2.6} />
                          <span><span className="text-txt font-medium">{it.t}</span> {it.d}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>

            <footer className="mt-12 pt-5 border-t border-bdr text-[12px] text-txt3 leading-relaxed">
              © {new Date().getFullYear()} {EMPRESAS}. Todos os direitos reservados. Dúvidas sobre estes documentos:
              fale com o comando da unidade ou com a Nata Studios pelo canal oficial da unidade.
            </footer>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  )
}
