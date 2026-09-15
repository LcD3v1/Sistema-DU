import fs from 'fs'
import path from 'path'
import bcrypt from 'bcrypt'
import { FastData } from './types'

const DATA_PATH = process.env.DATA_PATH
  ? path.resolve(process.env.DATA_PATH)
  : path.resolve(__dirname, '..', 'data.json')

const DEFAULT_DATA: FastData = {
  membros: [],
  acoes: [],
  qrus: ['QRU-1', 'QRU-2', 'QRU-3'],
  recrutas: [],
  recCfg: {
    notaMinima: 7,
    categorias: [
      { id: 1, nome: 'Comunicação', peso: 1 },
      { id: 2, nome: 'Tiro', peso: 1 },
      { id: 3, nome: 'Táticas', peso: 1 },
      { id: 4, nome: 'Disciplina', peso: 1 },
    ],
  },
  patentes: ['Recruta', 'Soldado', 'Cabo', 'Sargento', 'Tenente', 'Capitão', 'Major', 'Coronel'],
  cargos: ['Operador', 'Sniper', 'Médico de Campo', 'Líder de Esquadrão', 'Comandante'],
  contas: [],
  solicitacoes: [],
  ausencias: [],
  avisos: [],
  cargosPermissao: [],
  anuncioSituacoes: [
    { id: 1, label: 'Área Restrita', titulo: 'N.P.D INFORMA:', texto: 'A área do [LOCAL] se encontra restrita pelas próximas horas, por estar sob atividade criminosa. Mantenham-se afastados — risco iminente de bala perdida! ESTE AVISO SERÁ ÚNICO! Att. [ASSINATURA]' },
    { id: 2, label: 'Operação em andamento', titulo: 'N.P.D INFORMA:', texto: 'Uma operação policial está em andamento na região do [LOCAL]. Solicitamos que a população evite a área e coopere com as autoridades. Att. [ASSINATURA]' },
    { id: 3, label: 'Toque de recolher', titulo: 'N.P.D INFORMA:', texto: 'Fica decretado toque de recolher na região do [LOCAL] a partir deste momento. A circulação está restrita até novo aviso. Att. [ASSINATURA]' },
    { id: 4, label: 'Foragido / Procurado', titulo: 'N.P.D INFORMA:', texto: 'Indivíduo foragido e possivelmente armado foi avistado nas proximidades do [LOCAL]. Em caso de avistamento, acione a NPD imediatamente e não se aproxime. Att. [ASSINATURA]' },
    { id: 5, label: 'Ponto de bloqueio', titulo: 'N.P.D INFORMA:', texto: 'Ponto de bloqueio montado no [LOCAL]. Reduza a velocidade, mantenha a calma e tenha os documentos em mãos. Att. [ASSINATURA]' },
    { id: 6, label: 'Comunicado geral', titulo: 'N.P.D INFORMA:', texto: 'Comunicado oficial da NPD à população do [LOCAL]: reforçamos o compromisso com a segurança da região. Denúncias podem ser feitas às autoridades. Att. [ASSINATURA]' },
  ],
  nextMemId: 200,
  nextAcId: 1,
  nextRecId: 1,
  nextContaId: 1,
  nextAusId: 1,
  nextSitId: 7,
  nextAvisoId: 1,
  nextSolId: 1,
  nextCargoPermId: 1,
  logo: '',
  membrosOrder: [],
}

export function readData(): FastData {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8')
    return JSON.parse(JSON.stringify(DEFAULT_DATA))
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as FastData
    // Garante que campos novos existam em dados legados
    return { ...DEFAULT_DATA, ...parsed }
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA))
  }
}

export function writeData(data: FastData): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function ensureDefaultAdmin(): Promise<void> {
  const data = readData()
  if (data.contas.length === 0) {
    const hashed = await bcrypt.hash('admin123', 12)
    data.contas.push({
      id: 1,
      username: 'admin',
      password: hashed,
      nivel: 'admin',
      ativo: true,
    })
    data.nextContaId = 2
    writeData(data)
    console.log('[FAST] Conta admin padrão criada: admin / admin123')
  }
}
