/**
 * Termos de Uso, Privacidade, Cookies, Propriedade Intelectual, Licença de Uso e
 * Responsabilidades — Nata Studios & Nextech.
 *
 * Fonte única do texto exibido em /termos e no aceite. Ao alterar QUALQUER texto:
 *   1. mude `versao` aqui e TERMOS_VERSAO em backend/src/termos.ts (mesma data);
 *   2. atualize `atualizacao`.
 * Toda conta verá o aceite de novo. A seção de dados deve refletir o que o
 * sistema realmente coleta — não prometa nem omita nada.
 */

export type DocId = 'uso' | 'privacidade' | 'cookies' | 'propriedade' | 'licenca' | 'responsabilidades'

export interface Item { t: string; d: string }
export interface Secao { titulo: string; texto?: string[]; itens?: Item[] }
export interface Documento {
  id: DocId
  titulo: string
  resumo: string
  secoes: Secao[]
}

export const EMPRESAS = 'Nata Studios e Nextech'

export const TERMOS = {
  versao: '2026-09-18-2',
  vigencia: '14 de setembro de 2026',
  atualizacao: '18 de setembro de 2026',
  leiAplicavel: 'Brasil e Flórida, EUA',
}

export const DOCUMENTOS: Documento[] = [
  {
    id: 'uso',
    titulo: 'Termos de Uso',
    resumo: 'As regras para acessar e usar o sistema da unidade FAST.',
    secoes: [
      {
        titulo: '1. Quem somos',
        texto: [
          `O sistema FAST é um sistema privado, de propriedade exclusiva da ${EMPRESAS} ("nós"), que o criaram, mantêm e operam. O uso é cedido à unidade FAST do North Police Department ("unidade") — a unidade usa o sistema, mas ele não pertence a ela nem a nenhum usuário.`,
          'Ao acessar o site, entrar com o Discord ou usar qualquer recurso do painel, você concorda com estes Termos de Uso e com a Política de Privacidade, a Política de Cookies, a Política de Propriedade Intelectual, a Licença de Uso e os Termos de Responsabilidade. Se não concordar, não use o sistema.',
        ],
      },
      {
        titulo: '2. O que o sistema oferece',
        itens: [
          { t: 'Efetivo e hierarquia.', d: 'Cadastro de membros, patentes, promoções, rebaixamentos, advertências e histórico de cargos.' },
          { t: 'Operações.', d: 'Registro e aprovação de ações e apreensões, histórico, estatísticas e rankings.' },
          { t: 'Rotina da unidade.', d: 'Ausências, avisos, notificações, recrutamento, fardamentos, boletins, anúncios, protocolos e carteirinhas.' },
          { t: 'Integração com o Discord.', d: 'Login pela conta do Discord e publicações automáticas nos canais configurados pelo comando.' },
          { t: 'Páginas públicas.', d: 'Ranking, diretório de membros e perfil público de cada membro ativo.' },
        ],
      },
      {
        titulo: '3. Quem pode usar',
        itens: [
          { t: 'Somente membros autorizados.', d: 'O acesso ao painel exige conta do Discord que faça parte do servidor da unidade e aprovação do comando.' },
          { t: 'Conta pessoal e intransferível.', d: 'Você é responsável por tudo o que for feito com o seu login. Não compartilhe sua sessão nem acesse a conta de outra pessoa.' },
          { t: 'Permissões por cargo.', d: 'Cada área só aparece para quem tem permissão. Tentar acessar o que não é seu é uma violação destes termos.' },
          { t: 'Exoneração.', d: 'Membro exonerado perde todo o acesso imediatamente. Os dados dele ficam arquivados, não são apagados (veja a Política de Privacidade).' },
        ],
      },
      {
        titulo: '4. Uso proibido',
        itens: [
          { t: 'Vazar informação interna.', d: 'Não divulgue prints, dados de membros, registros ou decisões internas fora da unidade sem autorização do comando.' },
          { t: 'Registrar informação falsa.', d: 'Ações, apreensões, ausências e dados de cadastro devem ser verdadeiros.' },
          { t: 'Atacar o sistema.', d: 'É proibido tentar invadir, burlar permissões, automatizar acessos em massa, sobrecarregar o servidor ou explorar falhas. Tentativas são registradas e bloqueadas automaticamente.' },
          { t: 'Conteúdo impróprio.', d: 'Não envie imagens ou textos ilegais, ofensivos, com dados pessoais de terceiros ou que violem direitos autorais.' },
        ],
      },
      {
        titulo: '5. Consequências',
        texto: [
          'O descumprimento destes termos pode levar, conforme a gravidade, à remoção de conteúdo, à suspensão ou ao bloqueio do acesso e à comunicação ao comando da unidade, sem prejuízo das medidas previstas no regimento interno.',
        ],
      },
      {
        titulo: '6. Disponibilidade e mudanças',
        texto: [
          'Trabalhamos para manter o sistema estável e seguro, mas ele pode ficar indisponível para manutenção, atualizações ou falhas de terceiros (hospedagem, Discord, banco de dados).',
          'Estes termos podem ser atualizados. Quando isso acontecer, a data de atualização muda e o sistema pede o seu aceite de novo antes de continuar.',
        ],
      },
    ],
  },
  {
    id: 'privacidade',
    titulo: 'Privacidade e Dados',
    resumo: 'Quais dados coletamos, para que usamos, quem vê e por quanto tempo guardamos.',
    secoes: [
      {
        titulo: '1. Dados da sua conta do Discord',
        texto: ['Ao entrar com o Discord, pedimos apenas a permissão "identify". Não recebemos o seu e‑mail, senha, mensagens privadas nem a lista dos seus servidores.'],
        itens: [
          { t: 'Identificação.', d: 'ID, nome de usuário e foto do perfil do Discord.' },
          { t: 'Dados no servidor da unidade.', d: 'Apelido, foto e cargos no servidor, lidos pelo bot da FAST para manter o painel sincronizado com a hierarquia.' },
        ],
      },
      {
        titulo: '2. Dados que você ou o comando informam',
        itens: [
          { t: 'Cadastro na unidade.', d: 'Nome do policial, badge, passaporte, patentes, nível, datas de entrada e promoção.' },
          { t: 'Histórico funcional.', d: 'Promoções, rebaixamentos, advertências (com motivo e autor), status e ausências (período e motivo).' },
          { t: 'Operações.', d: 'Ações e apreensões: data, tipo, resultado, local, participantes, responsável e imagens anexadas.' },
          { t: 'Recrutamento.', d: 'Notas e observações das avaliações de candidatos.' },
          { t: 'Imagens enviadas.', d: 'Foto de perfil, banner, fardamentos e prints de registros.' },
        ],
      },
      {
        titulo: '3. Dados técnicos e de segurança',
        itens: [
          { t: 'Registro de auditoria.', d: 'Data, tipo do evento (login, alterações, acessos negados), usuário e endereço IP. Nunca registramos senhas, tokens ou conteúdo completo das requisições.' },
          { t: 'Cookies e armazenamento local.', d: 'Só os essenciais para o login e para preferências simples, sem publicidade nem rastreamento. A lista completa está na Política de Cookies.' },
          { t: 'Aceite dos termos.', d: 'A versão dos termos que você aceitou e a data do aceite ficam registradas na sua conta.' },
        ],
      },
      {
        titulo: '4. Para que usamos',
        itens: [
          { t: 'Funcionar o sistema.', d: 'Autenticar, aplicar permissões por cargo e exibir o que é seu.' },
          { t: 'Gestão da unidade.', d: 'Hierarquia, rankings, estatísticas, notificações e publicações no Discord da unidade.' },
          { t: 'Segurança.', d: 'Detectar abuso, bloquear ataques e investigar incidentes.' },
        ],
        texto: ['Não vendemos, alugamos nem usamos seus dados para publicidade.'],
      },
      {
        titulo: '5. Quem vê os seus dados',
        itens: [
          { t: 'Membros com permissão.', d: 'Cada área do painel só é visível para os cargos autorizados pelo comando.' },
          { t: 'Público.', d: 'O ranking, o diretório e o perfil público mostram só dados de exibição: nome do policial, badge, patente, cargo, foto, data de entrada, status e contagem de apreensões. Perfis de membros exonerados ou inativos deixam de aparecer.' },
          { t: 'Discord.', d: 'Registros, carteirinhas e rankings são publicados nos canais que o comando configurar.' },
          { t: 'Prestadores.', d: 'Hospedagem e banco de dados em provedores contratados, que só processam os dados para manter o sistema no ar.' },
          { t: 'Serviços de rede.', d: 'A Cloudflare protege e entrega o site, e o Google Fonts fornece as fontes. Ambos recebem o endereço IP e dados técnicos da conexão de quem acessa, segundo as políticas deles.' },
        ],
      },
      {
        titulo: '6. Por quanto tempo guardamos',
        itens: [
          { t: 'Enquanto você for membro.', d: 'Os dados ficam ativos durante a sua participação na unidade.' },
          { t: 'Após exoneração ou saída.', d: 'O acesso é bloqueado e o cadastro é arquivado (não apagado), para preservar o histórico da unidade e permitir uma eventual readmissão.' },
          { t: 'Logs de segurança.', d: 'Mantidos em rodízio: os mais antigos são descartados conforme o espaço reservado é preenchido.' },
          { t: 'Sessão.', d: 'Expira automaticamente e é invalidada ao sair.' },
        ],
      },
      {
        titulo: '7. Seus direitos e segurança',
        texto: [
          'Você pode pedir acesso, correção ou informações sobre os seus dados ao comando da unidade ou às empresas responsáveis, pelo canal oficial no Discord. Correções de cadastro também podem ser solicitadas pelo próprio perfil.',
          'Protegemos os dados com conexão HTTPS, sessão com expiração e revogação, controle de acesso por cargo, limites contra abuso, firewall de aplicação e registro de auditoria. Seguimos a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014). Pela LGPD, você pode pedir confirmação, acesso, correção, anonimização, portabilidade e informação sobre com quem seus dados são compartilhados.',
        ],
      },
    ],
  },
  {
    id: 'cookies',
    titulo: 'Política de Cookies',
    resumo: 'Quais cookies e armazenamentos do navegador o sistema usa, e para quê.',
    secoes: [
      {
        titulo: '1. O que são',
        texto: [
          'Cookies são pequenos arquivos que o site grava no seu navegador. O armazenamento local (localStorage e sessionStorage) funciona de forma parecida, mas só é lido pelo próprio site.',
          'O sistema FAST usa apenas o essencial para funcionar. Não usamos cookies de publicidade, de rastreamento, de redes sociais nem de análise de comportamento.',
        ],
      },
      {
        titulo: '2. Cookies essenciais',
        itens: [
          { t: 'fast_sessao.', d: 'Mantém você logado depois de entrar com o Discord. Protegido (httpOnly, SameSite=Strict): não pode ser lido por scripts nem enviado por outros sites. Dura no máximo 8 horas e é apagado ao sair.' },
          { t: 'fast_oauth_state.', d: 'Protege o login com o Discord contra falsificação de pedido. Dura 10 minutos.' },
        ],
      },
      {
        titulo: '3. Armazenamento do navegador',
        itens: [
          { t: 'fast_termos_aceite.', d: 'Lembra que você viu e aceitou estes termos neste navegador (versão e data). Fica até você limpar os dados do site.' },
          { t: 'fast-music-vol.', d: 'Guarda o volume do player de música da tela de login.' },
          { t: 'fast:recarga-chunk.', d: 'Recarrega a página uma única vez quando o site é atualizado. Some ao fechar a aba.' },
        ],
        texto: ['Nenhum dado de login, token ou informação pessoal fica guardado no armazenamento do navegador.'],
      },
      {
        titulo: '4. Cookies de terceiros',
        itens: [
          { t: 'Cloudflare.', d: 'Pode gravar cookies técnicos de segurança para distinguir visitantes reais de robôs e proteger o site contra ataques.' },
        ],
      },
      {
        titulo: '5. Como controlar',
        texto: [
          'Você pode apagar ou bloquear cookies e dados do site nas configurações do seu navegador. Se bloquear os cookies essenciais, não será possível fazer login. Se limpar o armazenamento, o aceite dos termos e o volume da música serão pedidos de novo.',
          'Por usarmos apenas itens essenciais, eles funcionam sem um pedido de consentimento separado. Se algum dia passarmos a usar cookies não essenciais, esta política será atualizada e pediremos o seu consentimento antes.',
        ],
      },
    ],
  },
  {
    id: 'propriedade',
    titulo: 'Propriedade Intelectual',
    resumo: `Este sistema é privado e pertence exclusivamente à ${EMPRESAS}.`,
    secoes: [
      {
        titulo: '1. Sistema privado e exclusivo',
        texto: [
          `Todo o sistema FAST faz parte da ${EMPRESAS}. Ele é um produto privado, de propriedade exclusiva das duas empresas, e não está à venda, não é de código aberto e não é distribuído a terceiros.`,
          'A unidade e os seus membros recebem apenas uma permissão de uso, pessoal, limitada e revogável. Usar o sistema não transfere nenhuma parte dele a quem usa.',
          'O sistema é protegido pela Lei de Software (Lei nº 9.609/1998) e pela Lei de Direitos Autorais (Lei nº 9.610/1998), além das leis equivalentes dos EUA.',
        ],
      },
      {
        titulo: '2. O que é exclusivo das empresas',
        itens: [
          { t: 'Código e infraestrutura.', d: 'Código‑fonte, banco de dados, integrações com o Discord, servidores e toda a arquitetura do sistema.' },
          { t: 'Design e identidade.', d: 'Layout, telas, componentes visuais, animações, textos, módulos e fluxos de funcionamento.' },
          { t: 'Funcionalidades.', d: 'Ranking, painéis, carteirinhas, registros, estatísticas e qualquer recurso criado ou que venha a ser criado.' },
          { t: 'Evolução do sistema.', d: 'Melhorias, correções e novas versões também pertencem exclusivamente às empresas, inclusive quando sugeridas por usuários.' },
        ],
      },
      {
        titulo: '3. O que é proibido',
        itens: [
          { t: 'Copiar ou reproduzir.', d: 'Copiar o sistema, suas telas, seu design ou seu funcionamento, total ou parcialmente, para criar outro sistema.' },
          { t: 'Revender ou ceder.', d: 'Vender, alugar, emprestar ou oferecer o acesso a pessoas ou grupos de fora da unidade.' },
          { t: 'Engenharia reversa.', d: 'Extrair, descompilar ou tentar obter o código, a estrutura interna ou os dados do sistema.' },
          { t: 'Usar a marca.', d: `Apresentar o sistema como próprio ou usar o nome da ${EMPRESAS} sem autorização por escrito.` },
        ],
      },
      {
        titulo: '4. Controle das empresas',
        itens: [
          { t: 'Decisão sobre o sistema.', d: 'Somente as empresas decidem o que o sistema faz, como evolui, onde é hospedado e quem pode operá‑lo tecnicamente.' },
          { t: 'Acesso revogável.', d: 'As empresas podem suspender ou encerrar o acesso de qualquer usuário, ou da unidade, em caso de violação destes termos.' },
          { t: 'Dados sob custódia.', d: 'Os dados ficam sob a guarda das empresas e são usados apenas para operar o sistema da unidade, nunca repassados a terceiros.' },
          { t: 'Sem exceções implícitas.', d: 'Qualquer autorização diferente do que está aqui só vale se for dada por escrito pelas duas empresas.' },
        ],
      },
      {
        titulo: '5. Marcas e identidade',
        texto: [
          'Os nomes Nata Studios e Nextech, seus logotipos e a identidade visual do sistema são de uso exclusivo das empresas. O nome e o brasão da unidade FAST pertencem à unidade e são exibidos no sistema com autorização dela.',
        ],
      },
      {
        titulo: '6. Conteúdo enviado pelos usuários',
        texto: [
          'Textos, imagens e registros enviados continuam sendo de quem os enviou ou da unidade. Ao enviá‑los, você autoriza as empresas a armazená‑los, exibi‑los e publicá‑los no sistema e nos canais do Discord da unidade, apenas para o funcionamento do sistema.',
          'Você declara ter o direito de usar o que envia. Conteúdo que viole direitos de terceiros pode ser removido sem aviso.',
        ],
      },
      {
        titulo: '7. Sugestões',
        texto: [
          'Ideias, sugestões e pedidos de melhoria são bem‑vindos. Ao enviá‑los, você concorda que as empresas podem usá‑los livremente no sistema, sem obrigação de pagamento ou crédito, e que o resultado pertence exclusivamente às empresas.',
        ],
      },
      {
        titulo: '8. Denúncia de violação',
        texto: [
          'Se você souber de cópia, revenda ou uso indevido do sistema, ou achar que algum conteúdo viola um direito seu, avise as empresas pelo canal oficial no Discord. Toda denúncia é analisada.',
        ],
      },
    ],
  },
  {
    id: 'licenca',
    titulo: 'Licença de Uso',
    resumo: 'As condições em que um cliente pode usar o sistema, que continua sendo das empresas.',
    secoes: [
      {
        titulo: '1. Partes e objeto',
        texto: [
          `Esta licença é concedida pela ${EMPRESAS} ("licenciantes") à organização que contrata ou recebe o sistema ("cliente") — neste caso, a unidade FAST do North Police Department — e vale para cada membro autorizado pelo cliente ("usuário").`,
          'O objeto é o direito de usar o sistema pela internet, na versão hospedada e mantida pelas licenciantes. O cliente não recebe cópia do software, código‑fonte nem acesso à infraestrutura.',
        ],
      },
      {
        titulo: '2. Natureza da licença',
        itens: [
          { t: 'Não exclusiva.', d: 'As licenciantes podem licenciar o sistema, ou versões dele, a outros clientes.' },
          { t: 'Intransferível.', d: 'O cliente não pode vender, ceder, sublicenciar nem emprestar o acesso a outra organização.' },
          { t: 'Revogável.', d: 'Pode ser suspensa ou encerrada nos casos previstos no item 7.' },
          { t: 'Limitada.', d: 'Vale só para a gestão interna do próprio cliente, dentro das funções que o sistema oferece.' },
        ],
      },
      {
        titulo: '3. Usuários e acessos',
        itens: [
          { t: 'Quem pode usar.', d: 'Somente pessoas aprovadas pelo cliente, cada uma com o próprio login. Contas não podem ser compartilhadas.' },
          { t: 'Limites.', d: 'Quantidade de usuários, módulos e recursos seguem o combinado na proposta ou no contrato assinado.' },
          { t: 'Responsabilidade do cliente.', d: 'O cliente responde pelos usuários que autoriza e deve remover o acesso de quem sair da organização.' },
        ],
      },
      {
        titulo: '4. Prazo, valores e renovação',
        texto: [
          'Prazo, valores, forma de pagamento e renovação são os definidos na proposta, ordem de serviço ou contrato assinado com o cliente. Na ausência de prazo definido, a licença vale por tempo indeterminado e pode ser encerrada por qualquer das partes com aviso prévio de 30 dias.',
        ],
      },
      {
        titulo: '5. Suporte e atualizações',
        itens: [
          { t: 'Manutenção.', d: 'As licenciantes corrigem falhas, aplicam atualizações de segurança e mantêm o sistema no ar.' },
          { t: 'Atualizações.', d: 'Novas versões são aplicadas automaticamente. As licenciantes podem mudar, melhorar ou retirar funções, avisando o cliente quando a mudança for relevante.' },
          { t: 'Pedidos específicos.', d: 'Funções feitas sob medida para o cliente continuam sendo propriedade das licenciantes e podem ser cobradas à parte, conforme combinado.' },
        ],
      },
      {
        titulo: '6. Dados do cliente',
        itens: [
          { t: 'Uso dos dados.', d: 'Os dados do cliente são usados só para prestar o serviço a ele e nunca são compartilhados com outros clientes.' },
          { t: 'Ao fim da licença.', d: 'O cliente pode pedir, em até 30 dias, uma exportação dos seus dados em formato legível. Depois disso, os dados podem ser arquivados ou excluídos, salvo obrigação legal de guarda.' },
          { t: 'Isolamento.', d: 'Cada instalação usa banco de dados próprio, vinculado ao servidor do Discord do cliente.' },
        ],
      },
      {
        titulo: '7. Suspensão e encerramento',
        itens: [
          { t: 'Por violação.', d: 'Descumprir esta licença, os Termos de Uso ou a Política de Propriedade Intelectual permite suspensão imediata e encerramento.' },
          { t: 'Por falta de pagamento.', d: 'Quando houver valores combinados, o atraso permite suspender o acesso até a regularização.' },
          { t: 'Efeitos.', d: 'Encerrada a licença, o acesso termina para todos os usuários do cliente e a proibição de copiar o sistema continua valendo.' },
        ],
      },
      {
        titulo: '8. Garantias e responsabilidade',
        texto: [
          'O sistema é fornecido "no estado em que se encontra", sem garantia de funcionamento ininterrupto ou livre de erros. As licenciantes não respondem por lucros cessantes, perda de dados causada por uso indevido, decisões tomadas pelo cliente com base no sistema nem por falhas de serviços de terceiros.',
          'Quando houver valores pagos, a responsabilidade total das licenciantes fica limitada ao valor pago pelo cliente nos 12 meses anteriores ao fato.',
        ],
      },
      {
        titulo: '9. Disposições gerais',
        texto: [
          'Condições assinadas em contrato específico com o cliente prevalecem sobre esta licença no que forem diferentes. Se alguma cláusula for considerada inválida, as demais continuam valendo.',
        ],
      },
    ],
  },
  {
    id: 'responsabilidades',
    titulo: 'Responsabilidades',
    resumo: 'O que cabe às empresas, à unidade e a cada usuário.',
    secoes: [
      {
        titulo: `1. Da ${EMPRESAS}`,
        itens: [
          { t: 'Proprietárias do sistema.', d: 'Criar, manter, corrigir e evoluir o sistema, que é privado e exclusivo delas.' },
          { t: 'Proteger os dados.', d: 'Adotar medidas técnicas de segurança e agir rapidamente em caso de incidente, informando o comando da unidade.' },
          { t: 'Transparência.', d: 'Manter estes documentos atualizados e fiéis ao que o sistema realmente faz.' },
          { t: 'Confidencialidade.', d: 'Usar os dados da unidade apenas para operar e dar suporte ao sistema.' },
        ],
      },
      {
        titulo: '2. Da unidade e do comando',
        itens: [
          { t: 'Controlar o acesso.', d: 'Aprovar membros, definir cargos e permissões e exonerar quem deixar a unidade.' },
          { t: 'Configurar o Discord.', d: 'Definir quais canais recebem publicações e manter o bot no servidor.' },
          { t: 'Decisões internas.', d: 'Promoções, advertências, aprovações e exonerações são decisões do comando, não das empresas.' },
        ],
      },
      {
        titulo: '3. De cada usuário',
        itens: [
          { t: 'Proteger a própria conta.', d: 'Manter a conta do Discord segura e sair do sistema em computadores compartilhados.' },
          { t: 'Informar a verdade.', d: 'Responder pelo que registra, envia e publica pelo sistema.' },
          { t: 'Sigilo.', d: 'Não divulgar informações internas da unidade nem detalhes do funcionamento do sistema.' },
          { t: 'Respeitar a propriedade.', d: 'Não copiar, reproduzir nem repassar o sistema (veja a Política de Propriedade Intelectual e a Licença de Uso).' },
        ],
      },
      {
        titulo: '4. Limites de responsabilidade',
        texto: [
          'As empresas não respondem por conteúdo inserido por usuários, por decisões internas da unidade, pelo uso indevido de contas por terceiros quando a falha for do usuário, nem por indisponibilidades de serviços de terceiros como Discord, hospedagem e banco de dados.',
          'O sistema é uma ferramenta de apoio à gestão de uma unidade de roleplay. Nomes, patentes e registros de personagens não representam autoridades ou fatos reais.',
          'Estes documentos são regidos pelas leis da República Federativa do Brasil, em especial a LGPD (Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014), a Lei de Software (Lei nº 9.609/1998) e a Lei de Direitos Autorais (Lei nº 9.610/1998). Nas relações com as empresas fora do Brasil, aplicam‑se também as leis da Flórida, EUA.',
          'Para usuários e clientes no Brasil, prevalecem sempre os direitos garantidos pela legislação brasileira, e fica eleito o foro do domicílio do usuário ou do cliente para resolver qualquer questão.',
        ],
      },
    ],
  },
]
