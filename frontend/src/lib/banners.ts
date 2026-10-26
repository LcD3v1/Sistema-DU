export interface PresetBanner {
  key: string
  label: string
  img?: string
  css?: string
}

/** Artes temáticas da DU (roxo + investigação). Sem escolha, o membro recebe uma delas. */
export const DU_BANNERS: PresetBanner[] = [
  { key: 'du-lupa',      label: 'Lupa',            img: '/media/du/banner-1.webp' },
  { key: 'du-quadro',    label: 'Quadro do caso',  img: '/media/du/banner-2.webp' },
  { key: 'du-detetive',  label: 'Detetive',        img: '/media/du/banner-3.webp' },
  { key: 'du-distintivo', label: 'Distintivo',     img: '/media/du/banner-4.webp' },
  { key: 'du-arquivo',   label: 'Arquivo',         img: '/media/du/banner-5.webp' },
  { key: 'du-cidade',    label: 'Detroit à noite', img: '/media/du/banner-6.webp' },
]

// Liberados para todos: artes da DU + fundos em tons de roxo
export const PRESET_BANNERS: PresetBanner[] = [
  ...DU_BANNERS,
  { key: 'midnight',  label: 'Meia-noite',  css: 'linear-gradient(120deg, #120a22, #0f0a1a 55%, #07050b)' },
  { key: 'purpura',   label: 'Púrpura',     css: 'linear-gradient(120deg, #0a0716, #2a1a4a 55%, #5b3aa0)' },
  { key: 'ametista',  label: 'Ametista',    css: 'linear-gradient(120deg, #0b0812, #2d1a4d 60%, #8b5cf6)' },
  { key: 'neon',      label: 'Neon',        css: 'linear-gradient(120deg, #07050b, #0f0a1a 40%, #3b1d6e 85%)' },
  { key: 'abismo',    label: 'Abismo',      css: 'radial-gradient(120% 120% at 20% 0%, #221540, #07050b 70%)' },
  { key: 'eclipse',   label: 'Eclipse',     css: 'radial-gradient(120% 120% at 50% 120%, #3b1d6e, #07050b 60%)' },
  { key: 'vinho',     label: 'Vinho',       css: 'linear-gradient(120deg, #14060f, #3a0f2e 50%, #0d0918)' },
  { key: 'lavanda',   label: 'Lavanda',     css: 'linear-gradient(120deg, #0d0a18, #3f2a6b 55%, #c4b5fd)' },
  { key: 'carbono',   label: 'Carbono',     css: 'linear-gradient(135deg, #0a0a0d, #17121f 50%, #0a0a0d)' },
  { key: 'vortex',    label: 'Vórtex',      css: 'radial-gradient(130% 130% at 80% 20%, #4c1d95, #07050b 70%)' },
]

export interface ResolvedBanner { img?: string; css?: string; overlay?: string }

/** Escolha estável por pessoa (mesmo banner sempre que ela abre o perfil). */
function sorteado(semente: number | string | null | undefined): PresetBanner {
  const s = String(semente ?? '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return DU_BANNERS[h % DU_BANNERS.length]
}

/**
 * Banner do perfil: imagem enviada/link → preset escolhido → arte DU "aleatória"
 * (fixa por pessoa, pela semente). Chaves antigas (ranking/corrida) caem no padrão.
 */
export function resolveBanner(banner: string | null, semente?: number | string | null): ResolvedBanner {
  if (banner && /^(data:image\/|https?:\/\/)/i.test(banner)) return { img: banner }
  const preset = PRESET_BANNERS.find(p => p.key === banner) ?? sorteado(semente)
  return preset.img ? { img: preset.img } : { css: preset.css }
}
