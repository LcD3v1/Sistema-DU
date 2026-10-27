import { z, ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'
import type { CanaisDiscord } from '../types'
import { imagemValida, ehImagemEnviada, ehLinkImagem, MAX_URL_IMAGEM } from '../security/imagem'
import { ehEmoji, ehLinkPerfil, MAX_LINKS_PERFIL, MAX_EMOJIS_PERFIL, MAX_URL_LINK, MAX_URL_LIVRO } from '../security/perfil'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: 'Dados inválidos',
        details: result.error.issues.map(e =>
          `${(e.path as (string|number|symbol)[]).map(String).join('.')}: ${e.message}`
        ),
      })
      return
    }
    req.body = result.data
    next()
  }
}

// ── Schemas ──────────────────────────────────────────────────────────────────
// Em Zod v4, transform() cria ZodPipe; min/max devem vir ANTES do transform

const safeStr = (min: number, max: number) =>
  z.string().min(min).max(max).transform((s: string) => s.trim())

const safeStrOpt = (max: number) =>
  z.string().max(max).transform((s: string) => s.trim())

const nivelSchema = z.coerce.number({ message: 'Informe o seu nível' }).int('Nível deve ser um número inteiro').min(1, 'Nível mínimo é 1').max(999, 'Nível máximo é 999')

export const updateContaSchema = z.object({
  nivel: z.enum(['admin', 'moderador', 'membro', 'view_only']).optional(),
  ativo: z.boolean().optional(),
  cargoPermId: z.number().int().positive().nullable().optional(),
}).refine(body => Object.keys(body).length > 0, { message: 'Nenhum campo fornecido' })

const permAreaSchema = z.object({ ver: z.boolean(), editar: z.boolean() })

export const cargoPermCreateSchema = z.object({
  nome:       safeStr(1, 50),
  admin:      z.boolean().optional(),
  dev:        z.boolean().optional(),
  permissoes: z.record(z.string(), permAreaSchema).default({}),
})

export const cargoPermUpdateSchema = z.object({
  nome:       safeStr(1, 50).optional(),
  padrao:     z.boolean().optional(),
  admin:      z.boolean().optional(),
  dev:        z.boolean().optional(),
  permissoes: z.record(z.string(), permAreaSchema).optional(),
}).refine(b => Object.keys(b).filter(k => b[k as keyof typeof b] !== undefined).length > 0, {
  message: 'Nenhum campo fornecido',
})

export const membroSchema = z.object({
  badge:          safeStrOpt(20).default(''),
  passaporte:     safeStrOpt(20).default(''),
  policial:       safeStr(1, 100),
  patenteNPD:     safeStrOpt(50).default(''),
  patenteInterna: safeStrOpt(50).default(''),
  codinome:       safeStrOpt(40).default(''),
  status:         z.enum(['Ativo', 'Inativo', 'Ausência']).default('Ativo'),
  entrada:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  promocao:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adv1:           z.boolean().default(false),
  adv2:           z.boolean().default(false),
  adv3:           z.boolean().default(false),
})

export const membroUpdateSchema = z.object({
  nivel:          nivelSchema.optional(),
  badge:          safeStrOpt(20).optional(),
  passaporte:     safeStrOpt(20).optional(),
  policial:       safeStr(1, 100).optional(),
  patenteNPD:     safeStrOpt(50).optional(),
  patenteInterna: safeStrOpt(50).optional(),
  codinome:       safeStrOpt(40).optional(),
  status:         z.enum(['Ativo', 'Inativo', 'Ausência']).optional(),
  entrada:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  promocao:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adv1:           z.boolean().optional(),
  adv2:           z.boolean().optional(),
  adv3:           z.boolean().optional(),
}).refine(body => Object.keys(body).filter(k => body[k as keyof typeof body] !== undefined).length > 0, {
  message: 'Nenhum campo fornecido',
})

