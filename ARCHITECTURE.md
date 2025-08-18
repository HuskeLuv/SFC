# 🏗️ Arquitetura Multi-Tenant do Sistema de Cashflow

## 📋 Visão Geral

Este documento descreve a nova arquitetura multi-tenant implementada para o sistema de cashflow, projetada para suportar **10 mil usuários** com isolamento completo de dados e performance otimizada.

## 🎯 Objetivos da Arquitetura

- ✅ **Multi-tenant**: Cada usuário tem dados completamente isolados
- ✅ **Escalabilidade**: Suporte a 10k+ usuários simultâneos
- ✅ **Performance**: Índices otimizados e consultas paginadas
- ✅ **Manutenibilidade**: Estrutura padrão separada dos dados individuais
- ✅ **Segurança**: Isolamento lógico por `userId` em todas as operações

## 🏛️ Estrutura do Banco de Dados

### 1. **Templates Padrão** (Dados do Sistema)
```sql
-- Grupos padrão que todos os usuários herdam
cashflow_group_templates
├── Entradas (ENTRADA)
├── Despesas (DESPESA)
└── Investimentos (DESPESA)
    ├── Reserva Emergência
    ├── Reserva Oportunidade
    ├── Renda Fixa & Fundos
    ├── FII's
    ├── Ações
    ├── STOCKS
    ├── REIT's
    ├── ETF's
    ├── Criptomoedas
    ├── Previdência & Seguros
    └── Imóveis Físicos
```

### 2. **Dados dos Usuários** (Isolados por userId)
```sql
-- Cada usuário tem sua própria estrutura baseada nos templates
cashflow_groups (userId: string)
cashflow_items (userId: string)
cashflow_values (userId: string)
```

## 🔐 Isolamento Multi-Tenant

### **Princípio Fundamental**
```typescript
// TODAS as consultas devem incluir userId
const userData = await prisma.cashflowGroup.findMany({
  where: { userId: currentUser.id } // ✅ OBRIGATÓRIO
});
```

### **Campos de Isolamento**
- `userId` em todas as tabelas de dados do usuário
- `isSystem: true` para templates padrão
- `isCustom: false` para itens herdados dos templates

## 📊 Índices de Performance

### **Índices Principais**
```sql
-- Usuários
CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_isActive_idx ON users(isActive);

-- Cashflow
CREATE INDEX cashflow_groups_userId_idx ON cashflow_groups(userId);
CREATE INDEX cashflow_items_userId_idx ON cashflow_items(userId);
CREATE INDEX cashflow_values_userId_idx ON cashflow_values(userId);

-- Stocks
CREATE INDEX stocks_ticker_idx ON stocks(ticker);
CREATE INDEX portfolios_userId_idx ON portfolios(userId);
```

### **Índices Compostos**
```sql
-- Valores mensais por usuário e período
CREATE INDEX cashflow_values_mes_ano_idx ON cashflow_values(mes, ano);
CREATE UNIQUE INDEX cashflow_values_userId_itemId_mes_ano_key 
  ON cashflow_values(userId, itemId, mes, ano);
```

## 🚀 Fluxo de Configuração Automática

### **1. Primeiro Acesso do Usuário**
```typescript
// Verificar se já tem estrutura
const hasSetup = await hasUserCashflowSetup(userId);

if (!hasSetup) {
  // Configurar automaticamente baseado nos templates
  await setupUserCashflow({
    userId,
    includeSampleData: true // Incluir itens de investimento
  });
}
```

### **2. Criação da Estrutura**
```typescript
// 1. Buscar templates ativos
const templates = await prisma.cashflowGroupTemplate.findMany({
  where: { isActive: true }
});

// 2. Criar grupos para o usuário
for (const template of templates) {
  await prisma.cashflowGroup.create({
    data: {
      userId,
      templateId: template.id,
      name: template.name,
      type: template.type,
      // ... outros campos
    }
  });
}

// 3. Criar itens padrão (opcional)
if (includeSampleData) {
  await createInvestmentItems(userId, groupIds);
}
```

## 🔄 Operações CRUD

