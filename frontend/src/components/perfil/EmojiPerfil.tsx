import { iconeDoValor } from '@/lib/iconesPlataforma'

/** Mostra um emoji Unicode ou o logo de uma plataforma (`si:<chave>`). */
export default function EmojiPerfil({ valor, tamanho = '1em' }: { valor: string; tamanho?: string }) {
  const icone = iconeDoValor(valor)
  if (icone) {
    return (
      <svg role="img" aria-label={icone.nome} viewBox="0 0 24 24" width={tamanho} height={tamanho}
        style={{ display: 'inline-block', verticalAlign: '-0.125em', fill: icone.cor }}>
        <title>{icone.nome}</title>
        <path d={icone.path} />
      </svg>
    )
  }
  if (valor.startsWith('si:')) return null   // ícone desconhecido: não mostra texto cru
  return <span>{valor}</span>
}
