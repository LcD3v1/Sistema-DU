/**
 * Duração (em segundos) de um vídeo MP4/MOV lida dos próprios bytes: caixas do topo → "moov" → "mvhd".
 * Não confia no navegador. Undefined se o arquivo não tiver a estrutura esperada.
 */
export function duracaoMp4(b: Buffer): number | undefined {
  const caixas = (ini: number, fim: number, cb: (tipo: string, corpo: number, final: number) => number | undefined | void): number | undefined => {
    let p = ini
    for (let i = 0; i < 10_000 && p + 8 <= fim; i++) {
      let tam = b.readUInt32BE(p)
      const tipo = b.toString('latin1', p + 4, p + 8)
      let cab = 8
      if (tam === 1) {                       // tamanho de 64 bits
        if (p + 16 > fim) return undefined
        const grande = b.readBigUInt64BE(p + 8)
        if (grande > BigInt(fim - p)) return undefined
        tam = Number(grande); cab = 16
      } else if (tam === 0) tam = fim - p     // vai até o fim
      if (tam < cab || p + tam > fim) return undefined
      const r = cb(tipo, p + cab, p + tam)
      if (r !== undefined) return r ?? undefined
      p += tam
    }
    return undefined
  }
  return caixas(0, b.length, (tipo, corpo, final) => {
    if (tipo !== 'moov') return undefined
    return caixas(corpo, final, (t, c) => {
      if (t !== 'mvhd' || c + 32 > b.length) return undefined
      const versao = b[c]
      const escala = versao === 1 ? b.readUInt32BE(c + 20) : b.readUInt32BE(c + 12)
      const duracao = versao === 1 ? Number(b.readBigUInt64BE(c + 24)) : b.readUInt32BE(c + 16)
      return escala > 0 ? duracao / escala : undefined
    })
  })
}
