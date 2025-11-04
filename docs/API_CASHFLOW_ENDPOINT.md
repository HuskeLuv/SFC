# Endpoint `/api/cashflow`

## 📋 Descrição

Endpoint que retorna a hierarquia completa do fluxo de caixa, combinando templates padrão com personalizações do usuário.

## 🔗 URL

```
GET /api/cashflow?year=2024
```

## 📥 Parâmetros de Query

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|-------------|--------|-----------|
| `year` | number | Não | Ano atual | Filtrar valores por ano específico |

## 🔐 Autenticação

Requer autenticação via cookie `token` (JWT).

## 📤 Resposta

### Sucesso (200 OK)

```json
{
  "year": 2024,
  "groups": [
    {
      "id": "uuid",
      "userId": null,
      "name": "Entradas",
      "type": "entrada",
      "parentId": null,
      "orderIndex": 1,
      "items": [
        {
          "id": "uuid",
          "userId": null,
          "name": "Salário",
          "significado": "Remuneração mensal",
          "rank": 1,
          "values": [
            {
              "id": "uuid",
              "itemId": "uuid",
              "userId": "uuid",
              "year": 2024,
              "month": 0,
              "value": 8500
            }
          ]
        }
      ],
      "children": [
        {
          "id": "uuid",
          "name": "Entradas Fixas",
          "type": "entrada",
          "items": [...],
          "children": [...]
        }
      ]
    }
  ]
}
```

### Erro (400 Bad Request)

```json
{
  "error": "Ano inválido"
}
```

### Erro (401 Unauthorized)

```json
{
  "error": "Token não fornecido"
}
```

## 🔄 Funcionamento

### 1. Hierarquia Completa
O endpoint retorna a estrutura completa:
- **Grupos principais** (nível 1)
  - **Subgrupos** (nível 2)
    - **Sub-subgrupos** (nível 3)
      - **Itens** (com valores)

### 2. Combinação Templates + Personalizações

#### Templates (userId = null)
- Estrutura padrão compartilhada por todos os usuários
- Contém grupos, subgrupos e itens iniciais

#### Personalizações (userId = currentUser.id)
- Modificações específicas do usuário
- Podem substituir grupos, subgrupos ou itens dos templates

#### Regras de Mesclagem
1. **Grupos**: Se existe personalização com mesmo nome, usa personalização
2. **Itens**: Se existe personalização com mesmo nome, usa personalização
3. **Valores**: Sempre filtrados por `userId` e `year`

### 3. Filtro por Ano
- Valores são filtrados pelo parâmetro `year`
- Padrão: ano atual se não especificado
- Valores ordenados por mês (0 = Janeiro, 11 = Dezembro)

## 📝 Exemplos de Uso

### Obter fluxo de caixa do ano atual
```javascript
fetch('/api/cashflow', {
  credentials: 'include'
})
```

### Obter fluxo de caixa de 2023
```javascript
fetch('/api/cashflow?year=2023', {
  credentials: 'include'
})
```

### Processar resposta
```javascript
const response = await fetch('/api/cashflow?year=2024', {
  credentials: 'include'
});

const data = await response.json();
console.log(`Ano: ${data.year}`);
console.log(`Grupos: ${data.groups.length}`);

data.groups.forEach(group => {
  console.log(`- ${group.name} (${group.type})`);
  group.children?.forEach(child => {
    console.log(`  - ${child.name}`);
    child.items?.forEach(item => {
      console.log(`    - ${item.name}: ${item.values.length} valores`);
    });
  });
});
```

## ⚙️ Implementação Técnica

### Função de Mesclagem
A função `mergeTemplatesWithCustomizations()`:
1. Cria mapas hierárquicos de personalizações
2. Mescla recursivamente grupos e subgrupos
3. Mescla itens por nome (personalizações têm prioridade)
4. Mantém ordenação por `orderIndex` e `rank`

### Performance
- Queries otimizadas com `include` do Prisma
- Índices em `userId`, `parentId`, `groupId`, `year`, `month`
- Valores filtrados diretamente na query

## 🔍 Estrutura de Dados

### Grupo
```typescript
{
  id: string;
  userId: string | null; // null = template
  name: string;
  type: 'entrada' | 'despesa' | 'investimento';
  parentId: string | null;
  orderIndex: number;
  items: CashflowItem[];
  children: CashflowGroup[];
}
```

### Item
```typescript
{
  id: string;
  userId: string | null; // null = template
  groupId: string;
  name: string;
  significado: string | null;
  rank: number | null;
  values: CashflowValue[];
}
```

### Valor
```typescript
{
  id: string;
  itemId: string;
  userId: string; // sempre do usuário
  year: number;
  month: number; // 0-11 (Jan-Dez)
  value: number;
}
```

