import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Upload, Trash2 } from 'lucide-react'
import { useUpdateLogo } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import HudButton from '@/components/ui/HudButton'
import ModalOverlay from '@/components/ui/ModalOverlay'
import api from '@/lib/axios'
import { queryClient } from '@/lib/queryClient'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024

function resizeImage(file: File, maxSize = 300): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let w = img.width, h = img.height
      if (w > h && w > maxSize) { h = h * maxSize / w; w = maxSize }
      else if (h > w && h > maxSize) { w = w * maxSize / h; h = maxSize }
      else if (w > maxSize) { w = h = maxSize }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png', 0.85))
    }
    img.src = url
  })
}

function processImage(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
  }
  return resizeImage(file)
}

interface Props {
  currentLogo: string
}

export default function LogoUploader({ currentLogo }: Props) {
  const { addToast } = useUIStore()
  const updateLogo = useUpdateLogo()

  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
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

  function validateAndSelect(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      triggerError('Formato inválido. Use PNG, JPG, WEBP ou SVG.')
      return
    }
    if (file.size > MAX_BYTES) {
      triggerError('Imagem excede 2MB.')
      return
    }
    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndSelect(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) validateAndSelect(file)
  }

  async function handleSave() {
    if (!selectedFile) return
    setSaving(true)
    try {
      const base64 = await processImage(selectedFile)
      await updateLogo.mutateAsync(base64)
      addToast('success', 'Logo atualizada com sucesso!')
      setPreview(null)
      setSelectedFile(null)
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
        <p className="font-mono text-[10px] text-txt3">PNG, JPG, WEBP, SVG — máx 2MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleInputChange}
          className="hidden"
        />
      </motion.div>

      {/* Botões */}
      <div className="flex gap-3">
        {selectedFile && (
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
