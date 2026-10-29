import { ImagemArquivo } from '@/components/investigacao/Campos'
import type { FotoArvore as Foto } from '@/hooks/useArvores'
import { iniciais } from './geometria'

/** Foto de um card: arquivo enviado (via backend) ou link. Sem foto = iniciais. */
export default function FotoArvore({ foto, nome, className = '' }: { foto: Foto | null; nome: string; className?: string }) {
  if (foto && 'arquivo' in foto) return <ImagemArquivo arquivo={foto.arquivo} alt={nome} className={className} />
  if (foto) return <img src={foto.url} alt={nome} referrerPolicy="no-referrer" loading="lazy" decoding="async" draggable={false} className={`${className} object-cover`} />
  return (
    <div className={`${className} flex items-center justify-center bg-linear-to-br from-navy2 to-navy text-gold3 font-bold text-3xl select-none`}>
      {iniciais(nome)}
    </div>
  )
}
