import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Upload, Trash2 } from 'lucide-react'
import { useUpdateLogo } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import HudButton from '@/components/ui/HudButton'
import ModalOverlay from '@/components/ui/ModalOverlay'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

import { ACEITA_FOTO, fotoDoArquivo, mensagemErroFoto } from '@/lib/imagemArquivo'

interface Props {
  currentLogo: string
}

export default function LogoUploader({ currentLogo }: Props) {
  const { addToast } = useUIStore()
  const updateLogo = useUpdateLogo()

  const [preview, setPreview] = useState<string | null>(null)
  const [convertida, setConvertida] = useState<string | null>(null)
  const [convertendo, setConvertendo] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [errorKey, setErrorKey] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removeModal, setRemoveModal] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const triggerError = useCallback((msg: string) => {
    addToast('error', msg)
    setHasError(true)
    setErrorKey(k => k + 1)
    setTimeout(() => setHasError(false), 600)
  }, [addToast])

  /** Qualquer imagem (ou a 1ª página de um PDF) vira PNG seguro antes de salvar. */
  async function validateAndSelect(file: File) {
    setConvertendo(true)
    try {
      const png = await fotoDoArquivo(file, { maxLado: 512 })
      setConvertida(png)
      setPreview(png)
    } catch (e) {
      triggerError(mensagemErroFoto(e))
    } finally {
      setConvertendo(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void validateAndSelect(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void validateAndSelect(file)
  }

  async function handleSave() {
    if (!convertida) return
    setSaving(true)
    try {
      await updateLogo.mutateAsync(convertida)
      addToast('success', 'Logo atualizada com sucesso!')
      setPreview(null)
      setConvertida(null)
    } catch {
      addToast('error', 'Erro ao salvar logo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    try {
      await api.delete('/config/logo')
      queryClient.invalidateQueries({ queryKey: ['config', 'logo'] })
      addToast('success', 'Logo removida.')
      setRemoveModal(false)
    } catch {
      addToast('error', 'Erro ao remover logo.')
    }
  }

  const displayLogo = preview || currentLogo

  return (
    <div className="space-y-5">
      <h3 className="font-orbitron text-xs text-gold tracking-wider">LOGO DA UNIDADE</h3>

      {/* Preview 120px */}
      <div className="flex items-center gap-6">
        <div className="logo-ring" style={{ width: 120, height: 120 }}>
          {displayLogo ? (
            <img src={displayLogo} alt="Logo" className="logo-circle" />
          ) : (
            <span className="logo-fallback">DU<br />DPD</span>
          )}
        </div>
        {preview && (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-gold tracking-wider">PREVIEW</p>
            <p className="font-mono text-[10px] text-txt3">Confirme clicando em "Salvar Logo"</p>
          </div>
        )}
      </div>

      {/* Área de drop */}
      <motion.div
        key={errorKey}
        className={`logo-drop-area${dragActive ? ' drag-active' : ''}${hasError ? ' error' : ''}`}
        animate={hasError ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload
          size={28}
          className={`mx-auto mb-3 transition-colors ${dragActive ? 'text-gold' : 'text-txt3'}`}
        />
        <p className="font-mono text-sm text-txt2 mb-1">
          Arraste sua logo aqui ou clique para selecionar
        </p>
        <p className="font-mono text-[10px] text-txt3">{convertendo ? 'Convertendo…' : 'Qualquer imagem ou PDF (1ª página) — máx 500 MB'}</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACEITA_FOTO}
          onChange={handleInputChange}
          className="hidden"
        />
      </motion.div>

      {/* Botões */}
      <div className="flex gap-3">
        {convertida && (
          <HudButton loading={saving} onClick={handleSave} className="flex-1">
            {saving ? 'ENVIANDO...' : '✓ SALVAR LOGO'}
          </HudButton>
        )}
        {currentLogo && !preview && (
          <HudButton variant="danger" onClick={() => setRemoveModal(true)}>
            <Trash2 size={14} className="inline mr-1.5" />
            REMOVER LOGO
          </HudButton>
        )}
      </div>

      {/* Modal confirmação remoção */}
      <ModalOverlay open={removeModal} onClose={() => setRemoveModal(false)} title="CONFIRMAR REMOÇÃO">
        <div className="space-y-4">
          <p className="font-mono text-sm text-txt2">
            Tem certeza que deseja remover a logo da unidade? O fallback textual será exibido no lugar.
          </p>
          <div className="flex gap-3 pt-1">
            <HudButton variant="danger" onClick={handleRemove} className="flex-1">
              REMOVER
            </HudButton>
            <HudButton variant="ghost" onClick={() => setRemoveModal(false)} className="flex-1">
              CANCELAR
            </HudButton>
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
