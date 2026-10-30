/**
 * Quem o Express pode considerar "proxy" ao ler o X-Forwarded-For (app.set('trust proxy', ...)).
 *
 * Na Discloud o caminho é: visitante → Cloudflare → roteador da Discloud → app. Com `trust proxy = 1`
 * o req.ip virava o IP da Cloudflare, e TODO mundo que entrava pelo mesmo ponto da Cloudflare dividia
 * o mesmo limite de envios e o mesmo banimento do firewall ("Requisição recusada" para todos).
 *
 * Regra (o Express lê o X-Forwarded-For da direita para a esquerda e para no 1º não confiável):
 *  - hop 0 (quem conectou no app) é sempre o proxy da hospedagem — igual ao `trust proxy = 1` de antes;
 *  - depois disso, só rede interna (loopback/privada) e os blocos PUBLICADOS da Cloudflare.
 * Um X-Forwarded-For forjado pelo visitante fica à ESQUERDA do IP que a Cloudflare acrescenta,
 * então nunca é alcançado: o req.ip é o IP real de quem fez a requisição.
 */
import net from 'net'

// https://www.cloudflare.com/ips-v4 e https://www.cloudflare.com/ips-v6
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']
// Rede interna da hospedagem (nunca é o visitante)
const PRIVADAS_V4 = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '100.64.0.0/10']
const PRIVADAS_V6 = ['::1/128', 'fc00::/7', 'fe80::/10']

const confiaveis = new net.BlockList()
for (const faixa of [...CLOUDFLARE_V4, ...PRIVADAS_V4]) { const [ip, bits] = faixa.split('/'); confiaveis.addSubnet(ip, Number(bits), 'ipv4') }
for (const faixa of [...CLOUDFLARE_V6, ...PRIVADAS_V6]) { const [ip, bits] = faixa.split('/'); confiaveis.addSubnet(ip, Number(bits), 'ipv6') }

/** IP da Cloudflare ou da rede interna? (aceita "::ffff:1.2.3.4") */
export function ipDeProxy(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7)) ? ip.slice(7) : ip
  if (net.isIPv4(v4)) return confiaveis.check(v4, 'ipv4')
  if (net.isIPv6(v4)) return confiaveis.check(v4, 'ipv6')
  return false
}

/** Função para app.set('trust proxy', ...): hop 0 = proxy da hospedagem; depois, só Cloudflare/rede interna. */
export function proxyConfiavel(ip: string, hop: number): boolean {
  return hop === 0 || ipDeProxy(ip)
}
