import {
  siTiktok, siInstagram, siTwitch, siYoutube, siKick, siDiscord, siX, siFacebook, siWhatsapp, siTelegram,
  siSpotify, siSteam, siGithub, siReddit, siSnapchat, siPinterest, siThreads, siBluesky, siNetflix, siRoblox,
  siEpicgames, siPlaystation, siApple, siGoogle, siAndroid, siTinder, siMessenger, siSignal, siZoom, siSoundcloud,
  siDeezer, siApplemusic, siHbo, siMax, siCrunchyroll, siRockstargames, siFivem, siValorant, siLeagueoflegends,
  siRiotgames, siCounterstrike, siFortnite, siEa, siUbisoft, siBattledotnet, siPaypal, siPix, siNubank,
  siMercadopago, siIfood, siUber, siAirbnb, siShopee, siAliexpress, siGmail, siClaude, siGooglegemini, siVk,
  siPatreon, siKofi, siLinktree, siTumblr, siMedium, siWordpress, siNotion, siFigma, siBereal, siMastodon,
  siLine, siWechat, siRumble, siVimeo, siDailymotion, siStreamlabs, siObsstudio,
  type SimpleIcon,
} from 'simple-icons'

/**
 * Ícones das plataformas (logos oficiais, pacote simple-icons, CC0) usados como
 * "emoji" no perfil. Guardado como `si:<chave>`; a lista de chaves permitidas
 * também existe no backend (security/perfil.ts) — mantenha as duas iguais.
 */
export interface IconePlataforma { chave: string; nome: string; busca: string; cor: string; path: string }

const LISTA: [SimpleIcon, string?][] = [
  [siTiktok], [siInstagram, 'insta ig'], [siTwitch, 'live stream'], [siYoutube, 'yt video'], [siKick, 'live stream'],
  [siDiscord], [siX, 'twitter tweet'], [siFacebook, 'face fb'], [siWhatsapp, 'zap wpp whats'], [siTelegram],
  [siSpotify, 'musica'], [siSteam, 'jogos games'], [siGithub, 'codigo'], [siReddit], [siSnapchat, 'snap'],
  [siPinterest], [siThreads], [siBluesky], [siNetflix, 'filmes series'], [siRoblox, 'jogo'],
  [siEpicgames, 'epic jogos'], [siPlaystation, 'ps ps5 psn sony'], [siApple, 'iphone'], [siGoogle], [siAndroid],
  [siTinder], [siMessenger], [siSignal], [siZoom], [siSoundcloud, 'musica'],
  [siDeezer, 'musica'], [siApplemusic, 'musica'], [siHbo, 'hbo max'], [siMax, 'hbo max'], [siCrunchyroll, 'anime'],
  [siRockstargames, 'gta rockstar'], [siFivem, 'gta rp fivem cfx'], [siValorant, 'jogo riot'], [siLeagueoflegends, 'lol jogo riot'],
  [siRiotgames, 'riot'], [siCounterstrike, 'cs cs2 csgo'], [siFortnite, 'jogo'], [siEa, 'ea games fifa'], [siUbisoft],
  [siBattledotnet, 'battlenet blizzard'], [siPaypal], [siPix, 'pagamento'], [siNubank, 'nu banco'],
  [siMercadopago, 'mercado pago'], [siIfood, 'comida'], [siUber], [siAirbnb], [siShopee], [siAliexpress],
  [siGmail, 'email'], [siClaude, 'ia ai'], [siGooglegemini, 'gemini ia ai'], [siVk],
  [siPatreon], [siKofi, 'ko-fi doacao'], [siLinktree, 'links'], [siTumblr], [siMedium], [siWordpress, 'blog'],
  [siNotion], [siFigma], [siBereal], [siMastodon], [siLine], [siWechat], [siRumble], [siVimeo], [siDailymotion],
  [siStreamlabs, 'live'], [siObsstudio, 'obs live'],
]

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Cor da marca; as muito escuras (X, Threads, Apple…) viram brancas no fundo escuro do sistema. */
function corVisivel(hex: string): string {
  const n = parseInt(hex, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.28 ? '#f4f4f5' : `#${hex}`
}

export const ICONES_PLATAFORMA: IconePlataforma[] = LISTA.map(([i, extra]) => ({
  chave: i.slug, nome: i.title, cor: corVisivel(i.hex), path: i.path,
  busca: normalizar(`${i.title} ${i.slug} ${extra ?? ''} logo plataforma rede social`),
}))

const PorChave = new Map(ICONES_PLATAFORMA.map(i => [i.chave, i]))

export const PREFIXO_ICONE = 'si:'
export const iconeDoValor = (valor: string): IconePlataforma | undefined =>
  valor.startsWith(PREFIXO_ICONE) ? PorChave.get(valor.slice(PREFIXO_ICONE.length)) : undefined