export const acaoSchema = z.object({
  data:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  qru:          safeStr(1, 200),
  tipo:         z.enum(['convencional', 'fechado']),
  resultado:    z.enum(['Vitória', 'Derrota']).optional(),
  comandante:   z.string().max(100).optional(),
  local:        safeStrOpt(120).optional(),
  imagem:       z.string().max(MAX_URL_IMAGEM).refine(s => s === '' || ehLinkImagem(s), 'Imagem deve ser um link http/https').optional(),
  participants: z.array(z.object({
    memberId:       z.number().int().positive(),
    patenteUnidade: safeStrOpt(50),
  })).default([]),
  participantesExtras: z.array(z.object({
    nome:    safeStr(1, 100),
    patente: z.string().max(50).optional(),
  })).default([]),
}).refine(b => (b.tipo === 'fechado') === (b.resultado !== undefined), {
  message: 'Resultado (vitória/derrota) só em QRU fechado — e obrigatório nele',
  path: ['resultado'],
})

export const recrutaCreateSchema = z.object({
  nome:        safeStr(1, 100),
  data:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacoes: safeStrOpt(500).default(''),
})

export const avaliacaoRecrutaSchema = z.object({
  scores:      z.record(z.string(), z.number().min(0).max(10)).default({}),
  total:       z.number().min(0).max(10).default(0),
  observacoes: safeStrOpt(500).default(''),
})

export const ausenciaSchema = z.object({
  memberId:   z.number().int().positive(),
  nome:       safeStr(1, 100),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida'),
  dataFim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida'),
  motivo:     safeStrOpt(500).default(''),
}).refine(b => b.dataFim >= b.dataInicio, {
  message: 'A data final deve ser igual ou posterior à inicial',
  path: ['dataFim'],
})

export const situacaoAnuncioSchema = z.object({
  label:  safeStr(1, 60),
  titulo: safeStr(1, 100),
  texto:  safeStr(1, 2000),
})

export const situacaoAnuncioUpdateSchema = z.object({
  label:  safeStr(1, 60).optional(),
  titulo: safeStr(1, 100).optional(),
  texto:  safeStr(1, 2000).optional(),
}).refine(b => Object.keys(b).filter(k => b[k as keyof typeof b] !== undefined).length > 0, {
  message: 'Nenhum campo fornecido',
})

export const onboardingSchema = z.object({
  nivel:          nivelSchema,
  policial:       safeStr(1, 100),
  badge:          safeStrOpt(20).default(''),
  passaporte:     safeStrOpt(20).default(''),
  patenteNPD:     safeStrOpt(50).default(''),
  patenteInterna: safeStrOpt(50).default(''),
  codinome:       safeStrOpt(40).default(''),
})

export const membroSelfSchema = z.object({
  nivel:          nivelSchema.optional(),
  policial:       safeStr(1, 100).optional(),
  badge:          safeStrOpt(20).optional(),
  passaporte:     safeStrOpt(20).optional(),
  patenteNPD:     safeStrOpt(50).optional(),
  patenteInterna: safeStrOpt(50).optional(),
  codinome:       safeStrOpt(40).optional(),
}).refine(b => Object.keys(b).filter(k => b[k as keyof typeof b] !== undefined).length > 0, {
  message: 'Nenhum campo fornecido',
})

export const avisoSchema = z.object({
  titulo:   safeStr(1, 120),
  mensagem: safeStr(1, 2000),
})


export const fardamentoSchema = z.object({
  patente:     safeStr(1, 50),
  titulo:      safeStrOpt(100).default(''),
  imagem:      z.string().min(1).max(3_500_000).refine(imagemValida, 'Imagem inválida (use upload ou URL http/https)'),
  observacoes: safeStrOpt(500).default(''),
})