### **Criar Item**
```typescript
const newItem = await prisma.cashflowItem.create({
  data: {
    userId: currentUser.id, // ✅ OBRIGATÓRIO
    groupId,
    descricao: "Novo item",
    // ... outros campos
  }
});
```

### **Buscar Dados**
```typescript
const userGroups = await prisma.cashflowGroup.findMany({
  where: { 
    userId: currentUser.id, // ✅ OBRIGATÓRIO
    isActive: true 
  },
  include: {
    children: true,
    items: {
      include: {
        valores: {
          where: { userId: currentUser.id } // ✅ OBRIGATÓRIO
        }
      }
    }
  }
});
```

### **Atualizar Item**
```typescript
const updatedItem = await prisma.cashflowItem.update({
  where: { 
    id: itemId,
    userId: currentUser.id // ✅ OBRIGATÓRIO
  },
  data: { /* campos atualizados */ }
});
```

### **Deletar Item**
```typescript
await prisma.cashflowItem.delete({
  where: { 
    id: itemId,
    userId: currentUser.id // ✅ OBRIGATÓRIO
  }
});
```

## 📈 Consultas Paginadas

### **Exemplo de Paginação**
```typescript
const pageSize = 20;
const page = 1;

const items = await prisma.cashflowItem.findMany({
  where: { userId: currentUser.id },
  take: pageSize,
  skip: (page - 1) * pageSize,
  orderBy: { createdAt: 'desc' }
});

const total = await prisma.cashflowItem.count({
  where: { userId: currentUser.id }
});
```

## 🛡️ Segurança e Validação

### **Middleware de Validação**
```typescript
// Sempre validar userId antes de qualquer operação
export const validateUserAccess = (userId: string, resourceUserId: string) => {
  if (userId !== resourceUserId) {
    throw new Error('Acesso negado');
  }
};
```

### **Validação no Prisma**
```typescript
// Usar where clauses para garantir isolamento
const userData = await prisma.cashflowGroup.findFirst({
  where: { 
    id: groupId,
    userId: currentUser.id // ✅ Garante isolamento
  }
});
```

## 🔧 Manutenção e Monitoramento

### **Métricas de Performance**
```sql
-- Verificar uso de índices
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Verificar tamanho das tabelas
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### **Limpeza de Dados**
```typescript
// Limpar dados de um usuário (para reset)
export const clearUserCashflow = async (userId: string) => {
  await prisma.cashflowValue.deleteMany({ where: { userId } });
  await prisma.cashflowItem.deleteMany({ where: { userId } });
  await prisma.cashflowGroup.deleteMany({ where: { userId } });
};
```

## 📝 Checklist de Implementação

### **Para Novos Desenvolvedores**
- [ ] Sempre incluir `userId` em consultas
- [ ] Usar enums definidos no schema
- [ ] Implementar paginação para listas grandes
- [ ] Validar acesso do usuário antes de operações
- [ ] Usar índices existentes para consultas

### **Para Novas Funcionalidades**
- [ ] Adicionar `userId` em novas tabelas
- [ ] Criar índices para campos de filtro frequente
- [ ] Implementar soft delete com `isActive`
- [ ] Adicionar timestamps (`createdAt`, `updatedAt`)
- [ ] Documentar relacionamentos e constraints

## 🎉 Benefícios da Nova Arquitetura

1. **Escalabilidade**: Suporte a 10k+ usuários simultâneos
2. **Performance**: Consultas otimizadas com índices estratégicos
3. **Manutenibilidade**: Estrutura padrão separada dos dados
4. **Segurança**: Isolamento completo entre usuários
5. **Flexibilidade**: Usuários podem personalizar sua estrutura
6. **Consistência**: Dados sempre filtrados por `userId`

## 🚨 Pontos de Atenção

- **NUNCA** esquecer de filtrar por `userId`
- **SEMPRE** usar transações para operações complexas
- **SEMPRE** validar permissões antes de operações
- **NUNCA** expor dados de outros usuários
- **SEMPRE** usar índices para consultas frequentes

---

*Esta arquitetura foi projetada para crescer com o sistema, mantendo performance e segurança em todos os níveis.* 