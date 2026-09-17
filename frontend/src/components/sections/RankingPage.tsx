import { Trophy } from 'lucide-react'
import RankingModule from '@/modules/ranking/RankingModule'

export default function RankingPage() {
  return <div className="ranking-page p-3 sm:p-6 max-w-[1400px]">
    <div className="relative overflow-hidden rounded-2xl border border-bdr mb-6">
      <img src="/media/races/race-2.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,5,0.95) 0%, rgba(5,7,12,0.75) 45%, rgba(58,114,196,0.25) 100%)' }} />
      <div className="relative p-6 md:p-8">
        <p className="font-mono text-[10px] text-gold3 tracking-[0.25em] uppercase mb-1 flex items-center gap-2"><Trophy size={13} /> Destaques operacionais</p>
        <h1 className="wordmark text-3xl md:text-4xl text-white tracking-wide">Ranking de QRUs</h1>
        <p className="text-sm text-white/70 mt-1">Classificação por registros aprovados e desempenho da unidade.</p>
      </div>
    </div>
    <RankingModule />
  </div>
}