// Cursos Internos (biblioteca de livros por link)
const linkLivro = z.string().max(MAX_URL_LIVRO).transform(s => s.trim()).refine(s => ehLinkPerfil(s, MAX_URL_LIVRO), 'Link inválido (use http:// ou https://)')
const capaLivro = z.string().max(MAX_URL_IMAGEM).transform(s => s.trim()).refine(s => s === '' || ehLinkImagem(s), 'Capa deve ser um link de imagem http/https')
const corLivro = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
const camposLivro = {
  titulo:    safeStr(1, 120),
  autor:     safeStrOpt(80),
  descricao: safeStrOpt(600),
  categoria: safeStrOpt(40),
  url:       linkLivro,
  capa:      capaLivro,
  cor:       corLivro,
}
// ── Módulos investigativos (DU) ──────────────────────────────────────────────
const dataDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
const linkRegistro = z.object({
  rotulo: safeStrOpt(60).default(''),
  url:    z.string().max(MAX_URL_LIVRO).transform(s => s.trim()).refine(s => ehLinkPerfil(s, MAX_URL_LIVRO), 'Link inválido (use http:// ou https://)'),
}).strict()
const linksRegistro = z.array(linkRegistro).max(30, 'No máximo 30 links')
/** IDs devolvidos por POST /api/arquivos (conferidos no banco antes de gravar). */
const idsArquivos = z.array(z.string().regex(/^[A-Za-z0-9_-]{24}$/, 'Arquivo inválido')).max(20, 'No máximo 20 arquivos')
const investigadoresIds = z.array(z.number().int().positive()).max(30, 'No máximo 30 investigadores')
const linkImagem = z.string().max(MAX_URL_IMAGEM).transform(s => s.trim()).refine(ehLinkImagem, 'Imagem deve ser um link http/https')
const idOpcional = z.number().int().positive().nullable().optional()

export const relatorioSchema = z.object({
  titulo:         safeStr(1, 150),
  tipo:           safeStrOpt(40).default(''),
  data:           dataDia,
  conteudo:       safeStr(1, 20_000),
  investigadores: investigadoresIds.default([]),
  inqueritoId:    idOpcional,
  boletimId:      idOpcional,
  links:          linksRegistro.default([]),
  arquivos:       idsArquivos.default([]),
  sigiloso:       z.boolean().default(false),
}).strict()

export const boletimSchema = z.object({
  numero:         safeStrOpt(40).default(''),           // vazio = gerado (BO-DU-ANO-0001)
  titulo:         safeStr(1, 150),
  status:         z.enum(['aberto', 'em_investigacao', 'concluido', 'arquivado']).default('aberto'),
  data:           dataDia,
  local:          safeStrOpt(150).default(''),
  investigadores: investigadoresIds.default([]),
  descricao:      safeStr(1, 20_000),
  observacoes:    safeStrOpt(5_000).default(''),
  imagens:        z.array(linkImagem).max(30, 'No máximo 30 imagens').default([]),
  links:          linksRegistro.default([]),
  arquivos:       idsArquivos.default([]),
  inqueritoId:    idOpcional,
}).strict()

export const inqueritoSchema = z.object({
  numero:         safeStrOpt(40).default(''),           // vazio = gerado (IP-DU-ANO-0001)
  titulo:         safeStr(1, 150),
  status:         z.enum(['em_andamento', 'concluido', 'arquivado']).default('em_andamento'),
  categoria:      safeStrOpt(40).default(''),
  descricao:      safeStrOpt(20_000).default(''),
  envolvidos:     safeStrOpt(5_000).default(''),
  capa:           z.string().max(MAX_URL_IMAGEM).transform(s => s.trim()).refine(s => s === '' || ehLinkImagem(s), 'Capa deve ser um link de imagem http/https').default(''),
  cor:            z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').default('#8b5cf6'),
  investigadores: investigadoresIds.default([]),
  links:          linksRegistro.default([]),
  arquivos:       idsArquivos.default([]),
}).strict()

export const fotoGaleriaSchema = z.object({
  imagem:    z.string().max(MAX_URL_IMAGEM).transform(s => s.trim()).refine(s => s === '' || ehLinkImagem(s), 'Imagem deve ser um link http/https').default(''),
  arquivo:   z.string().regex(/^[A-Za-z0-9_-]{24}$/, 'Arquivo inválido').or(z.literal('')).default(''),
  titulo:    safeStr(1, 120),
  descricao: safeStrOpt(1_000).default(''),
  categoria: safeStrOpt(40).default(''),
  data:      dataDia,
}).strict().refine(b => Boolean(b.imagem) !== Boolean(b.arquivo), { message: 'Envie uma foto do computador ou cole um link de imagem' })

