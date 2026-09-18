/**
 * Personalização do perfil (links e emojis). São dados PÚBLICOS (aparecem no perfil
 * aberto pela tela inicial), então só entram valores inofensivos:
 *  - link: apenas http/https, sem usuário/senha na URL e sem espaços;
 *  - emoji: somente caracteres de emoji (nada de texto livre escondido ali).
 */
export const MAX_LINKS_PERFIL = 8
export const MAX_EMOJIS_PERFIL = 6
export const MAX_URL_LINK = 300

export function ehLinkPerfil(valor: string): boolean {
  if (valor.length > MAX_URL_LINK || /[\s<>"'`]/.test(valor)) return false
  try {
    const url = new URL(valor)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
      && !url.username && !url.password
  } catch { return false }
}

// Pictogramas, bandeiras (indicadores regionais), keycaps, tons de pele, ZWJ e seletor de variação
const PARTE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[#*0-9]|‍|️|⃣|[\u{E0020}-\u{E007F}])+$/u
const TEM_PICTOGRAMA = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u

export function ehEmoji(valor: string): boolean {
  return valor.length > 0 && valor.length <= 32 && PARTE_EMOJI.test(valor) && TEM_PICTOGRAMA.test(valor)
}
