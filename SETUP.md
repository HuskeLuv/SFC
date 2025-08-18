# 🚀 Configuração do Sistema Cashflow

## 📋 Visão Geral

Este sistema implementa uma arquitetura multi-tenant onde:
- **Templates padrão** são criados uma única vez no sistema
- **Usuários individuais** recebem sua estrutura automaticamente no primeiro acesso
- **Não é necessário rodar seed** para cada usuário

## 🔧 Configuração Inicial (Uma única vez)

### 1. Inicializar Templates do Sistema
```bash
npm run init-system
```
Este comando cria os templates padrão no banco de dados:
- Grupos principais (Entradas, Despesas, Investimentos)
- Subgrupos hierárquicos
- Estrutura completa de categorias

### 2. Criar Usuário de Teste (Opcional)
```bash
npm run seed
```
Este comando cria apenas um usuário de teste para visualização:
- Email: `teste@exemplo.com`
- Senha: `teste123`
- Stocks padrão para demonstração

## 🎯 Como Funciona

### Para Novos Usuários:
1. **Registro**: Usuário se cadastra no sistema
2. **Primeiro Acesso**: Ao acessar `/data-tables`, o sistema detecta que não há estrutura
3. **Criação Automática**: Sistema cria grupos e itens baseados nos templates
4. **Itens de Investimento**: 12 itens padrão são criados automaticamente

### Estrutura Criada Automaticamente:
```
📁 Entradas
  📁 Entradas Fixas
  📁 Entradas Variáveis
    📁 Sem Tributação
    📁 Com Tributação

📁 Despesas
  📁 Despesas Fixas
    📁 Habitação, Transporte, Saúde, Educação, etc.
  📁 Despesas Variáveis
    📁 Transporte, Saúde, Educação, etc.

📁 Investimentos
  📋 Reserva Emergência
  📋 Reserva Oportunidade
  📋 Renda Fixa & Fundos
  📋 Fundos (FIM / FIA)
  📋 FII's
  📋 Ações
  📋 STOCKS
  📋 REIT's
  📋 ETF's
  📋 Moedas, Criptomoedas & Outros
  📋 Previdência & Seguros
  📋 Imóveis Físicos
```

## 🔄 Fluxo de Funcionamento

### 1. **Templates do Sistema** (Criados uma vez)
- `CashflowGroupTemplate` - Estrutura padrão
- Não específicos de usuário
- Base para criação automática

### 2. **Estrutura do Usuário** (Criada automaticamente)
- `CashflowGroup` - Grupos específicos do usuário
- `CashflowItem` - Itens específicos do usuário
- `CashflowValue` - Valores mensais do usuário

### 3. **Criação Automática**
- Hook `useCashflow` detecta ausência de estrutura
- Chama API `/api/cashflow/setup`
- Sistema cria grupos e itens baseados nos templates
- Usuário vê tabela completa pronta para uso

## 🛠️ Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Iniciar servidor de desenvolvimento |
| `npm run init-system` | Criar templates padrão do sistema |
| `npm run seed` | Criar usuário de teste |
| `npm run build` | Build de produção |

## 📁 Arquivos Importantes

- **`scripts/init-system.js`** - Script de inicialização do sistema
- **`src/utils/cashflowSetup.ts`** - Lógica de criação automática
- **`src/hooks/useCashflow.ts`** - Hook principal do cashflow
- **`src/app/api/cashflow/setup/route.ts`** - API de setup automático

## 🎉 Vantagens da Arquitetura

✅ **Sem Seed Repetitivo**: Templates criados uma única vez
✅ **Setup Automático**: Usuários recebem estrutura automaticamente
✅ **Multi-Tenant**: Cada usuário tem dados isolados
✅ **Escalável**: Suporta milhares de usuários
✅ **Manutenível**: Mudanças nos templates afetam novos usuários

## 🚨 Resolução de Problemas

### Se a estrutura não for criada automaticamente:
1. Verificar se os templates existem: `npm run init-system`
2. Verificar logs do console para erros
3. Verificar se o usuário está autenticado

### Para recriar templates:
1. Deletar templates existentes no banco
2. Executar: `npm run init-system`

### Para testar com usuário limpo:
1. Deletar grupos do usuário no banco
2. Acessar `/data-tables` novamente
3. Estrutura será recriada automaticamente

## 💡 Dicas de Desenvolvimento

- **Templates**: Modifique apenas `scripts/init-system.js`
- **Lógica de Setup**: Modifique `src/utils/cashflowSetup.ts`
- **Interface**: Modifique `src/hooks/useCashflow.ts`
- **APIs**: Modifique arquivos em `src/app/api/cashflow/`

---

**🎯 Objetivo**: Sistema que funciona sem intervenção manual, criando estrutura automaticamente para cada usuário! 