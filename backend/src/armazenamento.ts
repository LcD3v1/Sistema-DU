import fs from 'fs'
import path from 'path'

/**
 * Armazenamento em arquivos (mesmo modelo do Sistema Tática, sem banco externo).
 *
 * Tudo fica na pasta do DATA_PATH:
 *  - DATA_PATH (padrão backend/data.json) → dados do painel;
 *  - <pasta>/arquivos/ e <pasta>/anuncio-imagens/ → arquivos enviados (bytes + metadados);
 *  - <pasta>/sessoes-revogadas.json → logout antes do vencimento do token.
 *
 * Em produção o DATA_PATH precisa apontar para um disco persistente da hospedagem,
 * senão os dados somem a cada novo deploy.
 */

export const DATA_PATH = process.env.DATA_PATH
  ? path.resolve(process.env.DATA_PATH)
  : path.resolve(__dirname, '..', 'data.json')

export const PASTA_DADOS = path.dirname(DATA_PATH)

/**
 * Escrita atômica: grava num temporário e faz rename (atômico no mesmo disco).
 * Uma queda no meio da escrita nunca deixa o arquivo truncado — fica a versão
 * antiga OU a nova. mode 0o600: só o dono do processo lê/escreve.
 */
export function gravarAtomico(destino: string, conteudo: string | Buffer): void {
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  const tmp = path.join(path.dirname(destino), `.${path.basename(destino)}.${process.pid}.${Date.now()}.tmp`)
  try {
    fs.writeFileSync(tmp, conteudo, { mode: 0o600 })
    fs.renameSync(tmp, destino)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* noop */ }
    throw err
  }
}

/** Lê um JSON; devolve undefined se não existir. JSON corrompido lança erro (nunca sobrescreve em silêncio). */
export function lerJson<T>(caminho: string): T | undefined {
  if (!fs.existsSync(caminho)) return undefined
  return JSON.parse(fs.readFileSync(caminho, 'utf-8')) as T
}

// IDs aleatórios gerados pelo próprio servidor (base64url de 18 bytes). Conferidos
// aqui também, para que nenhum caminho de arquivo seja montado com texto livre.
const ID_SEGURO = /^[A-Za-z0-9_-]{24}$/

/** Pasta de arquivos enviados: <id>.bin (bytes) + <id>.json (metadados). */
export function pastaDeArquivos<M extends object>(nome: 'arquivos' | 'anuncio-imagens') {
  const dir = path.join(PASTA_DADOS, nome)
  const caminho = (id: string, ext: 'bin' | 'json') => {
    if (!ID_SEGURO.test(id)) throw new Error('ID de arquivo inválido')
    return path.join(dir, `${id}.${ext}`)
  }
  return {
    salvar(id: string, bytes: Buffer, meta: M): void {
      gravarAtomico(caminho(id, 'bin'), bytes)
      gravarAtomico(caminho(id, 'json'), JSON.stringify(meta))
    },
    meta(id: string): M | undefined {
      if (!ID_SEGURO.test(id)) return undefined
      try { return lerJson<M>(caminho(id, 'json')) } catch { return undefined }
    },
    bytes(id: string): Buffer {
      return fs.readFileSync(caminho(id, 'bin'))
    },
    atualizar(id: string, meta: M): void {
      gravarAtomico(caminho(id, 'json'), JSON.stringify(meta))
    },
    apagar(id: string): void {
      fs.rmSync(caminho(id, 'bin'), { force: true })
      fs.rmSync(caminho(id, 'json'), { force: true })
    },
    /** Todos os metadados (para limpeza periódica e busca por hash). */
    listar(): { id: string; meta: M }[] {
      if (!fs.existsSync(dir)) return []
      const out: { id: string; meta: M }[] = []
      for (const f of fs.readdirSync(dir)) {
        const id = f.slice(0, -5)
        if (!f.endsWith('.json') || !ID_SEGURO.test(id)) continue
        const meta = this.meta(id)
        if (meta) out.push({ id, meta })
      }
      return out
    },
  }
}
