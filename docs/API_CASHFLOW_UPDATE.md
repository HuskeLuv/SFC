# Endpoint `/api/cashflow/update`

## 📋 Descrição

Endpoint para criar, atualizar ou remover grupos, subgrupos ou itens do fluxo de caixa.

**Regras importantes:**
- Se o item/grupo for padrão (template), cria uma cópia personalizada automaticamente
- Atualiza ou remove apenas itens/grupos pertencentes ao usuário
- Não permite modificar ou deletar templates diretamente

## 🔗 URL

```
PATCH /api/cashflow/update
```

## 🔐 Autenticação

Requer autenticação via cookie `token` (JWT).

## 📥 Request Body

```json
{
  "operation": "create" | "update" | "delete",
  "type": "group" | "item",
  "id": "uuid", // Obrigatório para update/delete
  "data": {
    // Campos específicos por tipo
  }
}
```

## 📤 Respostas

### Criar Grupo (operation: "create", type: "group")

**Request:**
```json
{
  "operation": "create",
  "type": "group",
  "data": {
    "name": "Novo Grupo",
    "type": "despesa",
    "orderIndex": 0,
    "parentId": null
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "group": {
    "id": "uuid",
    "userId": "user_id",
    "name": "Novo Grupo",
    "type": "despesa",
    "orderIndex": 0,
    "parentId": null,
    "items": [],
    "children": []
  }
}
```

### Atualizar Grupo (operation: "update", type: "group")

**Request:**
```json
{
  "operation": "update",
  "type": "group",
  "id": "template_group_id", // Se for template, cria cópia
  "data": {
    "name": "Nome Atualizado",
    "orderIndex": 5
  }
}
```

**Comportamento:**
- Se `id` for de um template → cria cópia personalizada automaticamente
- Se `id` for personalizado → atualiza diretamente
- Só atualiza grupos do usuário (`userId = currentUser.id`)

**Response (200 OK):**
```json
{
  "success": true,
  "group": {
    "id": "new_personalized_id",
    "userId": "user_id",
    "name": "Nome Atualizado",
    "type": "despesa",
    "orderIndex": 5,
    "items": [...],
    "children": [...]
  }
}
```

### Deletar Grupo (operation: "delete", type: "group")

**Request:**
```json
{
  "operation": "delete",
  "type": "group",
  "id": "personalized_group_id"
}
```

**Regras:**
- Só deleta grupos personalizados do usuário
- Não permite deletar se tiver subgrupos ou itens
- Retorna erro se tentar deletar template

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Grupo deletado com sucesso"
}
```

### Criar Item (operation: "create", type: "item")

**Request:**
```json
{
  "operation": "create",
  "type": "item",
  "data": {
    "groupId": "group_id",
    "name": "Novo Item",
    "significado": "Descrição opcional",
    "rank": 1
  }
}
```

**Comportamento:**
- Se `groupId` for template → personaliza grupo automaticamente
- Item criado sempre é personalizado (`userId = currentUser.id`)

**Response (200 OK):**
```json
{
  "success": true,
  "item": {
    "id": "uuid",
    "userId": "user_id",
    "groupId": "group_id",
    "name": "Novo Item",
    "significado": "Descrição opcional",
    "rank": 1,
    "values": []
  }
}
```

### Atualizar Item (operation: "update", type: "item")

**Request:**
```json
{
  "operation": "update",
  "type": "item",
  "id": "template_item_id", // Se for template, cria cópia
  "data": {
    "name": "Nome Atualizado",
    "significado": "Nova descrição",
    "rank": 2
  }
}
```

**Comportamento:**
- Se `id` for de um template → cria cópia personalizada automaticamente
- Se `id` for personalizado → atualiza diretamente
- Só atualiza itens do usuário (`userId = currentUser.id`)

**Response (200 OK):**
```json
{
  "success": true,
  "item": {
    "id": "new_personalized_id",
    "userId": "user_id",
    "groupId": "group_id",
    "name": "Nome Atualizado",
    "significado": "Nova descrição",
    "rank": 2,
    "values": [...]
  }
}
```

### Deletar Item (operation: "delete", type: "item")

**Request:**
```json
{
  "operation": "delete",
  "type": "item",
  "id": "personalized_item_id"
}
```

**Regras:**
- Só deleta itens personalizados do usuário
- Deleta automaticamente todos os valores associados
- Retorna erro se tentar deletar template

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Item deletado com sucesso"
}
```

## ⚠️ Erros

### 400 Bad Request
```json
{
  "error": "operation e type são obrigatórios"
}
```

### 401 Unauthorized
```json
{
  "error": "Token não fornecido"
}
```

### 404 Not Found
```json
{
  "error": "Grupo não encontrado"
}
```

### 400 Bad Request (tentando deletar grupo com filhos)
```json
{
  "error": "Não é possível deletar grupo com subgrupos. Delete os subgrupos primeiro."
}
```

## 📝 Exemplos de Uso

### Criar novo grupo personalizado
```javascript
const response = await fetch('/api/cashflow/update', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    operation: 'create',
    type: 'group',
    data: {
      name: 'Minhas Despesas Pessoais',
      type: 'despesa',
      orderIndex: 10,
      parentId: null
    }
  })
});

const result = await response.json();
console.log(result.group);
```

### Atualizar item template (cria cópia automaticamente)
```javascript
const response = await fetch('/api/cashflow/update', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    operation: 'update',
    type: 'item',
    id: 'template_item_id', // ID do template
    data: {
      name: 'Salário Atualizado',
      significado: 'Minha descrição personalizada'
    }
  })
});

const result = await response.json();
// result.item.id será o novo ID da cópia personalizada
```

### Deletar item personalizado
```javascript
const response = await fetch('/api/cashflow/update', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    operation: 'delete',
    type: 'item',
    id: 'personalized_item_id'
  })
});

const result = await response.json();
console.log(result.message); // "Item deletado com sucesso"
```

## 🔄 Fluxo de Personalização Automática

1. **Usuário tenta atualizar template:**
   - API detecta que `userId = null` (é template)
   - Chama `personalizeGroup()` ou `personalizeItem()`
   - Cria cópia com `userId = currentUser.id`
   - Retorna novo ID da cópia

2. **Usuário tenta atualizar novamente:**
   - API detecta que `userId = currentUser.id` (já é personalizado)
   - Atualiza diretamente sem criar nova cópia

3. **Template original permanece intacto:**
   - Template continua com `userId = null`
   - Disponível para outros usuários
   - Não pode ser modificado diretamente

## 🛡️ Segurança

- Validação de autenticação obrigatória
- Verificação de propriedade (`userId = currentUser.id`)
- Não permite modificar/deletar templates
- Validação de dependências antes de deletar (grupos com filhos/itens)

