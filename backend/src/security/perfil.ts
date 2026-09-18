/**
 * Personalização do perfil (links e emojis). São dados PÚBLICOS (aparecem no perfil
 * aberto pela tela inicial), então só entram valores inofensivos:
 *  - link: apenas http/https, sem usuário/senha na URL e sem espaços;
 *  - emoji: somente caracteres de emoji (nada de texto livre escondido ali).
 */
export const MAX_LINKS_PERFIL = 8
export const MAX_EMOJIS_PERFIL = 6
export const MAX_URL_LINK = 300

export const MAX_URL_LIVRO = 2048

export function ehLinkPerfil(valor: string, max = MAX_URL_LINK): boolean {
  if (valor.length > max || /[\s<>"'`]/.test(valor)) return false
  try {
    const url = new URL(valor)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
      && !url.username && !url.password
  } catch { return false }
}

// Pictogramas, bandeiras (indicadores regionais), keycaps, tons de pele, ZWJ e seletor de variação
const PARTE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[#*0-9]|\u200d|\ufe0f|\u20e3|[\u{E0020}-\u{E007F}])+$/u
const TEM_PICTOGRAMA = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u

function ehEmojiUnicode(valor: string): boolean {
  return valor.length > 0 && valor.length <= 32 && PARTE_EMOJI.test(valor) && TEM_PICTOGRAMA.test(valor)
}

/**
 * Logos das plataformas (TikTok, Instagram, Twitch…) guardados como `si:<chave>`.
 * Lista branca — igual à de frontend/src/lib/iconesPlataforma.ts (o security-check compara).
 */
export const ICONES_PLATAFORMA = new Set((
  'tiktok instagram twitch youtube kick discord x facebook whatsapp telegram spotify steam github reddit snapchat pinterest threads bluesky netflix roblox epicgames playstation apple google android tinder messenger signal zoom soundcloud deezer applemusic hbo max crunchyroll rockstargames fivem valorant leagueoflegends riotgames counterstrike fortnite ea ubisoft battledotnet paypal pix nubank mercadopago ifood uber airbnb shopee aliexpress gmail claude googlegemini vk patreon kofi linktree tumblr medium wordpress notion figma bereal mastodon line wechat rumble vimeo dailymotion streamlabs obsstudio'
).split(' '))

/** Emoji Unicode de verdade OU logo de plataforma da lista branca. */
export function ehEmoji(valor: string): boolean {
  if (valor.startsWith('si:')) return ICONES_PLATAFORMA.has(valor.slice(3))
  return ehEmojiUnicode(valor)
}
