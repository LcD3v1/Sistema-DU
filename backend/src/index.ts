// IMPORTANTE: valida variáveis de ambiente ANTES de qualquer outra coisa.
// Se JWT_SECRET estiver ausente/fraco/placeholder, o processo aborta aqui.
import { env } from './config/env'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import hpp from 'hpp'
import { securityHeaders, permissionsPolicy, apiHeaders, forcarHttps } from './middleware/securityHeaders'
import {
  globalLimiter, apiLimiter, mutationLimiter, uploadLimiter, arquivoLimiter, publicLimiter, rankingLimiter, backupLimiter, revisaoLimiter, fotoLimiter,
} from './middleware/rateLimiter'
import { sanitizeBody } from './middleware/sanitize'
import { audit } from './security/audit'
import { firewall, registrarInfracao, PONTOS } from './security/firewall'
import { proxyConfiavel } from './security/proxyConfiavel'
import { contaDaRequisicao } from './security/contaDaRequisicao'
import { antiFlood } from './middleware/antiFlood'
import { limiteConcorrente, protecaoSobrecarga } from './middleware/cargaServidor'
import { iniciarPersistenciaRevogacoes, encerrarPersistenciaRevogacoes } from './security/tokenBlacklist'
import { initData, closeData, ensureDefaultAdmin, ensureNivelMigration, ensureDuPermissionRoles, migrarPatentesParaDpd } from './data'
import { criptografiaDisponivel } from './security/crypto'
import { gravarAtomico, PASTA_DADOS } from './armazenamento'
import { verificarAusencias } from './efetivo'
import { iniciarBackupAutomatico } from './backupAutomatico'
import { limparNotificacoesAntigas } from './notificacoes'
import { discordConfig, verificarSaidasDoServidor } from './discord'
import { readData as lerDados, writeData as gravarDados } from './data'
import authRoutes from './routes/auth'
import publicRoutes from './routes/public'
import { createRankingRouter } from './modules/ranking/router'
import membrosRoutes from './routes/membros'
import acoesRoutes from './routes/acoes'
import configRoutes from './routes/config'
import recrutasRoutes from './routes/recrutas'
import ausenciasRoutes from './routes/ausencias'
import avisosRoutes from './routes/avisos'
import fardamentosRoutes from './routes/fardamentos'
import cursosRoutes from './routes/cursos'
import notificacoesRoutes from './routes/notificacoes'
import arquivosRoutes from './routes/arquivos'
import relatoriosRoutes from './routes/relatorios'
import boletinsRoutes from './routes/boletins'
import inqueritosRoutes from './routes/inqueritos'
import investigacoesRoutes from './routes/investigacoes'
import arvoresRoutes from './routes/arvores'
import galeriaRoutes from './routes/galeria'
import hierarquiaRoutes from './routes/hierarquia'
import servidorRoutes from './routes/servidor'
import setagemRoutes from './routes/setagem'
import carteiraRoutes from './routes/carteira'
import logsRoutes from './routes/logs'
import protocoloRoutes from './routes/protocolo'
import { iniciarLogs } from './logs'
import { publicarSetagem, tratarInteracao, vincularContasAoEfetivo, cadastrarPatentesESetores, atualizarPatentesDu } from './setagem'
import { iniciarGateway } from './discord'
import { iniciarPainelHierarquia } from './hierarquia'
import { uploadRouter as anuncioImagemUpload, publicoRouter as anuncioImagemPublica } from './routes/anuncioImagem'

const app = express()
const PROD = env.PROD

// Proxy da hospedagem + Cloudflare/rede interna (security/proxyConfiavel.ts) → req.ip = IP real do visitante.
// Deve vir antes de firewall e rate limit (ambos usam req.ip).
app.set('trust proxy', proxyConfiavel)
app.disable('x-powered-by')
app.set('etag', false) // sem ETag nas respostas dinâmicas (estáticos têm o próprio)
app.set('query parser', 'simple') // sem objetos aninhados na query (?a[$ne]=1)

// ── Segurança: camada 0 — firewall (banimento por abuso, assinaturas de ataque) ─
app.use(firewall)

// ── Segurança: camada 1 — HTTPS + headers HTTP ───────────────────────────────
app.use(forcarHttps)
app.use(securityHeaders)
app.use(permissionsPolicy)

// ── Segurança: camada 1.5 — servidor sobrecarregado e requisições simultâneas por IP ─
app.use(protecaoSobrecarga)
app.use(limiteConcorrente)

// ── Segurança: camada 2 — rate limiting global ────────────────────────────────
app.use(globalLimiter)

