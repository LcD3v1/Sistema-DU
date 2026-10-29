import { Fragment, useState } from 'react'
import { Network, ArrowUp, ArrowDown, Trash2, Plus, Save, RefreshCw, Bot, AlertTriangle, Info, CheckCircle2, Clock } from 'lucide-react'
import {
  useHierarquia, useDiscordServidor, useSalvarHierarquia, usePublicarHierarquia, useCriarHierarquia, useExcluirHierarquia, chavePainel,
  type CargoHierarquia, type HierarquiaConfig, type PreviaPainel, type HierarquiaResp,
} from '@/hooks/useHierarquia'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import { queryClient } from '@/lib/queryClient'
import { confirmar } from '@/lib/dialogo'
import LoadingHud from '@/components/ui/LoadingHud'
import CampoImagem from '@/components/ui/CampoImagem'
import ImagensPainel from '@/components/ui/ImagensPainel'
import { envioGrandeDemais, imagemGrandeDemais, MAX_BYTES_IMAGEM } from '@/lib/imagensPainel'

type Erro = { response?: { status?: number; data?: { error?: string; config?: HierarquiaConfig } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao

const campo = 'w-full bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold transition-shadow'
const rotulo = 'block font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1.5'
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

/** Bloco numerado do formulário. */
function Secao({ n, titulo, descricao, children }: { n: number; titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-xl p-4 sm:p-5">
      <header className="flex items-start gap-3 mb-4">
        <span className="w-6 h-6 rounded-full bg-gold/15 text-gold3 text-xs font-mono flex items-center justify-center shrink-0">{n}</span>
        <div>
          <h2 className="text-sm font-semibold text-txt">{titulo}</h2>
          {descricao && <p className="text-[11px] text-txt3 mt-0.5">{descricao}</p>}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** Texto do painel com a formatação do Discord (**negrito**, *itálico*, @menção) — sem HTML cru. */
function TextoDiscord({ texto }: { texto: string }) {
  const limpo = (t: string) => t.replace(/\\(.)/g, '$1')
  return (
    <>
      {texto.split('\n').map((linha, i) => (
        <Fragment key={i}>
          {linha.split(/(\*\*(?:\\.|[^*])+\*\*|\*(?:\\.|[^*])+\*|@[^\s]+(?: [^\s@*]+)*)/g).filter(Boolean).map((p, j) => {
            if (p.startsWith('**') && p.endsWith('**')) return <strong key={j} className="font-semibold text-white">{limpo(p.slice(2, -2))}</strong>
            if (p.startsWith('*') && p.endsWith('*')) return <em key={j} className="text-[#b5bac1]">{limpo(p.slice(1, -1))}</em>
            if (p.startsWith('@')) return <span key={j} className="rounded px-0.5 bg-gold/30 text-[#c9cdfb]">{p}</span>
            return <span key={j}>{limpo(p)}</span>
          })}
          <br />
        </Fragment>
      ))}
    </>
  )
}

/** Prévia no visual do Discord (Componentes V2): barra roxa · título + resumo com a logo · linha · um bloco por cargo · linha · rodapé padrão. */
/** Imagens soltas da prévia numa posição (galeria: lado a lado, largas como no Discord). */
function GaleriaPrevia({ previa, posicao }: { previa: PreviaPainel; posicao: string }) {
  const imgs = (previa.imagens ?? []).filter(i => i.posicao === posicao)
  if (!imgs.length) return null
  // Uma imagem com lado: metade do painel (no Discord, a outra metade é um quadro transparente)
  const lado = imgs.length === 1 ? imgs[0].lado : null
  const foto = (url: string, i: number) => <img key={i} src={url} alt="" referrerPolicy="no-referrer" className="w-full max-h-64 rounded-md object-cover bg-[#1e1f22]" />
  return (
    <div className={`grid gap-1 my-2 ${imgs.length > 1 || lado ? 'grid-cols-2' : ''}`}>
      {lado === 'direita' && <span />}
      {imgs.map((img, i) => foto(img.url, i))}
    </div>
  )
}

function PreviaDiscord({ previa }: { previa: PreviaPainel | null }) {
  if (!previa) return <p className="text-xs text-txt3">O painel ainda não foi publicado. Configure ao lado e clique em <b>Salvar e publicar</b>.</p>
  return (
    <div className="rounded-md bg-[#2b2d31] border-l-4 border-gold pl-4 pr-4 py-3 text-[14px] leading-5.5 text-[#dbdee1] font-sans">
      <GaleriaPrevia previa={previa} posicao="topo" />
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white text-[24px] leading-tight wrap-break-word">{previa.titulo}</p>
        </div>
        {previa.logo && <img src={previa.logo} alt="" referrerPolicy="no-referrer" className="w-20 h-20 rounded-lg object-cover shrink-0" />}
      </div>
      <GaleriaPrevia previa={previa} posicao="titulo" />
      <hr className="my-3 border-[#3f4147]" />
      {previa.blocos?.length ? (
        <div className="space-y-3">
          {previa.blocos.map((b, i) => (
            <div key={i} className="wrap-break-word">
              <p className="font-bold text-white text-[20px] leading-tight mb-1"><TextoDiscord texto={b.titulo} /></p>
              {b.vago
                ? <p className="text-[12px] text-[#949ba4]">Vago</p>
                : b.membros.map((m, j) => (
                  <p key={j} className="border-l-4 border-[#4e5058] pl-2.5 my-0.5">
                    {m.startsWith('@') ? <span className="rounded px-0.5 bg-gold/30 text-[#c9cdfb]">{m}</span> : <span className="text-[#949ba4]">{m}</span>}
                  </p>
                ))}
              <GaleriaPrevia previa={previa} posicao={`bloco:${i}`} />
            </div>
          ))}
        </div>
      ) : <div className="wrap-break-word"><TextoDiscord texto={previa.texto} /></div>}
      <GaleriaPrevia previa={previa} posicao="fim" />
      <hr className="my-3 border-[#3f4147]" />
      <div className="flex items-center gap-1.5 text-[12px] text-[#b5bac1]">
        {/* Rodapé padrão: fotinha pequena + nome, embaixo à esquerda (no Discord a fotinha é um emoji do bot) */}
        {previa.rodapeIcone
          ? <img src={previa.rodapeIcone} alt="" referrerPolicy="no-referrer" className="w-4 h-4 rounded-full object-cover shrink-0" />
          : <span className="w-4 h-4 rounded-full bg-gold flex items-center justify-center shrink-0" title="Foto do bot"><Bot size={10} className="text-white" /></span>}
        <span className="min-w-0 flex-1 truncate font-semibold">{previa.rodape}</span>
      </div>
    </div>
  )
}

function Aviso({ tom, children }: { tom: 'erro' | 'info'; children: React.ReactNode }) {
  const Icone = tom === 'erro' ? AlertTriangle : Info
  return (
    <div role={tom === 'erro' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg px-3 py-2.5 text-xs ${tom === 'erro' ? 'bg-red/10 text-red' : 'bg-gold/10 text-gold3'}`}>
      <Icone size={15} className="shrink-0 mt-0.5" /><p className="leading-relaxed">{children}</p>
    </div>
  )
}

function BotaoIcone({ titulo, onClick, desativado, perigo, children }: { titulo: string; onClick: () => void; desativado?: boolean; perigo?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={desativado}
      className={`p-1.5 rounded text-txt2 disabled:opacity-30 ${perigo ? 'hover:text-red hover:bg-red/10' : 'hover:text-txt hover:bg-card'}`}>
      {children}
    </button>
  )
}

export default function HierarquiaPage() {
  // Qual hierarquia está aberta: 0 = principal; as outras são as criadas a mais
  const [painelId, setPainelId] = useState(0)
  const { data, isLoading, isError } = useHierarquia(painelId)
  const { canEdit } = usePerms()
  const podeEditar = canEdit('hierarquia')
  const discord = useDiscordServidor(podeEditar && Boolean(data?.discordConfigurado))
  const salvar = useSalvarHierarquia()
  const publicar = usePublicarHierarquia()
  const criar = useCriarHierarquia()
  const excluir = useExcluirHierarquia()
  const { addToast } = useUIStore()

  // Rascunho local: cada pessoa edita a própria cópia; ao salvar, o servidor confere a versão
  const [rascunho, setRascunho] = useState<HierarquiaConfig | null>(null)
  const config = data?.config
  const form = rascunho ?? config
  // Outra pessoa excluiu a hierarquia aberta: volta para a principal
  if (isError && painelId !== 0) { setPainelId(0); setRascunho(null) }
  if (isLoading || !data || !form || !config) return <LoadingHud />

  const alterado = rascunho !== null
  const { estado } = data
  const cargosDiscord = discord.data?.cargos ?? []
  const livres = cargosDiscord.filter(r => !form.cargos.some(c => c.roleId === r.id))

  const atualizar = (parcial: Partial<HierarquiaConfig>) => setRascunho({ ...form, ...parcial })
  const atualizarCargo = (i: number, parcial: Partial<CargoHierarquia>) => {
    const antes = `cargo:${form.cargos[i].roleId}`
    // Trocou o cargo do Discord: a imagem "depois deste cargo" acompanha
    const imagens = parcial.roleId ? form.imagens.map(img => (img.posicao === antes ? { ...img, posicao: `cargo:${parcial.roleId}` } : img)) : form.imagens
    atualizar({ cargos: form.cargos.map((c, k) => (k === i ? { ...c, ...parcial } : c)), imagens })
  }
  const mover = (i: number, d: -1 | 1) => {
    const cargos = [...form.cargos]
    ;[cargos[i], cargos[i + d]] = [cargos[i + d], cargos[i]]
    atualizar({ cargos })
  }
  const adicionarCargo = () => {
    const r = livres[0]
    if (!r) { addToast('error', 'Todos os cargos do servidor já estão no painel.'); return }
    atualizar({ cargos: [...form.cargos, { roleId: r.id, nome: r.nome.slice(0, 60), emoji: null }] })
  }
  const enviar = () => {
    const corpo = {
      id: form.id,
      titulo: form.titulo.trim(), logo: form.logo || null, canalId: form.canalId,
      rodapeTexto: form.rodapeTexto?.trim() || null, rodapeIcone: form.rodapeIcone || null,
      cargos: form.cargos.map(c => ({ roleId: c.roleId, nome: c.nome.trim(), emoji: c.emoji?.trim() || null })),
      imagens: form.imagens.filter(i => i.url),
      versao: form.versao,
    }
    const grande = imagemGrandeDemais([{ rotulo: 'Logo', url: corpo.logo }, { rotulo: 'Foto do rodapé', url: corpo.rodapeIcone }, ...corpo.imagens.map((i, k) => ({ rotulo: `Imagem ${k + 1}`, url: i.url }))])
    if (grande) { addToast('error', `${grande} passa de 1 MB. Remova e escolha de novo (o site comprime sozinho) ou cole um link.`); return }
    if (envioGrandeDemais(corpo)) { addToast('error', 'As imagens enviadas passam de 5 MB juntas. Use link em algumas ou imagens menores.'); return }
    salvar.mutate(corpo, {
      onSuccess: () => { setRascunho(null); addToast('success', 'Painel salvo. O Discord é atualizado em instantes.') },
      onError: e => {
        const r = (e as Erro).response
        // Outra pessoa salvou antes: mostra a versão dela (nada é apagado) para conferir e salvar de novo
        if (r?.status === 409 && r.data?.config) {
          const nova = r.data.config
          queryClient.setQueryData(chavePainel(nova.id), (a: HierarquiaResp | undefined) => (a ? { ...a, config: nova } : a))
          setRascunho(null)
        }
        addToast('error', erroApi(e, 'Não foi possível salvar o painel.'))
      },
    })
  }
  // Publicar: se houver alterações, salva (salvar já publica); senão publica direto no canal
  const atualizarAgora = () => alterado ? enviar() : publicar.mutate(config.id, {
    onSuccess: d => addToast(d.estado.erro ? 'error' : 'success', d.estado.erro ? 'O Discord recusou a atualização. Veja o aviso acima.' : 'Painel atualizado no Discord.'),
    onError: e => addToast('error', erroApi(e, 'Não foi possível atualizar agora.')),
  })

  // Trocar de hierarquia: alterações não salvas se perdem, então pergunta antes
  const trocarPainel = async (id: number) => {
    if (id === config.id) return
    if (alterado && !(await confirmar({ titulo: 'Descartar alterações?', mensagem: 'As alterações desta hierarquia ainda não foram salvas.', tom: 'aviso', textoConfirmar: 'Descartar' }))) return
    setRascunho(null); setPainelId(id)
  }
  const novaHierarquia = async () => {
    if (alterado && !(await confirmar({ titulo: 'Descartar alterações?', mensagem: 'As alterações desta hierarquia ainda não foram salvas.', tom: 'aviso', textoConfirmar: 'Descartar' }))) return
    criar.mutate('Nova hierarquia', {
      onSuccess: d => { setRascunho(null); setPainelId(d.config.id); addToast('success', 'Hierarquia criada. Dê um nome, escolha o canal e os cargos e salve.') },
      onError: e => addToast('error', erroApi(e, 'Não foi possível criar a hierarquia.')),
    })
  }
  const excluirHierarquia = async () => {
    if (!(await confirmar({ titulo: `Excluir "${config.titulo}"?`, tom: 'perigo', textoConfirmar: 'Excluir',
      mensagem: config.publicado ? 'A mensagem desta hierarquia no Discord também é apagada.' : 'Esta hierarquia ainda não foi publicada.' }))) return
    excluir.mutate(config.id, {
      onSuccess: () => { setRascunho(null); setPainelId(0); addToast('success', 'Hierarquia excluída.') },
      onError: e => addToast('error', erroApi(e, 'Não foi possível excluir a hierarquia.')),
    })
  }

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8">
      {/* Cabeçalho + situação */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Sistema</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2"><Network size={26} className="text-gold" /> Hierarquia</h1>
          <p className="text-sm text-txt2 mt-1 max-w-2xl">Painéis do bot no Discord, atualizados sozinhos a cada minuto pelos cargos do servidor. Crie quantas hierarquias quiser — cada uma no seu canal, com os seus cargos.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs font-mono ${config.publicado ? 'text-green' : 'text-txt3'}`}>
            {config.publicado ? <CheckCircle2 size={14} /> : <Clock size={14} />}
            {config.publicado ? `Publicado · ${dataHora(estado.ultimaAtualizacao)}` : 'Não publicado'}
          </span>
          {podeEditar && (
            <button type="button" onClick={atualizarAgora} disabled={publicar.isPending || salvar.isPending}
              title={alterado ? 'Salvar e publicar no canal' : 'Atualizar o painel no canal agora'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card text-sm text-txt2 hover:text-txt disabled:opacity-40">
              <RefreshCw size={14} className={publicar.isPending ? 'animate-spin' : ''} /> Atualizar agora
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-5 empty:hidden">
        {!data.discordConfigurado && <Aviso tom="erro">O Discord não está configurado no servidor (.env). O painel não pode ser publicado.</Aviso>}
        {estado.erro === 'sem_acesso' && <Aviso tom="erro">O bot não consegue postar no canal escolhido. Dê a ele <b>Ver canal</b>, <b>Enviar mensagens</b>, <b>Inserir links</b> e <b>Anexar arquivos</b> nesse canal.</Aviso>}
        {estado.erro === 'discord' && <Aviso tom="erro">O Discord não respondeu na última tentativa. O painel continua como estava e é atualizado na próxima rodada.</Aviso>}
        {estado.modo === 'contas' && (
          <Aviso tom="info">O painel mostra só quem tem conta no site. Para mostrar todos com o cargo, ligue <b>Server Members Intent</b> em Discord Developer Portal → Bot.</Aviso>
        )}
      </div>

      {/* Uma aba por hierarquia (a principal primeiro) + criar outra */}
      <div role="tablist" aria-label="Hierarquias" className="flex flex-wrap items-center gap-2 mb-5">
        {data.paineis.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === config.id} onClick={() => void trocarPainel(p.id)}
            className={`flex items-center gap-1.5 max-w-60 px-3 py-1.5 rounded-lg text-sm transition-colors ${p.id === config.id ? 'bg-gold/15 text-gold3 ring-1 ring-gold/40' : 'bg-card text-txt2 hover:text-txt'}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.publicado ? 'bg-green' : 'bg-txt3'}`} title={p.publicado ? 'Publicada' : 'Não publicada'} />
            <span className="truncate">{p.id === config.id && rascunho ? (rascunho.titulo || 'Sem nome') : p.titulo}</span>
            {p.id === 0 && <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-txt3">Principal</span>}
          </button>
        ))}
        {podeEditar && (
          <button type="button" onClick={() => void novaHierarquia()} disabled={criar.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-gold3 hover:text-gold hover:bg-card disabled:opacity-40">
            <Plus size={14} /> {criar.isPending ? 'Criando…' : 'Nova hierarquia'}
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] items-start">
        {podeEditar ? (
          <div className="space-y-4">
            <Secao n={1} titulo="Imagens do painel" descricao="Envie banners, divisórias ou fotos e escolha em que ponto do painel cada uma fica: topo, depois do título, depois de qualquer cargo ou antes do rodapé.">
              <ImagensPainel imagens={form.imagens} onChange={imagens => atualizar({ imagens })} onErro={m => addToast('error', m)}
                posicoes={[
                  { valor: 'topo', rotulo: 'Topo (acima do título)' },
                  { valor: 'titulo', rotulo: 'Depois do título' },
                  ...form.cargos.map(c => ({ valor: `cargo:${c.roleId}`, rotulo: `Depois do cargo ${c.nome || '(sem nome)'}` })),
                  { valor: 'fim', rotulo: 'Fim (antes do rodapé)' },
                ]} />
            </Secao>

            <Secao n={2} titulo="Identidade" descricao="Título e logo do painel.">
              <div>
                <label htmlFor="h-titulo" className={rotulo}>Nome da unidade</label>
                <input id="h-titulo" value={form.titulo} maxLength={100} onChange={e => atualizar({ titulo: e.target.value })} className={campo} placeholder="Detective Unit" />
              </div>
              <CampoImagem rotulo="Logo" valor={form.logo} onChange={v => atualizar({ logo: v })} onErro={m => addToast('error', m)} maxBytes={MAX_BYTES_IMAGEM}
                dica="Aparece no canto do painel. PNG, JPG, WEBP ou GIF até 1 MB." />
            </Secao>

            <Secao n={3} titulo="Rodapé" descricao="Sem preencher, usa o nome do servidor e a foto do bot.">
              <div>
                <label htmlFor="h-rodape" className={rotulo}>Texto do rodapé <span className="normal-case tracking-normal text-txt3">(opcional)</span></label>
                <input id="h-rodape" value={form.rodapeTexto ?? ''} maxLength={100} onChange={e => atualizar({ rodapeTexto: e.target.value })}
                  className={campo} placeholder={discord.data?.servidor || 'Nome do servidor'} />
              </div>
              <CampoImagem rotulo="Foto do rodapé" valor={form.rodapeIcone} onChange={v => atualizar({ rodapeIcone: v })} onErro={m => addToast('error', m)}
                maxLado={128} copiarLink dica="Fotinha pequena ao lado do nome, embaixo à esquerda (vira um emoji do bot no Discord). Vazio = foto do bot." />
            </Secao>

            <Secao n={4} titulo="Canal" descricao="Onde o bot publica e mantém o painel.">
              <select aria-label="Canal do painel" value={form.canalId ?? ''} onChange={e => atualizar({ canalId: e.target.value || null })} className={campo}>
                <option value="">Escolha um canal…</option>
                {(discord.data?.canais ?? []).map(c => <option key={c.id} value={c.id}>#{c.nome}</option>)}
                {form.canalId && !discord.data?.canais.some(c => c.id === form.canalId) && <option value={form.canalId}>(canal atual)</option>}
              </select>
            </Secao>

            <Secao n={5} titulo="Cargos" descricao="De cima para baixo = posição no painel. Cada pessoa aparece só no cargo mais alto que tiver.">
              {form.cargos.length === 0 && <p className="text-xs text-txt3">Nenhum cargo ainda.</p>}
              <ol className="space-y-2">
                {form.cargos.map((c, i) => (
                  <li key={c.roleId} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 bg-card2 rounded-lg p-2">
                    <span className="font-mono text-[11px] text-txt3 w-5 text-center">{i + 1}</span>
                    <input value={c.emoji ?? ''} maxLength={64} onChange={e => atualizarCargo(i, { emoji: e.target.value })}
                      aria-label={`Emoji do cargo ${c.nome}`} title="Emoji (opcional) — digite ou escolha um emoji do servidor" placeholder="—" list="emojis-servidor"
                      className="w-12 bg-card rounded px-2 py-1.5 text-sm text-center text-txt outline-none focus:ring-1 focus:ring-gold" />
                    <select value={c.roleId} onChange={e => atualizarCargo(i, { roleId: e.target.value })} aria-label="Cargo do Discord"
                      className="bg-card rounded px-2 py-1.5 text-xs text-txt outline-none focus:ring-1 focus:ring-gold">
                      {cargosDiscord.filter(r => r.id === c.roleId || livres.includes(r)).map(r => <option key={r.id} value={r.id}>@{r.nome}</option>)}
                      {!cargosDiscord.some(r => r.id === c.roleId) && <option value={c.roleId}>(cargo atual)</option>}
                    </select>
                    <input value={c.nome} maxLength={60} onChange={e => atualizarCargo(i, { nome: e.target.value })} aria-label="Nome exibido no painel"
                      placeholder="Nome no painel" className="col-span-3 sm:col-span-1 order-last sm:order-0 bg-card rounded px-2 py-1.5 text-sm text-txt outline-none focus:ring-1 focus:ring-gold" />
                    <div className="flex items-center">
                      <BotaoIcone titulo="Subir" onClick={() => mover(i, -1)} desativado={i === 0}><ArrowUp size={14} /></BotaoIcone>
                      <BotaoIcone titulo="Descer" onClick={() => mover(i, 1)} desativado={i === form.cargos.length - 1}><ArrowDown size={14} /></BotaoIcone>
                      <BotaoIcone titulo="Remover" perigo onClick={() => atualizar({ cargos: form.cargos.filter((_, k) => k !== i) })}><Trash2 size={14} /></BotaoIcone>
                    </div>
                  </li>
                ))}
              </ol>
              <datalist id="emojis-servidor">
                {(discord.data?.emojis ?? []).map(e => <option key={e.codigo} value={e.codigo}>:{e.nome}:</option>)}
              </datalist>
              <button type="button" onClick={adicionarCargo} disabled={!livres.length || form.cargos.length >= 25}
                className="flex items-center gap-1.5 text-xs font-mono text-gold3 hover:text-gold disabled:opacity-40">
                <Plus size={14} /> Adicionar cargo
              </button>
              {discord.isError && <p className="text-xs text-red">{erroApi(discord.error, 'Não foi possível carregar os cargos do Discord.')}</p>}
            </Secao>

            {/* Barra de salvar fixa no fim da tela */}
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
              <p className="text-[11px] text-txt3 flex-1 min-w-45">
                {alterado
                  ? 'Alterações não salvas. Se outra pessoa salvar antes, você vê a versão dela e salva de novo — nada se perde.'
                  : `Configurado por ${config.atualizadoPor ?? '—'} em ${dataHora(config.atualizadoEm)}.`}
              </p>
              {config.id !== 0 && (
                <button type="button" onClick={() => void excluirHierarquia()} disabled={excluir.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-txt2 hover:text-red hover:bg-red/10 disabled:opacity-40">
                  <Trash2 size={14} /> Excluir hierarquia
                </button>
              )}
              {alterado && <button type="button" onClick={() => setRascunho(null)} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Descartar</button>}
              <button type="button" onClick={enviar} disabled={!alterado || salvar.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium transition-colors disabled:opacity-50">
                <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar e publicar'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-txt2">Você pode ver o painel, mas não tem permissão para editar.</p>
        )}

        <aside className="lg:sticky lg:top-4 space-y-2">
          <p className={rotulo}>Como está no Discord</p>
          <PreviaDiscord previa={estado.previa} />
          <p className="text-[11px] text-txt3">A prévia mostra a última versão publicada. Menções aparecem com o nome de quem tem conta no site.</p>
        </aside>
      </div>
    </div>
  )
}
