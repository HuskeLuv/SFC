## Dashboard de Consultores

### Estrutura de Tabelas
- `users`
  - Campo `role` (`user`, `consultant`, `admin`) define permissões gerais.
- `consultants`
  - Relaciona um registro de consultor direto a um `users.id`.
- `client_consultants`
  - Define vínculo entre consultor e cliente (`consultant_id`, `client_id`) e status (`active`, `inactive`).
- `consultant_invites`
  - Armazena convites pendentes entre consultores e usuários (`status`: `pending`, `accepted`, `rejected`), incluindo `token` para rastreio e `responded_at`.
- `notifications`
  - Notificações enviadas a usuários finais. Cada notificação pode apontar para um convite de consultoria (`invite_id`) e mantém `read_at` para controle de leitura.
- Relações complementares
  - `cashflows`, `cashflow_groups`, `cashflow_items`, `cashflow_values` armazenam dados de fluxo de caixa por usuário.
  - `portfolios`, `stock_transactions`, `assets` representam os ativos do cliente consultado.

### Endpoints Disponíveis
- `GET /api/consultant/clients`
  - Lista clientes vinculados ao consultor autenticado.
- `GET /api/consultant/overview`
  - Retorna estatísticas resumidas (quantidade de clientes, patrimônio total, rentabilidade média).
- `GET /api/consultant/client/:id`
  - Entrega visão detalhada de um cliente: resumo financeiro, balanços, carteira, últimas movimentações.
  - Retorna `404` se o cliente não estiver vinculado ao consultor.
- `GET /api/consultant/invitations`
  - Lista os convites enviados pelo consultor autenticado, incluindo status e destinatário.
- `POST /api/consultant/invitations`
  - Envia um novo convite para o e-mail informado; apenas usuários do tipo `user` podem receber convites.
- `POST /api/consultant/invitations/[inviteId]/respond`
  - Permite ao cliente aceitar ou recusar um convite recebido (ações: `accept`, `reject`). Ao aceitar, o vínculo em `client_consultants` é criado/reativado.
- `GET /api/notifications`
  - Recupera as notificações do usuário autenticado (cliente ou consultor), retornando metadados e estado de leitura.
- `PATCH /api/notifications`
  - Marca um conjunto de notificações (`ids`) como lidas.

### Fluxo de Autenticação e Permissões
- Durante o login, o backend inclui `role` no JWT e na resposta da API; o formulário redireciona:
  - `consultant` → `/dashboard/consultor`
  - Demais perfis → `/carteira`
- `ProtectedRoute` garante sessão ativa; as páginas específicas de consultor realizam checagem adicional de papel:
  - Usuários não consultores são redirecionados para `/carteira`.
- As rotas de API validam o token:
  - Apenas `role === consultant` tem acesso.
  - A vinculação cliente-consultor é confirmada antes de retornar dados sensíveis.
- Ao reenviar convites:
  - A API bloqueia duplicatas pendentes para o mesmo endereço de e-mail.
  - Ao aceitar convites, o cookie de personificação pode ser ativado via `/api/consultant/acting` para permitir visão do cliente.
- Notificações:
  - São criadas automaticamente quando o consultor envia um convite ou recebe a resposta do cliente.
  - A interface de notificações marca itens como lidos ao abrir o painel e oferece ações rápidas de `Aceitar` e `Recusar` para convites pendentes.

