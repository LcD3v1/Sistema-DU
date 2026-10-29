import { useRef, useState } from 'react'
import { X, Upload, Link2, Trash2, Save, ImagePlus, Phone, User } from 'lucide-react'
import {
  useAtualizarNo, useRemoverNo, enviarFotoArvore, paraEntrada,
  type NoArvore, type FotoArvore as Foto, type DadosNo,
} from '@/hooks/useArvores'
import { ACEITA_FOTO, mensagemErroFoto } from '@/lib/imagemArquivo'
import { linkSeguro } from '@/lib/plataformas'
import { useUIStore } from '@/store/uiStore'
import { confirmar } from '@/lib/dialogo'
import FotoArvore from './FotoArvore'

type Erro = { response?: { data?: { error?: string } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao
const campo = 'w-full bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold'
const rotulo = 'block font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1'
const STATUS = ['Suspeito', 'Investigado', 'Líder', 'Testemunha', 'Vítima', 'Informante', 'Preso', 'Foragido', 'Falecido']

type Texto = Exclude<keyof DadosNo, 'x' | 'y'>
const CAMPOS: [Texto, string, string, number][] = [
  ['nome', 'Nome', 'Ex.: John Doe', 80], ['apelido', 'Apelido / vulgo', 'Ex.: Lobo', 60],
  ['funcao', 'Função no grupo', 'Ex.: Gerente da boca', 60], ['faccao', 'Facção / grupo', 'Ex.: Ballas', 60],
  ['telefone', 'Celular', 'Ex.: (555) 123-4567', 25], ['endereco', 'Endereço / ponto', 'Ex.: Grove Street, 12', 120],
  ['veiculo', 'Veículo / placa', 'Ex.: Sultan preto · ABC1234', 80],
]

/** Painel do card: dados da pessoa, foto principal e fotos extras (upload ou link). */
export default function EditorCard({ arvoreId, no, podeEditar, onFechar }: { arvoreId: number; no: NoArvore; podeEditar: boolean; onFechar: () => void }) {
  const { addToast } = useUIStore()
  const atualizar = useAtualizarNo(arvoreId)
  const remover = useRemoverNo(arvoreId)
  const [form, setForm] = useState<Record<Texto, string>>(() => ({
    nome: no.nome, apelido: no.apelido, funcao: no.funcao, faccao: no.faccao, telefone: no.telefone,
    endereco: no.endereco, veiculo: no.veiculo, status: no.status, observacoes: no.observacoes,
  }))
  const [foto, setFoto] = useState<Foto | null>(no.foto)
  const [fotos, setFotos] = useState<Foto[]>(no.fotos)
  const [enviando, setEnviando] = useState<'principal' | 'extra' | null>(null)
  const [link, setLink] = useState('')
  const [destinoLink, setDestinoLink] = useState<'principal' | 'extra'>('principal')
  const inputPrincipal = useRef<HTMLInputElement>(null)
  const inputExtra = useRef<HTMLInputElement>(null)

  const mudouTexto = (Object.keys(form) as Texto[]).filter(k => form[k] !== no[k])
  const mudouFoto = JSON.stringify(foto) !== JSON.stringify(no.foto)
  const mudouFotos = JSON.stringify(fotos) !== JSON.stringify(no.fotos)
  const alterado = mudouTexto.length > 0 || mudouFoto || mudouFotos

  async function subir(arquivo: File | undefined, destino: 'principal' | 'extra') {
    if (!arquivo) return
    setEnviando(destino)
    try {
      const f = await enviarFotoArvore(arquivo)
      if (destino === 'principal') setFoto(f)
      else setFotos(l => [...l, f].slice(0, 12))
    } catch (e) {
      addToast('error', (e as Erro)?.response ? erroApi(e, 'Não foi possível enviar a foto.') : mensagemErroFoto(e))
    } finally { setEnviando(null) }
  }
  function usarLink() {
    const url = link.trim()
    if (!linkSeguro(url)) { addToast('error', 'Cole um link http:// ou https:// de imagem.'); return }
    if (destinoLink === 'principal') setFoto({ url })
    else setFotos(l => [...l, { url }].slice(0, 12))
    setLink('')
  }

  function salvar() {
    atualizar.mutate({
      id: no.id,
      ...Object.fromEntries(mudouTexto.map(k => [k, form[k].trim()])),
      ...(mudouFoto || mudouFotos ? { foto: foto ? paraEntrada(foto) : null, fotos: fotos.map(paraEntrada) } : {}),
    }, {
      onSuccess: () => { addToast('success', 'Card salvo.'); onFechar() },
      onError: e => addToast('error', erroApi(e, 'Não foi possível salvar o card.')),
    })
  }
  async function apagar() {
    if (!(await confirmar({ titulo: 'Remover card', mensagem: `Remover ${no.nome || 'este card'} da árvore? As linhas ligadas a ele também saem.`, tom: 'perigo', textoConfirmar: 'Remover' }))) return
    remover.mutate(no.id, { onSuccess: () => { addToast('success', 'Card removido.'); onFechar() }, onError: e => addToast('error', erroApi(e, 'Não foi possível remover.')) })
  }

  return (
    <aside className="absolute top-0 right-0 bottom-0 z-30 w-full sm:w-105 bg-card/97 backdrop-blur border-l border-bdr shadow-2xl flex flex-col" aria-label="Dados da pessoa"
      onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-bdr">
        <User size={16} className="text-gold" />
        <h2 className="flex-1 text-sm font-semibold text-txt truncate">{no.nome || 'Nova pessoa'}</h2>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1.5 rounded text-txt2 hover:text-txt hover:bg-card2"><X size={16} /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Foto principal */}
        <div className="flex gap-3">
          <FotoArvore foto={foto} nome={form.nome || form.apelido} className="w-28 h-28 rounded-xl shrink-0" />
          {podeEditar && (
            <div className="flex-1 space-y-2">
              <p className={rotulo}>Foto principal</p>
              <input ref={inputPrincipal} type="file" accept={ACEITA_FOTO} className="hidden" onChange={e => { void subir(e.target.files?.[0], 'principal'); e.target.value = '' }} />
              <button type="button" disabled={enviando !== null} onClick={() => inputPrincipal.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-xs font-medium disabled:opacity-50">
                <Upload size={13} /> {enviando === 'principal' ? 'Enviando…' : foto ? 'Trocar foto' : 'Enviar foto'}
              </button>
              {foto && <button type="button" onClick={() => setFoto(null)} className="w-full text-[11px] text-txt3 hover:text-red">Tirar foto</button>}
            </div>
          )}
        </div>

        {/* Foto por link (principal ou extra) */}
        {podeEditar && (
          <div className="rounded-lg bg-card2 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <Link2 size={13} className="text-txt3" />
              <span className="font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase flex-1">Foto por link</span>
              <select value={destinoLink} onChange={e => setDestinoLink(e.target.value as 'principal' | 'extra')} aria-label="Usar o link como"
                className="bg-card rounded px-1.5 py-1 text-[11px] text-txt2 outline-none">
                <option value="principal">como principal</option><option value="extra">como foto extra</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input value={link} onChange={e => setLink(e.target.value)} maxLength={2048} placeholder="https://…/foto.png" aria-label="Link da foto"
                onKeyDown={e => { if (e.key === 'Enter') usarLink() }} className={`${campo} bg-card`} />
              <button type="button" onClick={usarLink} disabled={!link.trim()} className="px-3 rounded-lg bg-card text-xs text-gold3 hover:text-gold disabled:opacity-40">Usar</button>
            </div>
          </div>
        )}

        {/* Dados */}
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS.map(([k, label, ph, max]) => (
            <label key={k} className={k === 'endereco' || k === 'veiculo' ? 'sm:col-span-2' : ''}>
              <span className={rotulo}>{k === 'telefone' && <Phone size={10} className="inline mr-1" />}{label}</span>
              <input value={form[k]} maxLength={max} disabled={!podeEditar} placeholder={ph}
                inputMode={k === 'telefone' ? 'tel' : undefined}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className={campo} />
            </label>
          ))}
          <label className="sm:col-span-2">
            <span className={rotulo}>Situação</span>
            <input value={form.status} maxLength={40} disabled={!podeEditar} list="arvore-status" placeholder="Ex.: Suspeito"
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={campo} />
            <datalist id="arvore-status">{STATUS.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="sm:col-span-2">
            <span className={rotulo}>Observações</span>
            <textarea value={form.observacoes} maxLength={2000} rows={4} disabled={!podeEditar} placeholder="Tudo o que se sabe da pessoa…"
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className={campo} />
          </label>
        </div>

        {/* Fotos extras */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className={rotulo}>Mais fotos ({fotos.length}/12)</span>
            {podeEditar && (
              <>
                <input ref={inputExtra} type="file" accept={ACEITA_FOTO} className="hidden" onChange={e => { void subir(e.target.files?.[0], 'extra'); e.target.value = '' }} />
                <button type="button" disabled={enviando !== null || fotos.length >= 12} onClick={() => inputExtra.current?.click()}
                  className="flex items-center gap-1 text-[11px] font-mono text-gold3 hover:text-gold disabled:opacity-40">
                  <ImagePlus size={13} /> {enviando === 'extra' ? 'Enviando…' : 'Adicionar'}
                </button>
              </>
            )}
          </div>
          {fotos.length === 0 ? <p className="text-[11px] text-txt3">Nenhuma foto extra.</p> : (
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative group">
                  <FotoArvore foto={f} nome={form.nome} className="w-full aspect-square rounded-lg" />
                  {podeEditar && (
                    <button type="button" aria-label="Remover foto" onClick={() => setFotos(l => l.filter((_, k) => k !== i))}
                      className="absolute top-1 right-1 p-1 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><X size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {podeEditar && (
        <footer className="flex items-center gap-2 px-4 py-3 border-t border-bdr">
          <button type="button" onClick={() => void apagar()} disabled={remover.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red hover:bg-red/10 disabled:opacity-50"><Trash2 size={14} /> Remover</button>
          <span className="flex-1" />
          <button type="button" onClick={onFechar} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Cancelar</button>
          <button type="button" onClick={salvar} disabled={!alterado || atualizar.isPending || enviando !== null}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium disabled:opacity-50">
            <Save size={15} /> {atualizar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      )}
    </aside>
  )
}
