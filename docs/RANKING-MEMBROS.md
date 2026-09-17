# Entrega — Ranking e Membros

Implementação integrada ao React/Vite e Express/TypeScript existentes. O vídeo de 20 segundos e as três imagens foram analisados. Foram mantidos o tema preto/azul, o banner, os componentes de identidade e a gestão atual de membros; o módulo acrescenta a experiência de ranking, diretório e perfil.

## Onde acessar

- `/ranking`: estatísticas, filtros, Top 3, ranking paginado e diretório de membros.
- `/membros`: botão **Abrir diretório e perfis**, mantendo a gestão, aprovações e exonerados existentes.
- Login: botões existentes **Ranking** e **Membros**, com consulta pública resumida e opção **Ver juntos**.
- Perfil pessoal: posição e desempenho passam a vir da mesma API do ranking.

## Regras implementadas

- Um ponto por participação em registro aprovado; participantes duplicados na mesma ação contam uma única vez.
- Desempate: pontos, vitórias, Win Rate sem arredondamento, registros, data do último resultado e ID do membro. As posições são únicas e calculadas pelo backend.
- Win Rate: vitórias / (vitórias + derrotas). Empates não entram no denominador; ausência de resultados retorna zero.
- Períodos inclusivos por dia no fuso `America/Sao_Paulo`: geral, 7, 15 e 30 dias. Ações pendentes, futuras, com data inválida ou resultado desconhecido são desconsideradas.
- Nível: `1 + floor(registros aprovados de toda a carreira / 10)`. O nível não reinicia com o filtro.
- Conquistas do período: primeiro registro, 10 vitórias e 25 registros. Cada conquista inclui a data do evento em que o requisito foi alcançado. São derivadas das atividades existentes; não há cadastro duplicado de conquistas.
- Hierarquia: ordem de `cargosPermissao`, já editável nas configurações. Membros sem cargo vinculado usam a patente interna equivalente; cargos não equivalentes seguem a ordem de patentes configurada, sem inferir importância pelo alfabeto.
- Inativos, exonerados e contas desativadas ficam fora do diretório/ranking ativos. Membros em ausência continuam no diretório com seu status.
- Exoneração preserva um snapshot em `Conta.membroArquivado`. A readmissão continua exigindo o fluxo existente de cadastro/aprovação e recupera o mesmo ID, preservando as participações.
- O histórico de perfis removidos antes desta implementação não pode ser reconstruído automaticamente quando seus dados já não existem.

## API

Todos os endpoints privados exigem JWT válido, conta ativa e escopo da instalação. O diretório e os perfis de terceiros também exigem a permissão de leitura de membros.

| Método e endpoint | Finalidade |
| --- | --- |
| `GET /api/ranking` | Ranking paginado, estatísticas e cargos |
| `GET /api/ranking/stats` | Estatísticas e posição do usuário |
| `GET /api/ranking/me` | Desempenho do próprio membro |
| `GET /api/ranking/members` | Diretório paginado por hierarquia |
| `GET /api/ranking/members/:id` | Perfil e até 20 atividades recentes |
| `GET /api/ranking/roles` | Cargos reais em ordem configurada |
| `GET /api/public/directory` | Ranking público resumido |
| `GET /api/public/directory/stats` | Estatísticas públicas |
| `GET /api/public/directory/members` | Diretório público paginado |
| `GET /api/public/directory/members/:id` | Perfil público sem dados privados |
| `GET /api/public/directory/roles` | Hierarquia pública |

Filtros: `period=all|7d|15d|30d`, `search`, `role`, `page`, `limit`. Limite padrão de 24 e máximo de 100; pesquisa limitada a 100 caracteres. Posição é sempre global ao período, mesmo ao pesquisar ou filtrar por cargo.

Os endpoints legados `/api/public/ranking`, `/api/public/membros` e `/api/public/perfis` continuam disponíveis para os consumidores existentes. Ranking e membros legados usam a mesma fonte de cálculo; novos consumidores usam a API paginada.

A prévia pública existente foi preservada. Ela não retorna Discord IDs, ID interno privado, cargos Discord ou atividade detalhada; busca pública também não consulta esses campos privados. Os cards privados de ranking não retornam o histórico de atividades: ele está no perfil autorizado.

## Isolamento e migration

