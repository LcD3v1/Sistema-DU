import { useState } from 'react'
import { ClipboardCheck, ArrowUp, ArrowDown, Trash2, Plus, Link2, Save, RefreshCw, AlertTriangle, Info, CheckCircle2, Clock, Wifi, WifiOff, X, Layers, ShieldAlert } from 'lucide-react'
import {
  useSetagem, useSetagemDiscord, useSalvarSetagem, usePublicarSetagem, useCriarCargosAdvertencia,
  type SetagemConfig, type PatenteSetagem, MOTIVO_ERRO_SETAGEM,
} from '@/hooks/useSetagem'
import { usePerms } from '@/hooks/usePerms'
import { useUIStore } from '@/store/uiStore'
import { queryClient } from '@/lib/queryClient'
import { Link } from 'react-router-dom'
import LoadingHud from '@/components/ui/LoadingHud'
import CampoImagem from '@/components/ui/CampoImagem'
import ImagensPainel from '@/components/ui/ImagensPainel'
import { envioGrandeDemais, imagemGrandeDemais } from '@/lib/imagensPainel'

type Erro = { response?: { status?: number; data?: { error?: string; config?: SetagemConfig } } }
const erroApi = (e: unknown, padrao: string) => (e as Erro)?.response?.data?.error ?? padrao
const campo = 'w-full bg-card2 rounded-lg px-3 py-2 text-sm text-txt placeholder-txt3 outline-none focus:ring-1 focus:ring-gold'
const pequeno = 'bg-card rounded px-2 py-1.5 text-sm text-txt outline-none focus:ring-1 focus:ring-gold'
const rotulo = 'block font-mono text-[10px] text-txt2 tracking-[0.18em] uppercase mb-1.5'
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
/** Apelido fixo: prefixo da patente, codinome escolhido e ID (passaporte). */
const apelidoDe = (prefixo: string, codinome: string, id: string) => `${prefixo} ${codinome} | ${id}`.replace(/\s+/g, ' ').trim()

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

function BotaoIcone({ titulo, onClick, desativado, perigo, children }: { titulo: string; onClick: () => void; desativado?: boolean; perigo?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={desativado}
      className={`p-1.5 rounded text-txt2 disabled:opacity-30 ${perigo ? 'hover:text-red hover:bg-red/10' : 'hover:text-txt hover:bg-card'}`}>{children}</button>
  )
}

