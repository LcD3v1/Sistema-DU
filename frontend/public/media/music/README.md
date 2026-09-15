# Player de música (tela de login)

O player que aparece no canto inferior esquerdo da tela de login lê a lista de
faixas deste arquivo: **`playlist.json`**.

Enquanto o `playlist.json` estiver vazio (`[]`), o player **não aparece**.

## Como adicionar músicas

1. Copie o(s) arquivo(s) `.mp3` (ou `.ogg`/`.m4a`) para **esta pasta**
   (`frontend/public/media/music/`). Ex.: `hino-fast.mp3`.
2. (Opcional) Coloque também uma imagem de capa, ex.: `capa.jpg`.
3. Edite o `playlist.json` com as faixas. Exemplo:

```json
[
  {
    "title": "Hino da FAST",
    "artist": "North Police Department",
    "src": "/media/music/hino-fast.mp3",
    "cover": "/media/music/capa.jpg"
  },
  {
    "title": "Patrulha Noturna",
    "artist": "FAST",
    "src": "/media/music/patrulha.mp3"
  }
]
```

- `title` e `src` são **obrigatórios**; `artist` e `cover` são opcionais.
- O `src` sempre começa com `/media/music/...` (caminho público).
- Com **1 faixa**, ela toca em loop. Com **várias**, o player mostra
  botões de anterior/próxima e avança automaticamente ao terminar.

4. Salve. Recarregue a tela de login — o player aparece e toca ao clicar em ▶.

## Observações

- Os navegadores **bloqueiam autoplay com som**: a música só começa após o
  primeiro clique no botão de play (comportamento normal e esperado).
- Use MP3 de tamanho razoável (idealmente < 10 MB por faixa). Arquivos acima de
  100 MB são bloqueados pelo GitHub.
- Direitos autorais: use apenas músicas que você tem permissão para distribuir.
