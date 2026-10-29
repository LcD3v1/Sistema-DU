/**
 * Banco de dados (MongoDB — Discloud ou Atlas) para o documento de dados do painel.
 *
 * O sistema continua igual por dentro: tudo fica na memória (data.ts) e as rotas não mudam.
 * O que muda é ONDE o documento é guardado: com MONGODB_URI no .env, ele vai para o banco
 * (fonte da verdade), e o arquivo local continua sendo gravado como reserva.
 *
 * Segurança:
 *  - o documento vai COMPACTADO (gzip) e CIFRADO (AES-256-GCM, DATA_ENCRYPTION_KEY): quem acessar o
 *    banco por fora não lê nada; sem a chave, só em desenvolvimento (aviso no log);
 *  - em produção a conexão exige TLS e usuário/senha (validado em config/env.ts);
 *  - a URI nunca vai para o log (redact.ts troca por [REDACTED_DATABASE_URI]).
 */
import zlib from 'zlib'
import { MongoClient, type Collection } from 'mongodb'
import { criptografar, descriptografar, criptografiaDisponivel } from './security/crypto'

/** Onde o documento de dados é guardado (Mongo em produção; falso nos testes). */
export interface CofreDados {
  ler(): Promise<string | undefined>
  gravar(json: string): Promise<void>
  fechar(): Promise<void>
}

const ID_DOCUMENTO = 'principal'
const AAD = 'du-dados-principal'
/** O MongoDB aceita documentos de até 16 MB: avisa bem antes (compactado, o normal é bem menos). */
const AVISO_TAMANHO = 12 * 1024 * 1024

interface DocDados { _id: string; conteudo: string; formato: 'gzip+aes' | 'gzip'; bytes: number; gravadoEm: Date }

/** JSON → gzip → base64 → (cifrado, se houver chave). */
export function empacotar(json: string): Pick<DocDados, 'conteudo' | 'formato' | 'bytes'> {
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8')).toString('base64')
  return criptografiaDisponivel()
    ? { conteudo: criptografar(gz, AAD), formato: 'gzip+aes', bytes: json.length }
    : { conteudo: gz, formato: 'gzip', bytes: json.length }
}

/** Caminho inverso. Chave errada/adulterado = erro (nunca devolve dado errado em silêncio). */
export function desempacotar(doc: Pick<DocDados, 'conteudo' | 'formato'>): string {
  const gz = doc.formato === 'gzip+aes' ? descriptografar(doc.conteudo, AAD) : doc.conteudo
  return zlib.gunzipSync(Buffer.from(gz, 'base64')).toString('utf8')
}

/** Cofre sobre uma coleção (a real do driver ou uma falsa nos testes). */
export function cofreDaColecao(colecao: Pick<Collection<DocDados>, 'findOne' | 'replaceOne'>, fechar: () => Promise<void> = async () => {}): CofreDados {
  return {
    async ler() {
      const doc = await colecao.findOne({ _id: ID_DOCUMENTO })
      return doc ? desempacotar(doc) : undefined
    },
    async gravar(json: string) {
      const pacote = empacotar(json)
      if (pacote.conteudo.length > AVISO_TAMANHO) console.warn('[DU][BANCO] Documento de dados passou de 12 MB (limite do MongoDB: 16 MB). Tire imagens enviadas de dentro dos dados.')
      await colecao.replaceOne({ _id: ID_DOCUMENTO }, { ...pacote, gravadoEm: new Date() }, { upsert: true })
    },
    fechar,
  }
}

/** Conecta ao MongoDB da MONGODB_URI. undefined = sem banco configurado (só arquivo, como antes). */
export async function conectarBanco(): Promise<CofreDados | undefined> {
  const uri = process.env.MONGODB_URI?.trim()
  if (!uri) return undefined
  const cliente = new MongoClient(uri, {
    appName: 'sistema-du',
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 5,          // um único processo: poucas conexões bastam
    retryWrites: true,
  })
  // Algumas tentativas no início (banco acordando / rede): sem banco, o servidor não sobe
  // (subir com dados velhos e depois sobrescrever o banco seria pior)
  for (let tentativa = 1; ; tentativa++) {
    try {
      await cliente.connect()
      await cliente.db(process.env.MONGODB_DB?.trim() || 'sistema_du').command({ ping: 1 })
      break
    } catch (err) {
      if (tentativa >= 5) throw new Error(`Não foi possível conectar ao MongoDB: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      console.warn(`[DU][BANCO] Conexão com o MongoDB falhou (tentativa ${tentativa}/5). Tentando de novo…`)
      await new Promise(r => setTimeout(r, 3_000 * tentativa))
    }
  }
  if (!criptografiaDisponivel()) console.warn('[DU][BANCO] Sem DATA_ENCRYPTION_KEY: os dados vão para o banco só compactados, SEM cifra. Defina a chave.')
  const colecao = cliente.db(process.env.MONGODB_DB?.trim() || 'sistema_du').collection<DocDados>('dados')
  console.log('[DU][BANCO] Conectado ao MongoDB.')
  return cofreDaColecao(colecao, () => cliente.close())
}