export default function SetagemPage() {
  const { data, isLoading } = useSetagem()
  const { canEdit } = usePerms()
  const podeEditar = canEdit('setagem')
  const discord = useSetagemDiscord(podeEditar && Boolean(data?.discordConfigurado))
  const salvar = useSalvarSetagem()
  const publicar = usePublicarSetagem()
  const criarAdv = useCriarCargosAdvertencia()
  const { addToast } = useUIStore()
  const [rascunho, setRascunho] = useState<SetagemConfig | null>(null)
  const config = data?.config
  const form = rascunho ?? config
  if (isLoading || !data || !form || !config) return <LoadingHud />

  const alterado = rascunho !== null
  const { estado } = data
  const d = discord.data
  const atualizar = (parcial: Partial<SetagemConfig>) => setRascunho({ ...form, ...parcial })
  const atualizarPatente = (i: number, parcial: Partial<PatenteSetagem>) => atualizar({ patentes: form.patentes.map((p, k) => (k === i ? { ...p, ...parcial } : p)) })
  const mover = (i: number, dir: -1 | 1) => { const ps = [...form.patentes]; [ps[i], ps[i + dir]] = [ps[i + dir], ps[i]]; atualizar({ patentes: ps }) }
  /** Liga cada patente sem cargo ao cargo do Discord de mesmo nome (sem emoji/pontuação, palavras em qualquer ordem). */
  const palavras = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ')
  const ligarPeloNome = () => {
    let ligadas = 0
    const patentes = form.patentes.map(p => {
      if (p.roleIds.length) return p
      const alvo = d?.cargos.find(r => palavras(r.nome) === palavras(p.nome))
      if (!alvo) return p
      ligadas++
      return { ...p, roleIds: [alvo.id] }
    })
    atualizar({ patentes })
    addToast(ligadas ? 'success' : 'error', ligadas ? `${ligadas} patente(s) ligada(s) ao cargo do Discord. Confira e clique em Salvar.` : 'Nenhum cargo do Discord com o mesmo nome das patentes sem cargo.')
  }
  const exemplo = apelidoDe(form.patentes[0]?.prefixo || 'SGT', 'Raven', '12345')

  const enviar = () => {
    const corpo = {
      titulo: form.titulo.trim(), descricao: form.descricao?.trim() || null, categoriaId: form.categoriaId, canalId: form.canalId, forumRegistroId: form.forumRegistroId ?? null,
      aprovadores: form.aprovadores, imagem: form.imagem || null, rodapeTexto: form.rodapeTexto?.trim() || null,
      imagens: form.imagens.filter(i => i.url),
      advertencias: [0, 1, 2].map(n => form.advertencias[n] ?? ''),
      versao: form.versao,
      patentes: form.patentes.map(p => ({ id: p.id, nome: p.nome.trim(), prefixo: p.prefixo.trim(), roleIds: p.roleIds.filter(Boolean).slice(0, 2), cargoPermId: p.cargoPermId })),
    }
    const grande = imagemGrandeDemais([{ rotulo: 'Fotinha do rodapé', url: corpo.imagem }, ...corpo.imagens.map((i, k) => ({ rotulo: `Imagem ${k + 1}`, url: i.url }))])
    if (grande) { addToast('error', `${grande} passa de 1 MB. Remova e escolha de novo (o site comprime sozinho) ou cole um link.`); return }
    if (envioGrandeDemais(corpo)) { addToast('error', 'As imagens enviadas passam de 5 MB juntas. Use link em algumas ou imagens menores.'); return }
    salvarCorpo(corpo)
  }
  const salvarCorpo = (corpo: Parameters<typeof salvar.mutate>[0]) => salvar.mutate(corpo, {
    onSuccess: r => { setRascunho(null); addToast(r.estado.erro ? 'error' : 'success', r.estado.erro ? `Salvo, mas não publicado: ${MOTIVO_ERRO_SETAGEM[r.estado.erro]}` : 'Setagem salva e painel publicado no Discord.') },
    onError: e => {
      const r = (e as Erro).response
      if (r?.status === 409 && r.data?.config) {
        const nova = r.data.config
        queryClient.setQueryData(['setagem'], (a: typeof data) => (a ? { ...a, config: nova } : a))
        setRascunho(null)
      }
      addToast('error', erroApi(e, 'Não foi possível salvar a setagem.'))
    },
  })

  return (
    <div className="w-full max-w-375 mx-auto p-3 sm:p-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[10px] text-txt2 tracking-[0.2em] uppercase mb-1">Sistema</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-txt flex items-center gap-2"><ClipboardCheck size={26} className="text-gold" /> Setagem</h1>
          <p className="text-sm text-txt2 mt-1 max-w-2xl">
            Painel com o botão <b>Solicitar set</b> no Discord. A pessoa informa codinome, passaporte, patente e, se quiser, o setor; o apelido muda na hora.
            Os cargos da patente e do setor e o acesso ao site só são liberados depois da aprovação.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className={`flex items-center gap-1.5 ${estado.botConectado ? 'text-green' : 'text-red'}`}>
            {estado.botConectado ? <Wifi size={14} /> : <WifiOff size={14} />} {estado.botConectado ? 'Bot conectado' : 'Bot desconectado'}
          </span>
          <span className={`flex items-center gap-1.5 ${config.publicado ? 'text-green' : 'text-txt3'}`}>
            {config.publicado ? <CheckCircle2 size={14} /> : <Clock size={14} />} {config.publicado ? 'Painel publicado' : 'Painel não publicado'}
          </span>
          {podeEditar && (
            <button type="button" disabled={publicar.isPending || salvar.isPending}
              title="Publica (ou atualiza) o painel no canal configurado. Se houver alterações, salva antes."
              onClick={() => alterado ? enviar() : publicar.mutate(undefined, {
                onSuccess: r => addToast(r.estado.erro ? 'error' : 'success', r.estado.erro ? `Não publicado: ${MOTIVO_ERRO_SETAGEM[r.estado.erro]}` : 'Painel publicado no canal.'),
                onError: e => addToast('error', erroApi(e, 'Não foi possível publicar.')),
              })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm disabled:opacity-40">
              <RefreshCw size={14} className={publicar.isPending || salvar.isPending ? 'animate-spin' : ''} /> Publicar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-5 empty:hidden">
        {!data.discordConfigurado && <p role="alert" className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-red/10 text-red"><AlertTriangle size={15} className="shrink-0" /> O Discord não está configurado no servidor (.env).</p>}
        {data.discordConfigurado && !estado.botConectado && (
          <p role="alert" className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-red/10 text-red"><AlertTriangle size={15} className="shrink-0" />
            O bot não está conectado: o botão do Discord não responde. Confira o token do bot e se DISCORD_INTERACOES não está "off" nesta instância.</p>
        )}
        {estado.erro && estado.erro !== 'sem_acesso' && estado.erro !== 'nao_configurado' && (
          <p role="alert" className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-red/10 text-red"><AlertTriangle size={15} className="shrink-0" /> Painel não publicado: {MOTIVO_ERRO_SETAGEM[estado.erro]}</p>
        )}
        {estado.erro === 'sem_acesso' && (
          <p role="alert" className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-red/10 text-red"><AlertTriangle size={15} className="shrink-0" />
            O bot não consegue postar no canal. Dê a ele <b>Ver canal</b>, <b>Enviar mensagens</b> e <b>Inserir links</b> nesse canal.</p>
        )}
        <p className="flex gap-2 rounded-lg px-3 py-2.5 text-xs bg-gold/10 text-gold3"><Info size={15} className="shrink-0 mt-0.5" />
          <span>Para trocar apelidos e dar cargos, o bot precisa de <b>Gerenciar apelidos</b> e <b>Gerenciar cargos</b>, e o cargo do bot tem que ficar <b>acima</b> dos cargos das patentes. Cargo com moderação ou administração (ex.: Chief, Supervisor) pode ser escolhido na patente, mas o bot <b>não entrega</b>: ao aprovar, quem aprovou recebe o aviso para dar esse cargo à mão.</span></p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px] items-start">
        {podeEditar ? (
          <div className="space-y-4">
            <Secao n={1} titulo="Imagens do painel" descricao="Envie banners, divisórias ou fotos e escolha em que ponto do painel cada uma fica. Salve para publicar.">
              <ImagensPainel imagens={form.imagens} onChange={imagens => atualizar({ imagens })} onErro={m => addToast('error', m)}
                posicoes={[
                  { valor: 'topo', rotulo: '1 · Topo (acima do título)' },
                  { valor: 'titulo', rotulo: '2 · Depois do título e da mensagem' },
                  { valor: 'passos', rotulo: '3 · Depois do "Como funciona"' },
                  { valor: 'texto', rotulo: '4 · Depois do exemplo do apelido (antes do botão)' },
                  { valor: 'botao', rotulo: '5 · Logo depois do botão Solicitar set' },
                  { valor: 'fim', rotulo: '6 · Fim (antes do rodapé)' },
                ]} />
            </Secao>

            <Secao n={2} titulo="Painel no Discord" descricao="Mensagem em Componentes V2 com o botão Solicitar set e o rodapé padrão: fotinha + nome do servidor, pequeno, embaixo à esquerda.">
              <div>
                <label htmlFor="s-titulo" className={rotulo}>Título</label>
                <input id="s-titulo" value={form.titulo} maxLength={45} onChange={e => atualizar({ titulo: e.target.value })} className={campo} />
              </div>
              <div>
                <label htmlFor="s-desc" className={rotulo}>Mensagem <span className="normal-case tracking-normal text-txt3">(opcional)</span></label>
                <textarea id="s-desc" value={form.descricao ?? ''} maxLength={500} rows={2} onChange={e => atualizar({ descricao: e.target.value })} className={campo}
                  placeholder="Clique no botão abaixo para solicitar o seu set." />
              </div>
              <div>
                <label htmlFor="s-canal" className={rotulo}>Canal do painel</label>
                <select id="s-canal" value={form.canalId ?? ''} onChange={e => atualizar({ canalId: e.target.value || null })} className={campo}>
                  <option value="">Escolha um canal…</option>
                  {(d?.canais ?? []).map(c => <option key={c.id} value={c.id}>#{c.nome}{c.categoriaId ? ` · ${d?.categorias.find(k => k.id === c.categoriaId)?.nome ?? ''}` : ''}</option>)}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="s-rodape" className={rotulo}>Texto do rodapé <span className="normal-case tracking-normal text-txt3">(opcional)</span></label>
                  <input id="s-rodape" value={form.rodapeTexto ?? ''} maxLength={100} onChange={e => atualizar({ rodapeTexto: e.target.value })} className={campo} placeholder="Nome do servidor" />
                </div>
                <CampoImagem rotulo="Fotinha do rodapé" valor={form.imagem} onChange={v => atualizar({ imagem: v })} onErro={m => addToast('error', m)}
                  maxLado={128} copiarLink dica="Fica pequena ao lado do nome, embaixo à esquerda (vira um emoji do bot no Discord). Vazio = foto do bot." />
              </div>
            </Secao>

            <Secao n={3} titulo="Avaliação dos pedidos" descricao="Cada pedido abre um canal temporário privado nesta categoria, com Aprovar · Reprovar · Refazer preenchimento. O canal é apagado ao aprovar ou reprovar.">
              <div>
                <label htmlFor="s-cat" className={rotulo}>Categoria dos canais temporários</label>
                <select id="s-cat" value={form.categoriaId ?? ''} onChange={e => atualizar({ categoriaId: e.target.value || null })} className={campo}>
                  <option value="">Sem canal temporário (aprovar só pelo site)</option>
                  {(d?.categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="s-aprovador" className={rotulo}>Quem pode aprovar ou reprovar (cargos do Discord)</label>
                <p className="text-[11px] text-txt3 mb-2">Só esses cargos veem o canal temporário e usam os botões. Administradores do servidor e os donos também podem. Ninguém avalia o próprio pedido.</p>
                <select id="s-aprovador" value="" className={campo}
                  onChange={e => { const id = e.target.value; if (id && !form.aprovadores.includes(id)) atualizar({ aprovadores: [...form.aprovadores, id] }) }}>
                  <option value="">+ Adicionar cargo aprovador…</option>
                  {(d?.cargos ?? []).filter(r => !form.aprovadores.includes(r.id)).map(r => <option key={r.id} value={r.id}>@{r.nome}</option>)}
                </select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.aprovadores.map(id => (
                    <span key={id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs bg-gold/20 text-gold3">
                      @{d?.cargos.find(r => r.id === id)?.nome ?? 'cargo'}
                      <button type="button" aria-label="Remover aprovador" title="Remover" onClick={() => atualizar({ aprovadores: form.aprovadores.filter(x => x !== id) })}
                        className="p-0.5 rounded-full hover:bg-gold/20"><X size={12} /></button>
                    </span>
                  ))}
                </div>
                {!form.aprovadores.length && <p className="text-[11px] text-gold3 mt-2">Nenhum cargo escolhido: só administradores do servidor e os donos avaliam no Discord.</p>}
              </div>
              <div>
                <label htmlFor="s-forum" className={rotulo}>Fórum de registro</label>
                <p className="text-[11px] text-txt3 mb-2">Ao aprovar o set, o bot abre um tópico da pessoa neste fórum com os dados aprovados. Cadastro, pedidos de alteração, aprovações, recusas, promoções, advertências e exoneração entram no mesmo tópico.</p>
                <select id="s-forum" value={form.forumRegistroId ?? ''} onChange={e => atualizar({ forumRegistroId: e.target.value || null })} className={campo}>
                  <option value="">Sem fórum de registro</option>
                  {(d?.foruns ?? []).map(c => <option key={c.id} value={c.id}>#{c.nome}</option>)}
                </select>
              </div>
            </Secao>

            <Secao n={4} titulo="Apelido" descricao="Formato fixo: prefixo da patente, codinome que a pessoa escolhe e o ID (passaporte). O Discord aceita até 32 caracteres.">
              <p className="text-sm text-txt2"><span className="font-mono text-txt">PREFIXO Codinome | ID</span> → ex.: <span className="font-mono text-txt">{exemplo}</span>
                <span className={`ml-2 text-xs ${exemplo.length > 32 ? 'text-red' : 'text-txt3'}`}>({exemplo.length}/32)</span></p>
            </Secao>

            <Secao n={5} titulo="Patentes" descricao="Aparecem no modal. Cada uma tem o prefixo do apelido, até 2 cargos do Discord dados na aprovação e o cargo do site (opcional).">
              {form.patentes.length === 0 && <p className="text-xs text-txt3">Nenhuma patente ainda.</p>}
              <ol className="space-y-2">
                {form.patentes.map((p, i) => (
                  <li key={p.id ?? `nova-${i}`} className="bg-card2 rounded-lg p-2 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center">
                    <span className="font-mono text-[11px] text-txt3 w-5 text-center">{i + 1}</span>
                    <input value={p.nome} maxLength={60} onChange={e => atualizarPatente(i, { nome: e.target.value })} aria-label="Nome da patente" placeholder="Nome (ex.: Sargento)" className={pequeno} />
                    <input value={p.prefixo} maxLength={12} onChange={e => atualizarPatente(i, { prefixo: e.target.value })} aria-label="Prefixo" placeholder="SGT" className={`${pequeno} font-mono`} />
                    {[0, 1].map(k => {
                      const atual = p.roleIds[k] ?? ''
                      return (
                        <select key={k} value={atual} aria-label={`Cargo ${k + 1} do Discord`} className={`${pequeno} text-xs`}
                          onChange={e => { const ids = [...p.roleIds]; ids[k] = e.target.value; atualizarPatente(i, { roleIds: ids.filter(Boolean) }) }}>
                          <option value="">{k === 0 ? 'Cargo: escolha…' : '2º cargo: nenhum'}</option>
                          {(d?.cargos ?? []).filter(r => r.id === atual || !p.roleIds.includes(r.id)).map(r =>
                            <option key={r.id} value={r.id}>@{r.nome}{r.bloqueado ? ' ⚠ dar à mão (tem moderação)' : ''}</option>)}
                          {atual && !d?.cargos.some(r => r.id === atual) && <option value={atual}>(cargo atual)</option>}
                        </select>
                      )
                    })}
                    <select value={p.cargoPermId ?? ''} onChange={e => atualizarPatente(i, { cargoPermId: e.target.value ? Number(e.target.value) : null })} aria-label="Cargo no site" className={`${pequeno} text-xs`}>
                      <option value="">Cargo do site: padrão</option>
                      {(d?.cargosSite ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      {p.cargoPermId !== null && !d?.cargosSite.some(c => c.id === p.cargoPermId) && <option value={p.cargoPermId}>(cargo atual)</option>}
                    </select>
                    <div className="flex items-center">
                      <BotaoIcone titulo="Subir" onClick={() => mover(i, -1)} desativado={i === 0}><ArrowUp size={14} /></BotaoIcone>
                      <BotaoIcone titulo="Descer" onClick={() => mover(i, 1)} desativado={i === form.patentes.length - 1}><ArrowDown size={14} /></BotaoIcone>
                      <BotaoIcone titulo="Remover" perigo onClick={() => atualizar({ patentes: form.patentes.filter((_, k) => k !== i) })}><Trash2 size={14} /></BotaoIcone>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" disabled={form.patentes.length >= 25}
                  onClick={() => atualizar({ patentes: [...form.patentes, { id: null, nome: '', prefixo: '', roleIds: [], cargoPermId: null }] })}
                  className="flex items-center gap-1.5 text-xs font-mono text-gold3 hover:text-gold disabled:opacity-40"><Plus size={14} /> Adicionar patente</button>
                <button type="button" disabled={!d?.cargos.length || !form.patentes.some(p => !p.roleIds.length)} onClick={ligarPeloNome}
                  title="Para cada patente sem cargo, escolhe o cargo do Discord com o mesmo nome (ignora emojis e ordem das palavras)"
                  className="flex items-center gap-1.5 text-xs font-mono text-gold3 hover:text-gold disabled:opacity-40"><Link2 size={14} /> Ligar cargos pelo nome</button>
              </div>
              {form.patentes.some(p => p.roleIds.some(id => d?.cargos.find(r => r.id === id)?.bloqueado)) && (
                <p className="text-[11px] text-gold3">⚠ Patente com cargo de moderação/administração: o bot não entrega esse cargo — na aprovação aparece o aviso para dar à mão.</p>
              )}
              {form.patentes.some(p => !p.roleIds.length) && <p className="text-[11px] text-gold3">Patente sem cargo do Discord: na aprovação a pessoa não ganha cargo de patente. Escolha o cargo de cada uma.</p>}
              {discord.isError && <p className="text-xs text-red">{erroApi(discord.error, 'Não foi possível carregar o servidor do Discord.')}</p>}
            </Secao>

            <Secao n={6} titulo="Setores (subunidades)" descricao="Aparecem no modal depois da patente, como escolha opcional. Se a pessoa escolher, ganha o cargo do setor junto com o da patente na aprovação.">
              <ul className="flex flex-wrap gap-1.5">
                {config.setores.length === 0 && <li className="text-xs text-txt3">Nenhum setor cadastrado.</li>}
                {config.setores.map(x => (
                  <li key={x.id} className={`px-2.5 py-1 rounded-full text-xs ${x.roleIds.length ? 'bg-card2 text-txt2' : 'bg-red/10 text-red'}`}>
                    {x.nome}{x.roleIds.length ? ` · ${x.roleIds.map(id => '@' + (d?.cargos.find(r => r.id === id)?.nome ?? 'cargo')).join(' + ')}` : ' · sem cargo'}
                  </li>
                ))}
              </ul>
              <Link to="/configuracoes?aba=setores" className="inline-flex items-center gap-1.5 text-xs font-mono text-gold3 hover:text-gold"><Layers size={14} /> Cadastrar e editar setores em Configurações → Setores</Link>
            </Secao>

            <Secao n={7} titulo="Advertências no Discord" descricao="Quando alguém toma ADV 1, 2 ou 3 na dashboard, ganha o cargo correspondente no Discord; ao retirar, o cargo sai.">
              <div className="grid gap-2 sm:grid-cols-3">
                {[0, 1, 2].map(n => {
                  const atual = form.advertencias[n] ?? ''
                  return (
                    <label key={n} className="block">
                      <span className={rotulo}>ADV {n + 1}</span>
                      <select value={atual} className={`${campo} text-xs`}
                        onChange={e => { const advs = [0, 1, 2].map(k => form.advertencias[k] ?? ''); advs[n] = e.target.value; atualizar({ advertencias: advs }) }}>
                        <option value="">Criar automaticamente</option>
                        {(d?.cargos ?? []).map(r => <option key={r.id} value={r.id} disabled={r.bloqueado}>@{r.nome}{r.bloqueado ? ' (moderação — bloqueado)' : ''}</option>)}
                        {atual && !d?.cargos.some(r => r.id === atual) && <option value={atual}>(cargo apagado — será recriado)</option>}
                      </select>
                    </label>
                  )
                })}
              </div>
              <button type="button" disabled={criarAdv.isPending || alterado}
                title={alterado ? 'Salve as alterações antes' : 'Cria no servidor os cargos de advertência que faltarem (sem permissão nenhuma)'}
                onClick={() => criarAdv.mutate(undefined, {
                  onSuccess: () => addToast('success', 'Cargos de advertência conferidos no Discord.'),
                  onError: e => addToast('error', erroApi(e, 'Não foi possível criar os cargos.')),
                })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card2 hover:bg-card text-xs text-txt2 hover:text-txt disabled:opacity-40">
                <ShieldAlert size={14} /> {criarAdv.isPending ? 'Conferindo…' : 'Criar cargos que faltam agora'}
              </button>
              <p className="text-[11px] text-txt3">Se o servidor não tiver os cargos, o bot cria "⚠️ Advertência 1/2/3" <b>sem nenhuma permissão</b> na primeira advertência (ou ao clicar acima).</p>
            </Secao>

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
              <p className="text-[11px] text-txt3 flex-1 min-w-45">
                {alterado ? 'Alterações não salvas. Se outra pessoa salvar antes, você vê a versão dela e salva de novo — nada se perde.'
                  : `Configurado por ${config.atualizadoPor ?? '—'} em ${dataHora(config.atualizadoEm)}.`}
              </p>
              {alterado && <button type="button" onClick={() => setRascunho(null)} className="px-3 py-2 rounded-lg text-sm text-txt2 hover:text-txt">Descartar</button>}
              <button type="button" onClick={enviar} disabled={!alterado || salvar.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold hover:bg-gold2 text-white text-sm font-medium disabled:opacity-50">
                <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar e publicar'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-txt2">Você pode ver a setagem, mas não tem permissão para configurar.</p>
        )}

        <aside className="lg:sticky lg:top-4 bg-card rounded-xl p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-semibold text-txt">Pedidos de set <span className="text-txt3 font-mono text-xs">({data.pendentes} aguardando)</span></h2>
          <p className="text-xs text-txt2">Os pedidos são aprovados ou recusados em <Link to="/configuracoes" className="text-gold3 underline underline-offset-2">Configurações → Solicitações</Link>, ou pelos botões do canal temporário no Discord.</p>
          <p className="text-[11px] text-txt3">Ao aprovar, a pessoa ganha os cargos da patente e do setor no Discord e o acesso ao painel; o canal temporário é apagado.</p>
          <p className="text-[11px] text-txt3">Depois de aprovada, a troca de patente, setor, codinome ou passaporte é pedida no <b>perfil</b> da dashboard e só vale (inclusive no Discord) após a aprovação em Membros.</p>
        </aside>
      </div>
    </div>
  )
}
