/**
 * Texto do "?" de cada módulo (aparece na barra do topo, ao lado do nome da página).
 * Módulo novo: acrescente aqui a rota com título, passo a passo e dicas.
 */
export interface TextoAjuda { titulo: string; passos: string[]; dicas?: string[] }

const AJUDA: Record<string, TextoAjuda> = {
  '/dashboard': {
    titulo: 'Visão geral',
    passos: ['Aqui ficam o seu resumo na unidade: cargo, situação e os avisos do dia.', 'Use o menu ao lado para abrir cada módulo.'],
    dicas: ['O que aparece no menu depende das permissões do seu cargo.'],
  },
  '/avisos': {
    titulo: 'Avisos',
    passos: ['Leia os comunicados da unidade, do mais novo para o mais antigo.', 'Quem tem permissão de editar avisos publica um novo pelo botão da página.'],
  },
  '/perfil': {
    titulo: 'Meu perfil',
    passos: ['Confira seus dados na unidade (codinome, patente, setor).', 'Troque foto, banner e links do seu perfil.', 'Mudanças de patente/setor viram pedido e só valem depois de aprovadas.'],
  },
  '/relatorios': {
    titulo: 'Relatórios',
    passos: ['Pesquise e abra os relatórios das investigações.', 'Clique em um relatório para ver o texto completo e os anexos.', 'Para escrever um novo, use "Cadastrar relatório" no menu.'],
  },
  '/relatorios/novo': {
    titulo: 'Cadastrar relatório',
    passos: ['Preencha título, investigação e o texto do relatório.', 'Escolha os investigadores responsáveis.', 'Anexe imagens ou arquivos (link ou do computador) e salve.'],
  },
  '/boletins': {
    titulo: 'Boletins',
    passos: ['Registre um boletim com os investigadores responsáveis.', 'Anexe imagens e evidências.', 'Todo boletim guarda o histórico de quem alterou e quando.'],
  },
  '/inqueritos': {
    titulo: 'Arquivo de Inquéritos',
    passos: ['Abra um inquérito para ver documentos, imagens e evidências.', 'Anexe links ou arquivos direto do computador.', 'Use a busca para achar um inquérito pelo nome.'],
  },
  '/galeria': {
    titulo: 'Galeria da DU',
    passos: ['Veja as fotos de operações e atividades da unidade.', 'Quem tem permissão envia fotos novas pelo botão da página.'],
  },
  '/arvores': {
    titulo: 'Árvores de investigação',
    passos: ['Crie uma árvore para a sua investigação.', 'Adicione pessoas com foto e dados e ligue umas às outras.', 'Escolha quem da equipe pode ver a árvore.'],
    dicas: ['Cada árvore é privada de quem criou e das pessoas escolhidas; os admins veem todas.'],
  },
  '/membros': {
    titulo: 'Membros',
    passos: ['Procure um investigador pelo codinome.', 'Abra a ficha para ver patente, setor, status e advertências.', 'Com permissão de editar: promova, advirta, mude o setor ou aprove pedidos de perfil.'],
  },
  '/ausencias/nova': {
    titulo: 'Registrar ausência',
    passos: ['Escolha o período em que vai ficar fora.', 'Explique o motivo e envie.', 'A ausência só vale depois de aprovada.'],
  },
  '/ausencias': {
    titulo: 'Ausências',
    passos: ['Veja as ausências pedidas, aprovadas e encerradas.', 'Quem gerencia ausências aprova ou recusa os pedidos.'],
    dicas: ['Ausência aprovada = sem acesso ao painel durante o período. O acesso volta sozinho no fim, ou ao retirar a ausência.'],
  },
  '/fardamento': {
    titulo: 'Fardamento',
    passos: ['Escolha a patente para ver o modelo de farda.', 'Quem tem permissão cadastra ou troca as imagens dos modelos.'],
  },
  '/recrutamento': {
    titulo: 'Recrutamento',
    passos: ['Veja os candidatos e a situação de cada um.', 'Abra o candidato para avaliar e dar as notas.', 'A média das notas ajuda na decisão final.'],
  },
  '/cursos': {
    titulo: 'Cursos internos',
    passos: ['Abra manuais, apostilas e materiais de estudo da unidade.', 'Quem tem permissão adiciona materiais novos.'],
  },
  '/carteira': {
    titulo: 'Carteirinha da DU',
    passos: ['Escolha o investigador: dados e foto são preenchidos sozinhos.', 'Ajuste o que quiser na carteirinha.', 'Baixe a imagem ou poste no fórum do Discord.'],
  },
  '/anuncio': {
    titulo: 'Gerar anúncio',
    passos: ['Monte a mensagem do anúncio.', 'Confira como ela vai ficar no jogo.', 'Copie tudo de uma vez e cole no jogo.'],
  },
  '/protocolo': {
    titulo: 'Protocolo',
    passos: [
      'Leia o protocolo operacional virando as páginas do livro.',
      'Use "Abrir em tela cheia" para ler melhor.',
      'Com permissão de editar: clique em "Trocar livro", cole o link do flipbook do Heyzine e salve.',
      'Em "Painel no Discord", envie as imagens, escolha o canal e clique em "Salvar e publicar": o bot posta o painel com os capítulos e o botão "Abrir o protocolo".',
    ],
    dicas: ['Só links do Heyzine (https://heyzine.com/flip-book/…) aparecem dentro da página.', 'Trocar o livro atualiza o painel do Discord sozinho.'],
  },
  '/setagem': {
    titulo: 'Setagem',
    passos: [
      'Em "Imagens do painel", envie banners/fotos e escolha a posição de cada uma.',
      'Escolha o canal do painel, o título e a mensagem.',
      'Configure as patentes (prefixo e cargos do Discord) e quem aprova os pedidos.',
      'Clique em Salvar: o painel "Solicitar set" é publicado no Discord.',
    ],
    dicas: ['O cargo e o acesso ao site só são liberados depois da aprovação.', 'O bot precisa de Gerenciar apelidos e Gerenciar cargos, com o cargo dele acima das patentes.'],
  },
  '/servidor': {
    titulo: 'Servidor Discord',
    passos: ['Veja o resumo do servidor da unidade no Discord.', 'Com permissão de editar, consulte a lista de membros do servidor.'],
  },
  '/logs': {
    titulo: 'Logs',
    passos: ['Escolha a categoria de eventos.', 'Clique no nome de quem fez a ação para ver o que foi alterado.'],
    dicas: ['Mostra o que acontece no site e no servidor do Discord (só leitura).'],
  },
  '/hierarquia': {
    titulo: 'Hierarquia',
    passos: [
      'Escolha a hierarquia nas abas, ou crie outra em "Nova hierarquia".',
      'Em "Imagens", envie banners/fotos e escolha a posição de cada uma.',
      'Dê o nome, escolha o canal e adicione os cargos na ordem (de cima para baixo).',
      'Clique em "Salvar e publicar": o bot publica o painel e atualiza sozinho a cada minuto.',
    ],
    dicas: ['Cada pessoa aparece só no cargo mais alto que tiver.', 'Quem perde o cargo sai do painel na atualização seguinte.'],
  },
  '/configuracoes': {
    titulo: 'Configurações',
    passos: ['Ajuste os dados gerais da unidade.', 'Gerencie os cargos do site e as permissões de cada área (ver/editar).', 'Faça backup e aprove os pedidos de acesso.'],
    dicas: ['Só administradores mexem nas partes sensíveis.'],
  },
}

/** Ajuda da página atual (rotas com ID usam a ajuda da lista). */
export function ajudaDaRota(pathname: string): TextoAjuda | undefined {
  if (AJUDA[pathname]) return AJUDA[pathname]
  if (pathname.startsWith('/recrutamento/')) return { titulo: 'Avaliação de recruta', passos: ['Confira os dados do candidato.', 'Dê as notas de cada etapa (0 a 10).', 'A média aparece no topo e ajuda na decisão.'] }
  if (pathname.startsWith('/arvores/')) return { titulo: 'Árvore de investigação', passos: ['Adicione pessoas com foto e dados.', 'Arraste para organizar e ligue as pessoas entre si.', 'As mudanças ficam salvas para a equipe da árvore.'] }
  return undefined
}