export const livroSchema = z.object({
  ...camposLivro,
  url:       z.string().max(MAX_URL_LIVRO).transform(s => s.trim()).refine(s => s === '' || ehLinkPerfil(s, MAX_URL_LIVRO), 'Link inválido (use http:// ou https://)').default(''),
  arquivos:  idsArquivos.default([]),
  autor:     camposLivro.autor.default(''),
  descricao: camposLivro.descricao.default(''),
  categoria: camposLivro.categoria.default(''),
  capa:      camposLivro.capa.default(''),
  cor:       camposLivro.cor.default('#8b5cf6'),
}).strict().refine(b => b.url !== '' || b.arquivos.length > 0, { message: 'Informe um link ou envie um arquivo' })
// Edição: só os campos enviados (sem valores padrão, para não apagar o que não veio)
export const livroUpdateSchema = z.object({
  titulo: camposLivro.titulo.optional(), autor: camposLivro.autor.optional(), descricao: camposLivro.descricao.optional(),
  categoria: camposLivro.categoria.optional(),
  url: z.string().max(MAX_URL_LIVRO).transform(s => s.trim()).refine(s => s === '' || ehLinkPerfil(s, MAX_URL_LIVRO), 'Link inválido (use http:// ou https://)').optional(),
  arquivos: idsArquivos.optional(),
  capa: camposLivro.capa.optional(),
  cor: camposLivro.cor.optional(),
}).strict().refine(b => Object.values(b).some(v => v !== undefined), { message: 'Nenhum campo fornecido' })

export const fardamentoUpdateSchema = z.object({
  patente:     safeStr(1, 50).optional(),
  titulo:      safeStrOpt(100).optional(),
  imagem:      z.string().min(1).max(3_500_000).refine(imagemValida, 'Imagem inválida').optional(),
  observacoes: safeStrOpt(500).optional(),
}).refine(b => Object.keys(b).filter(k => b[k as keyof typeof b] !== undefined).length > 0, {
  message: 'Nenhum campo fornecido',
})

/**
 * Nome de QRU: qualquer texto (acentos, símbolos, repetido). Só tira caracteres de
 * controle e espaços das pontas; o teto de MAX_QRU existe apenas para não aceitar
 * textos gigantes (o React escapa na tela e o Discord corta onde precisa).
 */
export const MAX_QRU = 200
const nomeQru = z.string().max(MAX_QRU * 2)
  .transform((s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_QRU))
  .refine(s => s.length > 0, 'Informe o nome do QRU')

export const qruSchema = z.object({
  nome: nomeQru,
  tipo: z.enum(['convencional', 'fechado']).default('convencional'),
}).strict()

/** Mudar o tipo / remover: o nome vai no corpo (não na URL), então aceita qualquer caractere. */
export const tipoQruSchema = z.object({
  nome: nomeQru,
  tipo: z.enum(['convencional', 'fechado']),
}).strict()

export const removerQruSchema = z.object({
  nome: nomeQru,
}).strict()

export const patenteSchema = z.object({
  nome: safeStr(1, 50),
})

export const cargoSchema = z.object({
  nome: safeStr(1, 50),
})

export const logoSchema = z.object({
  logo: z.string()
    .min(1)
    .max(2_900_000, 'Logo excede 2MB')
    .refine(
      s => /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(s) || s.startsWith('<svg'),
      'Formato de imagem inválido',
    ),
})

export const recCfgSchema = z.object({
  notaMinima: z.number().min(0).max(10).optional(),
  categorias: z.array(z.object({
    id:   z.number().int().positive(),
    nome: safeStr(1, 50),
    peso: z.number().min(0).max(100),
  })).optional(),
})

export const reorderSchema = z.object({
  orderedIds: z.array(z.number().int().positive()),
})

export const reorderPatenteSchema = z.object({
  patentes: z.array(z.string().max(50)),
})