A arquitetura encontrada não é um banco compartilhado de vários tenants: é **uma instalação, um banco/cache MongoDB, um servidor Discord e uma aplicação/bot**. Essa organização foi preservada. Para múltiplos servidores/bots, são necessárias instalações com bancos separados; não foi introduzido um seletor de tenants sobre coleções legadas sem escopo.

Migration incremental `ranking-scope-v1`: documento na coleção `config`, usando o índice `_id` existente, que vincula o banco ao `DISCORD_GUILD_ID` e `DISCORD_CLIENT_ID` configurados no servidor. Uma tentativa de reutilizar esse banco com outro servidor/bot aborta a inicialização. Campos de escopo explícitos em registros também são filtrados. Parâmetros de tenant enviados pelo navegador são rejeitados pela API nova.

JWTs novos incluem o escopo; tokens sem escopo ou de outro servidor não passam pela autenticação quando o servidor está configurado. **Após atualizar o backend, sessões antigas precisam fazer login novamente.**

Não foram adicionados índices sobre atividades: as consultas do módulo usam o cache já existente, não fazem buscas Mongo por período/membro. Adicionar esses índices agora não aceleraria as consultas utilizadas.

Aplicação manual, a partir de `backend`:

```powershell
npm.cmd run build
node scripts/ranking-scope-migration.cjs up
```

Rollback, com aplicação parada e antes de retornar ao código anterior:

```powershell
node scripts/ranking-scope-migration.cjs down --confirm-scope=GUILD_ID:CLIENT_ID
```

O rollback remove somente o documento de vínculo correspondente ao escopo informado. Não apaga membros, contas ou atividades. Ao iniciar novamente com esta versão, o vínculo é reaplicado.

## Sincronização, segurança e desempenho

- Reutilização do gateway Discord existente para nome, avatar e IDs dos cargos; sincronização inicial em lote e atualizações por evento.
- Consulta REST de identidade com timeout de 10 segundos. Nenhuma chamada Discord por membro ao abrir o diretório.
- Cargos Discord são informativos; não atribuem automaticamente permissões administrativas do painel.
- Reutilização de MongoDB, contas, membros, ações e fluxo de aprovação existentes.
- Cache agregado por período/revisão/dia/escopo no backend. Escritas invalidam o cache; falha detectada de persistência suspende consultas com resposta segura.
- A persistência mantém o padrão existente do projeto: cache síncrono e fila assíncrona de gravação no MongoDB.
- Sem nova infraestrutura WebSocket/SSE: refetch a cada 60 segundos, pausado em segundo plano, atualização ao recuperar foco e invalidação após mutações locais.
- Pesquisa com debounce de 350 ms, cancelamento de requests e timeout de 12 segundos.
- Validação Zod estrita, rate limit de 120 consultas/minuto por IP além dos limites globais, proteção contra IDOR, respostas sem stack traces e renderização de texto pelo React.
- Avatares Discord com validação de URL e fallback para iniciais, inclusive quando a imagem falha.
- Auditoria: `RANKING_VIEW`, `MEMBER_VIEW`, `MEMBER_UPDATED`, `ROLE_CHANGED`, `RANKING_RECALCULATED`.
- Skeletons, estados vazios, erros recuperáveis, drawer com Escape/foco, efeitos discretos e respeito a `prefers-reduced-motion`.

## Arquivos criados

| Arquivo | Responsabilidade |
| --- | --- |
| `backend/src/modules/ranking/scope.ts` | Escopo e vínculo do banco |
| `backend/src/modules/ranking/service.ts` | Cálculo, filtros, paginação e projeção pública |
| `backend/src/modules/ranking/router.ts` | Endpoints, autorização, cache e limites |
| `backend/src/modules/ranking/auditChanges.ts` | Auditoria de mudanças de membros/cargos |
| `backend/scripts/ranking-scope-migration.cjs` | Migration up/down |
| `backend/tests/ranking-fixtures.cjs` | Dados sintéticos dos testes |
| `backend/tests/ranking.test.cjs` | Testes unitários e HTTP |
| `backend/tests/ranking-browser.cjs` | Testes de navegador |
| `frontend/src/modules/ranking/RankingModule.tsx` | Página modular, ranking, Top 3, estatísticas e membros |
| `frontend/src/modules/ranking/MemberProfile.tsx` | Perfil lateral acessível |
| `frontend/src/modules/ranking/shared.tsx` | Avatar, contador, skeleton, estado vazio e paginação |
| `frontend/src/modules/ranking/queries.ts` | API, cache, atualização e mensagens de erro |
| `frontend/src/modules/ranking/types.ts` | Contratos da API |
| `frontend/src/modules/ranking/format.ts` | Formatação de datas |
| `frontend/src/modules/ranking/ranking.css` | Efeitos e responsividade restritos ao módulo |
| `docs/RANKING-MEMBROS.md` | Este relatório |

