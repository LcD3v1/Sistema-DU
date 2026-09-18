import { Link } from 'react-router-dom'
import { History, Trophy } from 'lucide-react'
import RankingModule from '@/modules/ranking/RankingModule'

export default function RankingPage() {
  return <div className="ranking-page w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:px-8">
    <div className="relative overflow-hidden rounded-2xl border border-bdr mb-6">
      <img src="/media/races/race-2.webp" alt="" decoding="async" fetchPriority="low" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,5,0.95) 0%, rgba(5,7,12,0.75) 45%, rgba(58,114,196,0.25) 100%)' }} />
      <div className="relative p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
        <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1 flex items-center gap-2"><Trophy size={13} /> Destaques operacionais</p>
        <h1 className="wordmark text-3xl md:text-4xl text-white tracking-wide">Ranking de QRUs</h1>
        <p className="text-sm text-white/70 mt-1">Classificação por registros aprovados e desempenho da unidade.</p>
        </div>
        {/* Rankings zerados no painel do Discord ficam guardados aqui */}
        <Link to="/historico-ranking"
          className="inline-flex items-center gap-2 self-start sm:self-auto px-4 py-2 rounded-lg border border-gold/40 bg-black/40 text-sm text-gold3 hover:text-white hover:border-gold transition-colors">
          <History size={15} /> Histórico de rankings
        </Link>
      </div>
    </div>
    <RankingModule mode="ranking" />
  </div>
}
