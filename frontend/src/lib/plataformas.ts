/** Reconhece a plataforma de um link do perfil para mostrar nome, cor e emoji padrão. */
export interface Plataforma { nome: string; cor: string; emoji: string }

const PLATAFORMAS: { hosts: string[]; p: Plataforma }[] = [
  { hosts: ['tiktok.com'], p: { nome: 'TikTok', cor: '#ff0050', emoji: '🎵' } },
  { hosts: ['instagram.com'], p: { nome: 'Instagram', cor: '#e1306c', emoji: '📸' } },
  { hosts: ['twitch.tv'], p: { nome: 'Twitch', cor: '#9146ff', emoji: '🎮' } },
  { hosts: ['youtube.com', 'youtu.be'], p: { nome: 'YouTube', cor: '#ff0000', emoji: '▶️' } },
  { hosts: ['kick.com'], p: { nome: 'Kick', cor: '#53fc18', emoji: '🟩' } },
  { hosts: ['discord.gg', 'discord.com'], p: { nome: 'Discord', cor: '#5865f2', emoji: '💬' } },
  { hosts: ['x.com', 'twitter.com'], p: { nome: 'X', cor: '#e7e9ea', emoji: '🐦' } },
  { hosts: ['facebook.com', 'fb.com'], p: { nome: 'Facebook', cor: '#1877f2', emoji: '📘' } },
  { hosts: ['spotify.com'], p: { nome: 'Spotify', cor: '#1db954', emoji: '🎧' } },
  { hosts: ['steamcommunity.com', 'steampowered.com'], p: { nome: 'Steam', cor: '#66c0f4', emoji: '🕹️' } },
  { hosts: ['github.com'], p: { nome: 'GitHub', cor: '#e6edf3', emoji: '💻' } },
  { hosts: ['wa.me', 'whatsapp.com'], p: { nome: 'WhatsApp', cor: '#25d366', emoji: '📱' } },
  { hosts: ['t.me', 'telegram.me'], p: { nome: 'Telegram', cor: '#29a9eb', emoji: '✈️' } },
]

const OUTRO: Plataforma = { nome: 'Link', cor: '#8fb8ee', emoji: '🔗' }

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