Componentes criados: `RankingModule`, `RankingCard`, `Statistics`, `Position`, `MemberProfile`, `Avatar`, `Counter`, `Skeleton`, `EmptyState`, `Pagination`.

## Arquivos modificados

- `backend/package.json`, `backend/package-lock.json`: scripts de teste e Playwright como dependência de desenvolvimento.
- `backend/src/data.ts`: vínculo do banco, revisão de cache, estado de persistência e auditoria.
- `backend/src/types/index.ts`: escopo, cargos Discord e snapshot arquivado opcionais.
- `backend/src/middleware/auth.ts`, `backend/src/routes/auth.ts`: sessões com escopo e recuperação do membro no onboarding.
- `backend/src/efetivo.ts`: preservação do perfil na exoneração.
- `backend/src/discord/identidade.ts`, `backend/src/discord/gateway.ts`: cache/sincronização de identidade e cargos.
- `backend/src/security/audit.ts`: novos tipos de eventos.
- `backend/src/index.ts`, `backend/src/routes/public.ts`: registro das APIs e compatibilidade dos endpoints públicos.
- `frontend/src/components/sections/RankingPage.tsx`: integração do módulo, preservando banner e tema.
- `frontend/src/components/sections/PublicOverlay.tsx`: filtros, ranking e diretório no modal público existente.
- `frontend/src/components/sections/MembrosPage.tsx`: acesso ao diretório sem remover a gestão existente.
- `frontend/src/components/sections/ProfilePage.tsx`: desempenho calculado pelo backend.

Alterações anteriores em `backend/src/middleware/validate.ts` e na cor do sino em `NotificationBell.tsx` foram preservadas e não fazem parte desta implementação.

## Validação e problemas corrigidos

- 31 testes unitários/HTTP aprovados: cálculo do Win Rate, empates, desempates por resultado/data/ID, limites de período/fuso, ausência de atividade, inativos/removidos, isolamento entre guilds/bots, autorização, IDOR, paginação, pesquisa, cargos, Top 3, conquistas, avatares, migration, cache, auditoria e readmissão.
- Testes de navegador com backend real do módulo e dados sintéticos: prévia pública, perfil privado, restauração de foco, Escape, períodos, debounce, pesquisa, cargo, paginação, atualização de posição, falha de API/retry e ausência de erros JavaScript.
- Viewports: 1440, 1024, 768, 390 e 320 px, sem overflow horizontal; modo de movimento reduzido verificado.
- Corrigidas divergências entre ranking público, ranking do painel e perfil pessoal; empates no denominador; total de registros que ignorava o período; agrupamentos duplicados de cargos equivalentes; perda de vínculo após exoneração; sessões sem identificação do servidor.
- Builds de backend/frontend e lint dos componentes novos executados. O Vite mantém o aviso de bundle maior que 500 kB já existente no projeto.
- MongoDB real acessível. Migration aplicada; comparação antes/depois confirmou que os documentos das coleções de membros (5), contas (6) e ações (1) ficaram inalterados.
- Cálculo com dados reais validado nos quatro períodos, com valores finitos e posições únicas.
- Discord REST verificado: bot autentica, corresponde ao Client ID e acessa o servidor configurado. Nenhuma mensagem de teste foi enviada.
- Não houve deploy nem reinicialização do processo de produção. O fluxo OAuth interativo e eventos reais de saída/retorno no gateway não foram provocados; a lógica de preservação/readmissão foi exercitada pelos testes HTTP.

Para repetir os testes, a partir de `backend`:

```powershell
npm.cmd run test:ranking
# Requer frontend previamente compilado e Chromium instalado pelo Playwright.
npx.cmd playwright install chromium
npm.cmd run test:ranking:browser
```
