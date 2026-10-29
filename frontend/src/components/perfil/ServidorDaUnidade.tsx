import { Server, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { useMeuServidor, useImagemServidor } from '@/hooks/useServidor'

const corHex = (cor: number) => (cor ? `#${cor.toString(16).padStart(6, '0')}` : '#99aab5')

/** Perfil: o servidor do Discord da unidade e os cargos que a pessoa tem lá. */
export default function ServidorDaUnidade() {
  const { data } = useMeuServidor()
  const icone = useImagemServidor('icone', Boolean(data?.temIcone))
  if (!data?.configurado || !data.servidor) return null

  const situacao = data.membro === true
    ? { Icone: CheckCircle2, texto: 'Você está no servidor', cor: 'text-green' }
    : data.membro === false
      ? { Icone: XCircle, texto: 'Você não está no servidor', cor: 'text-red' }
      : { Icone: HelpCircle, texto: 'Não foi possível conferir agora', cor: 'text-txt3' }

  return (
    <div className="bg-card border border-bdr rounded-xl p-5">
      <h2 className="text-sm font-semibold text-txt flex items-center gap-2 mb-4"><Server size={16} className="text-gold" /> Servidor da unidade</h2>
      <div className="flex items-center gap-3">
        {icone ? <img src={icone} alt="" className="w-11 h-11 rounded-xl" />
          : <span className="w-11 h-11 rounded-xl bg-card2 flex items-center justify-center"><Server size={18} className="text-txt3" /></span>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-txt truncate">{data.servidor}</p>
          <p className={`text-xs flex items-center gap-1 ${situacao.cor}`}><situacao.Icone size={12} /> {situacao.texto}</p>
        </div>
      </div>
      {data.membro && (
        <dl className="mt-4 space-y-2 text-sm">
          {data.apelido && <div className="flex justify-between gap-2"><dt className="text-txt2">Apelido</dt><dd className="text-txt truncate">{data.apelido}</dd></div>}
          {data.entrouEm && <div className="flex justify-between gap-2"><dt className="text-txt2">Entrou em</dt><dd className="text-txt">{new Date(data.entrouEm).toLocaleDateString('pt-BR')}</dd></div>}
        </dl>
      )}
      {!!data.cargos?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.cargos.map(c => (
            <span key={c.nome} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-card2" style={{ color: corHex(c.cor) }}>
              {c.icone ? <img src={c.icone} alt="" className="w-3.5 h-3.5" referrerPolicy="no-referrer" /> : c.emoji}
              {c.nome}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