// ── CORS (apenas desenvolvimento) ────────────────────────────────────────────
if (!PROD) {
  app.use(cors({
    origin: env.ALLOWED_ORIGIN,
    credentials: true,
  }))
}

// ── Parser + proteção contra HTTP Parameter Pollution ─────────────────────────
// Corpo grande só nas rotas de upload; o resto fica limitado (evita abuso de memória/CPU)
const jsonGrande = express.json({ limit: '5mb' })
const jsonPadrao = express.json({ limit: '200kb' })
const ROTAS_UPLOAD = /^\/api\/(auth\/me\/(avatar|banner)|config\/(logo|restore)|fardamentos|anuncio\/imagem|hierarquia|setagem|carteira|protocolo)(\/|$)/
app.use((req, res, next) => (ROTAS_UPLOAD.test(req.path) ? jsonGrande : jsonPadrao)(req, res, next))
app.use(hpp())

// ── Sanitização de inputs ────────────────────────────────────────────────────
app.use(sanitizeBody)

// ── API routes com rate limit específico ─────────────────────────────────────
app.use('/api', apiHeaders)
// Polling de revisão (a cada 4s por aba): limite próprio e folgado, fora dos limites geral/público
// para não banir quem abre várias abas ou divide IP (CGNAT)
// originalUrl: dentro de app.use('/api') o req.path é relativo ao ponto de montagem
const ehRevisao = (req: Request) => req.method === 'GET' && req.originalUrl.split('?')[0] === '/api/public/revisao'
// Fotos dos membros (link opaco): limite próprio, fora dos limites geral/público (listas com muitas fotos)
const ehFoto = (req: Request) => req.method === 'GET' && /^\/api\/public\/foto\/[A-Za-z0-9_-]{22}$/.test(req.originalUrl.split('?')[0])
app.use((req, res, next) => (ehRevisao(req) ? revisaoLimiter(req, res, next) : ehFoto(req) ? fotoLimiter(req, res, next) : next()))
// Anti-flood por conta: ações demais em poucos segundos → aquela ação espera 10 s (sem banir ninguém)
app.use('/api', (req, res, next) => (ehRevisao(req) || ehFoto(req) ? next() : antiFlood(req, res, next)))
app.use('/api', (req, res, next) => (ehRevisao(req) || ehFoto(req) ? next() : apiLimiter(req, res, next)))
app.use('/api', mutationLimiter) // só POST/PUT/PATCH/DELETE
app.use((req, res, next) => (ROTAS_UPLOAD.test(req.path) ? uploadLimiter(req, res, next) : next()))
app.use('/api/public', (req, res, next) => (ehRevisao(req) || ehFoto(req) ? next() : publicLimiter(req, res, next))) // inclui /api/public/directory
app.use('/api/ranking', rankingLimiter)
app.use('/api/config/backup', backupLimiter)
// Envio de arquivos (corpo cru de até 10 MB, parser só na própria rota)
app.use('/api/arquivos', (req, res, next) => (req.method === 'POST' ? arquivoLimiter(req, res, next) : next()))
app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/ranking', createRankingRouter())
app.use('/api/public/directory', createRankingRouter(true))
app.use('/api/membros', membrosRoutes)
app.use('/api/acoes', acoesRoutes)
app.use('/api/config', configRoutes)
app.use('/api/recrutas', recrutasRoutes)
app.use('/api/ausencias', ausenciasRoutes)
app.use('/api/avisos', avisosRoutes)
app.use('/api/fardamentos', fardamentosRoutes)
app.use('/api/cursos', cursosRoutes)
app.use('/api/notificacoes', notificacoesRoutes)
app.use('/api/anuncio', anuncioImagemUpload)
app.use('/api/arquivos', arquivosRoutes)
app.use('/api/relatorios', relatoriosRoutes)
app.use('/api/boletins', boletinsRoutes)
app.use('/api/inqueritos', inqueritosRoutes)
app.use('/api/investigacoes', investigacoesRoutes)
app.use('/api/arvores', arvoresRoutes)
app.use('/api/galeria', galeriaRoutes)
app.use('/api/hierarquia', hierarquiaRoutes)
app.use('/api/servidor', servidorRoutes)
app.use('/api/setagem', setagemRoutes)
app.use('/api/carteira', carteiraRoutes)
app.use('/api/logs', logsRoutes)
app.use('/api/protocolo', protocoloRoutes)

// Link público das fotos do Gerar anúncio (o jogo abre sem login; limite: globalLimiter)
app.use('/img', anuncioImagemPublica)

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ── 404 para rotas de API não encontradas (não cai no fallback do SPA) ─────────
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Recurso não encontrado' })
})

