import { Request, Response, NextFunction } from 'express'

// Recursivamente percorre o body e sanitiza strings
function sanitizeValue(val: unknown, depth = 0): unknown {
  if (depth > 10) return val // Previne prototype pollution via objetos muito aninhados
  if (typeof val === 'string') {
    return val
      .replace(/\0/g, '')           // Null bytes (path traversal)
      .replace(/\.\.\//g, '')       // Path traversal sequences
      .replace(/\.\.\\/g, '')
  }
  if (Array.isArray(val)) return val.map(v => sanitizeValue(v, depth + 1))
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      // Previne prototype pollution
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
      out[k] = sanitizeValue(v, depth + 1)
    }
    return out
  }
  return val
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }
  next()
}

// Valida parâmetros de rota para evitar path traversal
export function sanitizeParams(req: Request, res: Response, next: NextFunction): void {
  for (const [key, val] of Object.entries(req.params)) {
    if (typeof val === 'string') {
      const decoded = decodeURIComponent(val)
      if (decoded.includes('..') || decoded.includes('\0') || decoded.includes('/')) {
        res.status(400).json({ error: `Parâmetro inválido: ${key}` })
        return
      }
    }
  }
  next()
}
