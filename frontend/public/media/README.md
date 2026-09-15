# Mídia do painel

Alguns arquivos de mídia **não são versionados** no Git por excederem o limite de
tamanho do GitHub (100 MB por arquivo). Após clonar o repositório, adicione‑os
manualmente nesta pasta:

| Arquivo | Uso | Observação |
|---------|-----|------------|
| `login-bg.mp4` | Vídeo de fundo da tela de login | ~180 MB — recomenda‑se comprimir (H.264/H.265, ~1080p) ou usar Git LFS |

> Se o `login-bg.mp4` estiver ausente, a tela de login ainda funciona — apenas
> ficará com o fundo escuro/animado (fallback CSS) em vez do vídeo.

Para versionar vídeos grandes no futuro, use **Git LFS**:

```bash
git lfs install
git lfs track "*.mp4"
git add .gitattributes
```