/**
 * URL pública do site para as tags de prévia (og:image precisa ser absoluta).
 * Usa PUBLIC_URL se definido; senão deriva do host da requisição (validado).
 */
function urlDoSite(req: Request): string {
  const fixa = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (fixa && /^https?:\/\/[\w.-]+(:\d+)?$/i.test(fixa)) return fixa
  const host = req.get('host') ?? ''
  const proto = req.protocol === 'https' ? 'https' : 'http'
  return /^[\w.-]+(:\d+)?$/.test(host) ? `${proto}://${host}` : ''
}

// ── Serve frontend buildado ───────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist')
if (existsSync(frontendDist)) {
  // index.html é entregue pela rota abaixo (com a URL do site nas tags de prévia)
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      } else if (/\.(js|css|woff2?|ttf|otf|eot)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))
  const indexHtml = readFileSync(path.join(frontendDist, 'index.html'), 'utf-8')
  app.use((req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    const ambiente = process.env.AMBIENTE === 'local' ? 'local' : 'producao'
    res.type('html').send(indexHtml.replace(/__SITE_URL__/g, urlDoSite(req)).replace(/__AMBIENTE__/g, ambiente))
  })
  console.log('[DU] Servindo frontend de:', frontendDist)
} else {
  console.log('[DU] Frontend dist não encontrado — rode: npm run build')
}

// ── Tratador global de erros ──────────────────────────────────────────────────
// Nunca vaza stack trace ao cliente; registra internamente para auditoria.
// Erros do parser de corpo (JSON inválido, grande demais…) viram 4xx genérico,
// sem ecoar a mensagem (ela cita trechos do corpo enviado).
const ERROS_CORPO: Record<string, [number, string]> = {
  'entity.parse.failed': [400, 'Requisição inválida'],
  'entity.too.large': [413, 'Conteúdo muito grande'],
  'encoding.unsupported': [415, 'Requisição inválida'],
  'charset.unsupported': [415, 'Requisição inválida'],
  'entity.verify.failed': [400, 'Requisição inválida'],
  'request.aborted': [400, 'Requisição inválida'],
  'request.size.invalid': [400, 'Requisição inválida'],
  'stream.encoding.set': [500, 'Erro interno do servidor'],
  'parameters.too.many': [413, 'Conteúdo muito grande'],
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { type?: string; status?: number }, req: Request, res: Response, _next: NextFunction) => {
  const corpo = typeof err?.type === 'string' ? ERROS_CORPO[err.type] : undefined
  if (corpo) {
    // Só o tipo do erro é registrado (nunca a mensagem)
    try { if (contaDaRequisicao(req) === undefined) registrarInfracao(req, `corpo_${err.type}`, PONTOS.CORPO_INVALIDO) } catch { /* noop */ }
    if (!res.headersSent) res.status(corpo[0]).json({ error: corpo[1] })
    return
  }
  // Mensagem/stack só no console fora de produção; em produção apenas o nome do erro
  console.error('[DU][ERRO]', PROD ? (err?.name ?? 'Error') : err?.message)
  if (!PROD && err?.stack) console.error(err.stack)
  try { audit('UNAUTHORIZED_ACCESS', req, `Erro não tratado: ${err?.name ?? 'desconhecido'}`) } catch { /* noop */ }
  if (res.headersSent) return
  res.status(500).json({ error: 'Erro interno do servidor' })
})

// A hospedagem define PORT (Discloud: 8080, em start:discloud); em produção sem PORT, usa 80
const PORT = parseInt(process.env.PORT || (PROD ? '80' : '3001'), 10)

