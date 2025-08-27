# Scripts de Sincronização de Dados Externos

Este diretório contém scripts para população e atualização do banco de dados com dados de fontes externas.

## sync-external-data.ts

Script principal para sincronização de dados da B3 e instituições financeiras do Bacen.

### Funcionalidades

#### 1. Lista de Ativos da B3
- **Fonte**: API pública https://brapi.dev/api/quote/list
- **Dados salvos na tabela `Asset`**:
  - `ticker` (string, único) - Código do ativo (ex: PETR4, VALE3)
  - `nome` (string) - Nome da empresa/ativo
  - `tipo` (string, opcional) - Tipo: ação, FII, ETF, BDR etc.
  - `setor` (string, opcional) - Setor da empresa
  - `status` (string) - ativo/inativo
  - `createdAt` e `updatedAt` - Timestamps automáticos

#### 2. Lista de Instituições Financeiras
- **Fonte**: API do Bacen (com fallback para dados de exemplo)
- **Dados salvos na tabela `Institution`**:
  - `codigo` (string, único) - Código da instituição no Bacen
  - `nome` (string) - Nome da instituição
  - `cnpj` (string) - CNPJ da instituição
  - `status` (string) - ativo/inativo
  - `createdAt` e `updatedAt` - Timestamps automáticos

### Como Usar

#### Execução Manual
```bash
# Via npm script
npm run sync-data

# Ou diretamente via tsx
npx tsx scripts/sync-external-data.ts
```

#### Execução Programática
```typescript
import { syncExternalData } from './scripts/sync-external-data';

// Executar sincronização completa
await syncExternalData();

// Ou usar funções individuais
import { fetchAtivos, syncAtivos, fetchInstituicoes, syncInstituicoes } from './scripts/sync-external-data';

// Sincronizar apenas ativos
const ativos = await fetchAtivos();
await syncAtivos(ativos);

// Sincronizar apenas instituições
const instituicoes = await fetchInstituicoes();
await syncInstituicoes(instituicoes);
```

### Características Técnicas

#### Tratamento de Erros
- **Try/catch robusto**: Cada função tem tratamento de erro individual
- **Fallback para instituições**: Se a API do Bacen falhar, usa dados de exemplo das principais instituições brasileiras
- **Logs detalhados**: Console logs informativos sobre o progresso e erros

#### Prevenção de Duplicação
- **Uso de `upsert`**: Evita duplicação usando `prisma.asset.upsert` e `prisma.institution.upsert`
- **Chaves únicas**: Baseado em `ticker` para ativos e `codigo` para instituições

#### Performance
- **Requisições paralelas**: APIs são consultadas em paralelo usando `Promise.all`
- **Sincronização paralela**: Dados são salvos no banco em paralelo
- **Índices de banco**: Esquema Prisma inclui índices para melhor performance

#### Estrutura de Código Organizada
- **fetchAtivos()**: Busca dados da API da B3
- **fetchInstituicoes()**: Busca dados da API do Bacen
- **syncAtivos()**: Sincroniza ativos no banco
- **syncInstituicoes()**: Sincroniza instituições no banco
- **main()**: Função principal que coordena todo o processo

### Logs e Monitoramento

O script fornece logs detalhados durante a execução:

```
🚀 Iniciando sincronização de dados externos...

📡 Fazendo requisições para as APIs...
🔍 Buscando dados de ativos da B3...
🔍 Buscando dados de instituições financeiras do Bacen...
✅ 1592 ativos encontrados na API
⚠️  API do Bacen indisponível, criando dados de exemplo...

💾 Sincronizando dados no banco...
💾 Sincronizando ativos no banco de dados...
💾 Sincronizando instituições no banco de dados...
✅ Instituições sincronizadas: 10 inseridas, 0 atualizadas
✅ Ativos sincronizados: 1592 inseridos, 0 atualizados

🎉 Sincronização concluída com sucesso!
📊 RESUMO:
   • Ativos: 1592 inseridos, 0 atualizados
   • Instituições: 10 inseridas, 0 atualizadas
   • Tempo total: 146.09s
```

### Agendamento Automático

Para executar automaticamente, você pode:

#### 1. Cron Job (Linux/Mac)
```bash
# Editar crontab
crontab -e

# Executar diariamente às 6h da manhã
0 6 * * * cd /caminho/para/projeto && npm run sync-data
```

#### 2. GitHub Actions
```yaml
name: Sync External Data
on:
  schedule:
    - cron: '0 6 * * *'  # Diariamente às 6h UTC

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run sync-data
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

#### 3. Vercel Cron Jobs
```typescript
// api/cron/sync-data.ts
import { syncExternalData } from '../../scripts/sync-external-data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await syncExternalData();
    res.status(200).json({ success: true, message: 'Data synchronized successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync data' });
  }
}
```

### Dependências

- `@prisma/client` - ORM para acesso ao banco
- `tsx` - Execução de TypeScript
- APIs externas:
  - https://brapi.dev/api/quote/list (ativos da B3)
  - Portal de dados abertos do Bacen (instituições)

### Solução de Problemas

#### Erro de conexão com banco
```
Error: P1001: Can't reach database server
```
- Verificar variável `DATABASE_URL` no `.env`
- Confirmar que o banco está acessível

#### API da B3 indisponível
```
❌ Erro ao buscar dados da API brapi.dev: Error: Erro HTTP: 503
```
- A API pode estar temporariamente indisponível
- Tentar novamente em alguns minutos

#### Problemas de migração
```
Error: P2021: The table does not exist in the current database
```
- Executar migrações: `npx prisma migrate dev`
- Gerar cliente: `npx prisma generate`

### Contribuição

Para adicionar novos dados externos:

1. Criar nova interface para o tipo de dados
2. Implementar função `fetch[TipoDados]()`
3. Criar model no `schema.prisma`
4. Implementar função `sync[TipoDados]()`
5. Adicionar chamadas na função `main()`
6. Atualizar documentação 