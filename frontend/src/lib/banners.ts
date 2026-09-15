export interface TierBanner {
  key: string
  label: string
  sub: string
  rank: number      // desbloqueado APENAS para quem está EXATAMENTE nesta posição
  img: string
  overlay: string   // gradiente medalhado sobre a imagem
  glow: string
}
export interface PresetBanner {
  key: string
  label: string
  img?: string
  css?: string
}

// Exclusivos — carro + polícia, tratamento ouro/prata/bronze. Só o dono da posição usa.
export const TIER_BANNERS: TierBanner[] = [
  {
    key: 'top1', label: 'Campeão', sub: 'Nº 1 do ranking', rank: 1, glow: '#f5c451',
    img: '/media/races/race-2.png',
    overlay: 'linear-gradient(105deg, rgba(28,20,2,0.92) 0%, rgba(120,90,15,0.5) 45%, rgba(245,196,81,0.42) 100%)',
  },
  {
    key: 'top2', label: 'Vice-líder', sub: 'Nº 2 do ranking', rank: 2, glow: '#cbd5e1',
    img: '/media/races/race-1.png',
    overlay: 'linear-gradient(105deg, rgba(16,20,26,0.92) 0%, rgba(120,130,145,0.45) 50%, rgba(203,213,225,0.4) 100%)',
  },
  {
    key: 'top3', label: 'Pódio', sub: 'Nº 3 do ranking', rank: 3, glow: '#cd7f45',
    img: '/media/races/race-3.png',
    overlay: 'linear-gradient(105deg, rgba(26,13,4,0.92) 0%, rgba(140,80,40,0.45) 52%, rgba(205,127,69,0.4) 100%)',
  },
]

// Liberados para todos (10 opções + as artes de corrida)
export const PRESET_BANNERS: PresetBanner[] = [
  { key: 'midnight',  label: 'Meia-noite',   css: 'linear-gradient(120deg, #0c1526, #0a1120 55%, #05070c)' },
  { key: 'aco',       label: 'Aço azul',     css: 'linear-gradient(120deg, #0b1220, #1c2e52 60%, #3a72c4)' },
  { key: 'carbono',   label: 'Carbono',      css: 'linear-gradient(135deg, #0a0a0d, #17191f 50%, #0a0a0d)' },
  { key: 'patrulha',  label: 'Patrulha',     css: 'linear-gradient(120deg, #0a0e1a 0%, #1a2b6b 45%, #6b1a1a 100%)' },
  { key: 'operacao',  label: 'Operação',     css: 'linear-gradient(120deg, #07201b, #0a1120 55%, #1c2e52)' },
  { key: 'sentinela', label: 'Sentinela',    css: 'linear-gradient(120deg, #0b1020, #243a6a 60%, #8fb8ee)' },
  { key: 'brasa',     label: 'Brasa',        css: 'linear-gradient(120deg, #1a0a0a, #3a1414 50%, #0a0e1a)' },
  { key: 'abismo',    label: 'Abismo',       css: 'radial-gradient(120% 120% at 20% 0%, #16233f, #05070c 70%)' },
  { key: 'neon',      label: 'Neon',         css: 'linear-gradient(120deg, #05070c, #0a1120 40%, #2a1a4a 85%)' },
  { key: 'gelo',      label: 'Gelo',         css: 'linear-gradient(120deg, #0a1420, #274a63 60%, #9cc0f5)' },
  { key: 'race-2',    label: 'Patrulha noturna', img: '/media/races/race-2.png' },
  { key: 'race-1',    label: 'Perseguição',      img: '/media/races/race-1.png' },
  { key: 'race-4',    label: 'Largada',          img: '/media/races/race-4.png' },
]

export interface ResolvedBanner { img?: string; css?: string; overlay?: string; tier?: TierBanner }

export function unlockedTiers(rankPos: number | null): TierBanner[] {
  if (!rankPos) return []
  return TIER_BANNERS.filter(t => t.rank === rankPos)
}

export function resolveBanner(banner: string | null, rankPos: number | null): ResolvedBanner {
  if (banner && banner.startsWith('data:')) return { img: banner }

  const tier = TIER_BANNERS.find(t => t.key === banner)
  if (tier && rankPos === tier.rank) return { img: tier.img, overlay: tier.overlay, tier }

  const preset = PRESET_BANNERS.find(p => p.key === banner)
  if (preset) return preset.img ? { img: preset.img } : { css: preset.css }

  // padrão: se está no pódio e não escolheu nada, ganha o banner da sua posição
  const own = TIER_BANNERS.find(t => t.rank === rankPos)
  if (own) return { img: own.img, overlay: own.overlay, tier: own }

  return { css: 'linear-gradient(120deg, #0c1526, #0a1120 55%, #05070c)' }
}
