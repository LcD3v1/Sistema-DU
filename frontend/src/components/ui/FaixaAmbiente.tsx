/** Faixa fixa indicando o ambiente de TESTE LOCAL (não aparece em produção). */
export default function FaixaAmbiente() {
  const ambiente = document.querySelector('meta[name="fast-ambiente"]')?.getAttribute('content')
  if (ambiente !== 'local') return null
  return (
    <div className="fixed top-0 inset-x-0 z-9999 pointer-events-none flex justify-center">
      <div className="mt-1 px-3 py-1 rounded-full bg-orange-500/90 text-black text-[11px] font-mono font-bold tracking-wider shadow-lg">
        TESTE LOCAL · cópia dos dados reais · produção não é afetada
      </div>
    </div>
  )
}
