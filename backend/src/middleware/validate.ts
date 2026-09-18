import { z, ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'
import type { CanaisDiscord } from '../types'
import { imagemValida, ehImagemEnviada, ehLinkImagem, MAX_URL_IMAGEM } from '../security/imagem'

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
  qru:          safeStr(1, 50),
  resultado:    z.enum(['Vitória', 'Derrota', 'Empate']),
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
})

export const membroSelfSchema = z.object({
  nivel:          nivelSchema.optional(),
  policial:       safeStr(1, 100).optional(),
  badge:          safeStrOpt(20).optional(),
  passaporte:     safeStrOpt(20).optional(),
  patenteNPD:     safeStrOpt(50).optional(),
  patenteInterna: safeStrOpt(50).optional(),
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

export const fardamentoUpdateSchema = z.object({
  patente:     safeStr(1, 50).optional(),
  titulo:      safeStrOpt(100).optional(),
  imagem:      z.string().min(1).max(3_500_000).refine(imagemValida, 'Imagem inválida').optional(),
  observacoes: safeStrOpt(500).optional(),
}).refine(b => Object.keys(b).filter(k => b[k as keyof typeof b] !== undefined).length > 0, {
  message: 'Nenhum campo fornecido',
})

export const qruSchema = z.object({
  nome: z.string().min(1).max(50).regex(/^[\w\s\-]+$/, 'Nome do QRU contém caracteres inválidos').transform((s: string) => s.trim()),
})

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
  qrus: z.array(z.string().min(1).max(50)),
})

const snowflake = z.string().regex(/^\d{17,20}$/, 'ID de canal inválido')

export const canaisSchema = z.object({
  registro:   snowflake.nullable().optional(),
  apreensoes: snowflake.nullable().optional(),
  carteira:   snowflake.nullable().optional(),
  rankingApreensoes: snowflake.nullable().optional(),
} satisfies Record<keyof CanaisDiscord, ZodSchema>)

/** Postagem da carteirinha: tópico de destino + PNG gerado no navegador. */
export const carteiraPostSchema = z.object({
  topicoId: snowflake,
  // O corpo desta rota é limitado a 5mb em index.ts; o teto aqui acompanha.
  imagem:   z.string().max(5_000_000).refine(ehImagemEnviada, 'Envie a imagem gerada da carteira'),
  mensagem: safeStrOpt(300).optional(),
  // @ do Discord de quem marcar (nunca o discordId — o backend resolve)
  mencionarUsuario: z.string().max(32).regex(/^[a-z0-9._]+$/i, 'Usuário inválido').nullable().optional(),
})

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

// Aceite dos termos: só a versão vigente é aceita (evita aceitar texto antigo)
export const termosAceiteSchema = z.object({ versao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()
