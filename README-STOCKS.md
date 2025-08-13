# Módulo de Stocks - Sistema de Gestão de Investimentos

## 🎯 Visão Geral

Este módulo permite aos usuários gerenciar seus investimentos em ações, incluindo:
- **Watchlist**: Lista de ativos para acompanhamento
- **Portfolio**: Ações que o usuário possui
- **Transações**: Histórico de compras e vendas
- **Performance**: Acompanhamento da evolução do portfolio

## 🔐 Sistema de Autenticação

O módulo utiliza o **sistema JWT existente** da aplicação para autenticação segura, garantindo que cada usuário veja apenas seus próprios dados.

### Configuração das Variáveis de Ambiente

O sistema já está configurado com as variáveis necessárias. Verifique se existe um arquivo `.env.local` com:

```bash
# JWT Configuration (já configurado no sistema existente)
JWT_SECRET=your-jwt-secret-key-here

# Database (já configurado)
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

## 🚀 Como Usar

### 1. Login
- Use o sistema de login existente em `/signin`
- Use as credenciais do seed: `admin@example.com` / `123456`

### 2. Funcionalidades Principais

#### Watchlist
- Adicione ativos à sua lista de observação
- Acompanhe preços e variações
- Adicione observações personalizadas

#### Portfolio
- Registre suas compras e vendas
- Acompanhe a performance do portfolio
- Visualize estatísticas detalhadas

#### Transações
- Histórico completo de operações
- Busca e filtros
- Detalhes de cada transação

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

- **`stocks`**: Ativos disponíveis na B3
- **`watchlists`**: Lista de observação por usuário
- **`portfolios`**: Portfolio de cada usuário
- **`stock_transactions`**: Histórico de transações

### Relacionamentos

- Cada usuário tem seu próprio watchlist e portfolio
- Transações são vinculadas ao usuário e ativo
- Portfolio é atualizado automaticamente com transações

## 🔧 Configuração Técnica

### Sistema de Autenticação

O módulo integra-se ao sistema JWT existente da aplicação:
- **Verificação automática** de tokens em todas as APIs
- **Isolamento de dados** por usuário
- **Proteção de rotas** com componente `ProtectedRoute`

### Arquivos de Configuração

- `src/utils/auth.ts` - Utilitários de verificação JWT
- `src/hooks/useAuth.ts` - Hook de autenticação
- `src/hooks/useStocks.ts` - Hook principal do módulo
- `src/components/auth/ProtectedRoute.tsx` - Proteção de rotas

### APIs Disponíveis

- `GET /api/stocks` - Listar ativos disponíveis
- `GET /api/stocks/watchlist` - Watchlist do usuário
- `POST /api/stocks/watchlist` - Adicionar ao watchlist
- `DELETE /api/stocks/watchlist/[id]` - Remover do watchlist
- `GET /api/stocks/portfolio` - Portfolio do usuário
- `GET /api/stocks/transactions` - Transações do usuário
- `POST /api/stocks/transactions` - Registrar transação

## 🛡️ Segurança

- **Autenticação obrigatória** para todas as operações
- **Isolamento de dados** por usuário
- **Validação de entrada** em todas as APIs
- **Proteção de rotas** com componente `ProtectedRoute`
- **Integração com sistema JWT existente**

## 📊 Dados da B3

O sistema está configurado para buscar dados da API oficial da B3:
- **Endpoint**: `https://arquivos.b3.com.br/apinegocios/ticker`
- **Fallback**: Dados simulados para desenvolvimento
- **Atualização**: Script de seed para popular o banco

## 🚀 Próximos Passos

### Funcionalidades Futuras

1. **Dados em Tempo Real**: Integração com APIs de preços em tempo real
2. **Alertas**: Notificações de preços e variações
3. **Relatórios**: Exportação de dados e relatórios
4. **Múltiplas Moedas**: Suporte a diferentes moedas
5. **Análise Técnica**: Indicadores e gráficos avançados

### Melhorias Técnicas

1. **Cache**: Implementar cache para dados de preços
2. **WebSockets**: Atualizações em tempo real
3. **Testes**: Cobertura de testes unitários e de integração
4. **Monitoramento**: Logs e métricas de performance

## 🐛 Solução de Problemas

### Erro de Autenticação
- Verifique se está logado no sistema existente
- Confirme se o token JWT está válido
- Verifique se as variáveis de ambiente estão configuradas

### Dados Não Carregam
- Verifique a conexão com o banco de dados
- Confirme se as migrações foram executadas
- Verifique os logs da API

### Performance
- O sistema usa dados simulados para preços
- Em produção, implemente cache e otimizações
- Considere paginação para grandes volumes de dados

## 📝 Licença

Este módulo é parte do sistema principal e segue as mesmas políticas de licenciamento. 