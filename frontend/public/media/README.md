# Mídia do painel

Os arquivos de mídia usados pelo painel ficam nesta pasta.

- `login-bg.mp4` — vídeo de fundo da tela de login. **Comprimido** para ~28 MB
  (1080p, H.264, sem áudio, pois é reproduzido mudo) para caber no limite de
  tamanho do GitHub. O original de 1080p sem compressão tinha ~180 MB.

> Se substituir o vídeo por uma versão maior, comprima antes ou use **Git LFS**
> (o GitHub bloqueia arquivos acima de 100 MB):
>
> ```bash
> git lfs install
> git lfs track "*.mp4"
> git add .gitattributes
> ```
>
> Para comprimir com ffmpeg:
> ```bash
> ffmpeg -i entrada.mp4 -vf "scale='min(1920,iw)':-2" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart -an login-bg.mp4
> ```