async function iniciar(): Promise<void> {
  await initData()
  await iniciarPersistenciaRevogacoes() // logout sobrevive a reinícios
  ensureDefaultAdmin()
  ensureNivelMigration()
  iniciarBackupAutomatico()   // backup criptografado agora e a cada 24 h
  // Patentes no formato DPD (uma vez, depois do backup acima; sem chave de backup, guarda uma cópia simples antes)
  if (migrarPatentesParaDpd(conteudo => { if (!criptografiaDisponivel()) gravarAtomico(path.join(PASTA_DADOS, `antes-dpd-${Date.now()}.json`), conteudo) })) {
    console.log('[DU][DADOS] Patentes convertidas para DPD (backup feito antes).')
  }
  ensureDuPermissionRoles()
  iniciarLogs()   // logs do painel: eventos do site na hora; registro de auditoria do Discord a cada 1 min
  // Vínculo conta ↔ efetivo: conta aprovada sem ficha em Membros ganha a sua (depois do backup acima)
  // Patentes da DU e setores iniciais (uma vez, depois do backup acima)
  { const d = lerDados(); if (atualizarPatentesDu(d)) { gravarDados(d); console.log('[DU][DADOS] Patentes da DU atualizadas (Supervisor of Detectives).') } }
  { const d = lerDados(); if (cadastrarPatentesESetores(d)) { gravarDados(d); console.log('[DU][DADOS] Patentes da DU e setores (COD, DNARC, COD/DNARC) cadastrados.') } }
  { const d = lerDados(); const n = vincularContasAoEfetivo(d); if (n) { gravarDados(d); console.log(`[DU][DADOS] ${n} conta(s) aprovada(s) vinculada(s) ao efetivo.`) } }
  const servidor = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DU] Sistema rodando na porta ${PORT} (${process.env.PORT ? 'definida pela hospedagem/.env' : 'padrão'})`)
    const publica = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '')
    console.log(`[DU] ➜  Abra no navegador: ${PROD && publica ? publica : `http://localhost:${PORT}`}`)
    console.log(`[DU] Ambiente: ${PROD ? 'produção' : 'desenvolvimento'}`)
  })
  // Contra conexões lentas de propósito (slowloris): cabeçalhos em até 15 s, requisição inteira em até 2 min
  // (upload grande numa conexão ruim cabe), conexão parada fecha; poucos cabeçalhos por requisição
  servidor.headersTimeout = 15_000
  servidor.requestTimeout = 120_000
  servidor.keepAliveTimeout = 65_000
  servidor.maxHeadersCount = 100
  servidor.maxRequestsPerSocket = 1000

  // Rotina (1 min): ausências (início/fim do período) e limpeza de notificações
  const rotina = () => {
    try { verificarAusencias() } catch (err) { console.error('[DU] rotina de ausências:', err) }
    // Notificações com mais de 7 dias são apagadas
    try { const d = lerDados(); if (limparNotificacoesAntigas(d)) gravarDados(d) } catch (err) { console.error('[DU] limpeza de notificações:', err) }
  }
  rotina()
  setInterval(rotina, 60_000)

  // Saída do servidor do Discord → exoneração automática (consulta pelo bot, a cada N minutos)
  if (discordConfig()) {
    const minutos = Math.min(Math.max(parseInt(process.env.DISCORD_VERIFICAR_MINUTOS ?? '', 10) || 3, 1), 60)
    const verificar = () => { verificarSaidasDoServidor().catch(() => console.error('[DU] verificação do servidor do Discord falhou')) }
    setTimeout(verificar, 15_000).unref()
    setInterval(verificar, minutos * 60_000).unref()
    iniciarPainelHierarquia()   // painel de hierarquia no Discord (a cada 1 min)
    // Setagem: painel com botão (republica a cada 10 min se alguém apagar) + cliques pelo Gateway.
    // DISCORD_INTERACOES=off desliga os botões nesta instância (só UMA instância deve responder por bot).
    setTimeout(() => { void publicarSetagem(true) }, 25_000).unref()
    setInterval(() => { void publicarSetagem(true) }, 10 * 60_000).unref()
    if (!/^(off|false|0)$/i.test(process.env.DISCORD_INTERACOES?.trim() ?? '')) {
      const cfgDiscord = discordConfig()!
      iniciarGateway(cfgDiscord, i => { tratarInteracao(i).catch(() => console.error('[DU] falha ao tratar interação da setagem')) })
      console.log('[DU] Conectando o bot ao Discord (botões da setagem)…')
    }
  } else {
    console.warn('[DU][ATENÇÃO] Login pelo Discord não configurado (variáveis DISCORD_* do .env.example) — ninguém consegue entrar.')
  }
}

// Desligamento limpo: grava o que estiver pendente no arquivo de dados.
for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => { Promise.allSettled([closeData(), encerrarPersistenciaRevogacoes()]).finally(() => process.exit(0)) })
}

// Rede de segurança: uma promessa esquecida numa rotina (Discord fora, etc.) não derruba o site de todo mundo.
// Só a mensagem vai para o log (o console já passa por redact()).
const mensagemDoErro = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)
process.on('unhandledRejection', motivo => { console.error('[DU] Promessa rejeitada sem tratamento:', mensagemDoErro(motivo)) })
// Erro fatal de verdade: grava os dados pendentes antes de sair (a hospedagem reinicia o processo)
process.once('uncaughtException', err => {
  console.error('[DU] Erro fatal:', mensagemDoErro(err))
  Promise.allSettled([closeData(), encerrarPersistenciaRevogacoes()]).finally(() => process.exit(1))
})

iniciar().catch(err => {
  console.error('[DU] Erro ao inicializar:', err instanceof Error ? err.message : err)
  process.exit(1)
})
