/** Reconhece a plataforma de um link do perfil para mostrar nome, cor e emoji padrão. */
export interface Plataforma { nome: string; cor: string; emoji: string }

// emoji padrão = logo oficial da plataforma (si:<chave>, ver lib/iconesPlataforma.ts)
const PLATAFORMAS: { hosts: string[]; p: Plataforma }[] = [
  { hosts: ['tiktok.com'], p: { nome: 'TikTok', cor: '#ff0050', emoji: 'si:tiktok' } },
  { hosts: ['instagram.com'], p: { nome: 'Instagram', cor: '#e1306c', emoji: 'si:instagram' } },
  { hosts: ['twitch.tv'], p: { nome: 'Twitch', cor: '#9146ff', emoji: 'si:twitch' } },
  { hosts: ['youtube.com', 'youtu.be'], p: { nome: 'YouTube', cor: '#ff0000', emoji: 'si:youtube' } },
  { hosts: ['kick.com'], p: { nome: 'Kick', cor: '#53fc18', emoji: 'si:kick' } },
  { hosts: ['discord.gg', 'discord.com'], p: { nome: 'Discord', cor: '#5865f2', emoji: 'si:discord' } },
  { hosts: ['x.com', 'twitter.com'], p: { nome: 'X', cor: '#e7e9ea', emoji: 'si:x' } },
  { hosts: ['facebook.com', 'fb.com'], p: { nome: 'Facebook', cor: '#1877f2', emoji: 'si:facebook' } },
  { hosts: ['threads.net', 'threads.com'], p: { nome: 'Threads', cor: '#e7e9ea', emoji: 'si:threads' } },
  { hosts: ['bsky.app'], p: { nome: 'Bluesky', cor: '#1185fe', emoji: 'si:bluesky' } },
  { hosts: ['spotify.com'], p: { nome: 'Spotify', cor: '#1db954', emoji: 'si:spotify' } },
  { hosts: ['soundcloud.com'], p: { nome: 'SoundCloud', cor: '#ff5500', emoji: 'si:soundcloud' } },
  { hosts: ['steamcommunity.com', 'steampowered.com'], p: { nome: 'Steam', cor: '#66c0f4', emoji: 'si:steam' } },
  { hosts: ['roblox.com'], p: { nome: 'Roblox', cor: '#e2e2e2', emoji: 'si:roblox' } },
  { hosts: ['github.com'], p: { nome: 'GitHub', cor: '#e6edf3', emoji: 'si:github' } },
  { hosts: ['reddit.com'], p: { nome: 'Reddit', cor: '#ff4500', emoji: 'si:reddit' } },
  { hosts: ['wa.me', 'whatsapp.com'], p: { nome: 'WhatsApp', cor: '#25d366', emoji: 'si:whatsapp' } },
  { hosts: ['t.me', 'telegram.me'], p: { nome: 'Telegram', cor: '#29a9eb', emoji: 'si:telegram' } },
  { hosts: ['linktr.ee'], p: { nome: 'Linktree', cor: '#43e55e', emoji: 'si:linktree' } },
  { hosts: ['patreon.com'], p: { nome: 'Patreon', cor: '#ff424d', emoji: 'si:patreon' } },
  { hosts: ['ko-fi.com'], p: { nome: 'Ko-fi', cor: '#ff6433', emoji: 'si:kofi' } },
]

const OUTRO: Plataforma = { nome: 'Link', cor: '#c4b5fd', emoji: '🔗' }

/** Só http/https — o backend já valida; aqui é a segunda barreira antes de virar href. */
export function linkSeguro(url: string): boolean {
  try { const u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password } catch { return false }
}

export function plataformaDoLink(url: string): Plataforma {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return PLATAFORMAS.find(x => x.hosts.some(h => host === h || host.endsWith(`.${h}`)))?.p ?? OUTRO
  } catch { return OUTRO }
}