export const reorderQruSchema = z.object({
  qrus: z.array(z.string().min(1).max(MAX_QRU)).max(2000),
}).strict()

const snowflake = z.string().regex(/^\d{17,20}$/, 'ID de canal inválido')

const discordMessageBlockSchema = z.discriminatedUnion('tipo', [
  z.object({
    id:     safeStr(1, 80),
    tipo:   z.literal('titulo'),
    titulo: safeStr(1, 256),
  }),
  z.object({
    id:    safeStr(1, 80),
    tipo:  z.literal('texto'),
    texto: safeStr(1, 4000),
  }),
  z.object({
    id:       safeStr(1, 80),
    tipo:     z.literal('imagem'),
    origem:   z.enum(['link', 'upload']),
    valor:    z.string().min(1).max(25_000_000),
    nome:     z.string().max(140).optional(),
    mimeType: z.string().max(80).optional(),
  }),
])

export const discordMensagemSchema = z.object({
  canalId: snowflake,
  blocos:  z.array(discordMessageBlockSchema).min(1).max(10),
}).refine(body => body.blocos.some(b => b.tipo !== 'imagem' || b.valor.trim()), {
  message: 'Monte ao menos um bloco válido para enviar',
  path: ['blocos'],
})

export const promoverSchema = z.object({
  cargoPermId: z.number().int().positive(),
  motivo:      safeStrOpt(500).default(''),
})

export const advertenciaSchema = z.object({
  nivel:  z.union([z.literal(1), z.literal(2), z.literal(3)]),
  motivo: safeStr(3, 500),
})

export const exonerarSchema = z.object({
  motivo: safeStr(3, 500),
})

export const reorderCargosSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
})

export const recusarSchema = z.object({
  motivo: safeStrOpt(300).optional(),
})

export const nivelInicialSchema = z.object({ nivel: nivelSchema })

// Personalização do perfil (dados públicos): links http/https e emojis de verdade
const emojiSchema = z.string().max(32).refine(ehEmoji, 'Emoji inválido')
export const personalizacaoSchema = z.object({
  links: z.array(z.object({
    rotulo: z.string().max(30).transform(s => s.replace(/[\u0000-\u001f\u007f]/g, '').trim())
      .refine(s => s.length > 0, 'Dê um nome ao link'),
    url: z.string().max(MAX_URL_LINK).transform(s => s.trim()).refine(s => ehLinkPerfil(s), 'Link inválido (use http:// ou https://)'),
    emoji: emojiSchema.optional(),
  }).strict()).max(MAX_LINKS_PERFIL, `No máximo ${MAX_LINKS_PERFIL} links`),
  emojis: z.array(emojiSchema).max(MAX_EMOJIS_PERFIL, `No máximo ${MAX_EMOJIS_PERFIL} emojis`),
}).strict()

// Foto do Gerar anúncio (até 3 MB decodificados; os bytes são conferidos na rota)
export const anuncioImagemSchema = z.object({
  imagem: z.string().max(4_300_000).refine(ehImagemEnviada, 'Envie uma imagem PNG, JPG, WEBP ou GIF'),
}).strict()

// Aceite dos termos: só a versão vigente é aceita (evita aceitar texto antigo)
export const termosAceiteSchema = z.object({ versao: z.string().regex(/^\d{4}-\d{2}-\d{2}(-\d{1,3})?$/) }).strict()

// ── Acesso por usuário e senha (igual ao Sistema Tática) ─────────────────────
const usuarioLogin = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/, 'Usuário só pode ter letras, números, ponto, hífen e sublinhado')
const senhaNova = z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(128)

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
}).strict()

export const solicitarAcessoSchema = z.object({
  username: usuarioLogin,
  password: senhaNova,
  nome:     safeStr(2, 60),
}).strict()

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1).max(128),
  novaSenha:  senhaNova,
}).strict()

export const aprovarAcessoSchema = z.object({
  cargoPermId: z.number().int().positive().nullable().optional(),
}).strict()

export const redefinirSenhaSchema = z.object({ novaSenha: senhaNova }).strict()
