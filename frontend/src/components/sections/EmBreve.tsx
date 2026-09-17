import { useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'

const LABELS: Record<string, string> = {
  '/acoes/pendentes': 'Pendentes',
  '/qrus': "Cadastrar QRU's",
  '/ranking': 'Ranking',
  '/ausencias/nova': 'Registrar Ausência',
  '/ausencias': 'Ausências',
  '/promocoes': 'Promoções',
  '/corridas': 'Corridas',
  '/minigame': 'Minigame',
  '/galeria': 'Galeria',
  '/anuncio': 'Gerar anúncio',
  '/editor': 'Editor de Páginas',
  '/cursos': 'Cursos Internos',
}

export default function EmBreve() {
  const { pathname } = useLocation()
  const label = LABELS[pathname] ?? 'Módulo'
  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col items-center justify-center text-center py-24 border border-bdr rounded-xl bg-card">
        <div className="w-14 h-14 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mb-4">
          <Construction size={26} className="text-gold" />
        </div>
        <h2 className="text-xl font-semibold text-txt mb-1">{label}</h2>
        <p className="font-mono text-xs text-txt2 tracking-wider uppercase">Módulo em construção</p>
      </div>
    </div>
  )
}
