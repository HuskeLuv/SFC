# Sistema de Avatar Inteligente

Este sistema de avatar automaticamente escolhe entre mostrar uma imagem de perfil ou as iniciais do usuário, baseado na disponibilidade da imagem.

## Características

- **Automático**: Decide automaticamente entre imagem e iniciais
- **Inteligente**: Detecta quando não há imagem ou quando é uma imagem padrão
- **Consistente**: Cores baseadas no nome do usuário para manter consistência visual
- **Responsivo**: Suporta diferentes tamanhos e indicadores de status
- **Acessível**: Inclui alt text e suporte a temas claro/escuro

## Como Funciona

O sistema verifica se existe uma `avatarUrl` válida:
- Se não houver URL ou for uma imagem padrão → mostra iniciais
- Se houver uma URL válida → mostra a imagem
- As iniciais são geradas automaticamente do nome (ex: "Wellington Santos" → "WS")

## Uso Básico

### Avatar com Iniciais (Automático)
```tsx
<Avatar name="Wellington Santos" />
```

### Avatar com Imagem
```tsx
<Avatar 
  src="/images/user/profile.jpg" 
  name="Wellington Santos" 
/>
```

### Com Tamanho e Status
```tsx
<Avatar 
  name="Wellington Santos" 
  size="large" 
  status="online" 
/>
```

## Props

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `src` | `string?` | `undefined` | URL da imagem do avatar |
| `name` | `string` | `"User"` | Nome do usuário para gerar iniciais |
| `size` | `"xsmall" \| "small" \| "medium" \| "large" \| "xlarge" \| "xxlarge"` | `"medium"` | Tamanho do avatar |
| `status` | `"online" \| "offline" \| "busy" \| "none"` | `"none"` | Indicador de status |
| `alt` | `string` | `"User Avatar"` | Texto alternativo para acessibilidade |

## Tamanhos Disponíveis

- `xsmall`: 24x24px
- `small`: 32x32px  
- `medium`: 40x40px
- `large`: 48x48px
- `xlarge`: 56x56px
- `xxlarge`: 64x64px

## Cores das Iniciais

As cores são geradas deterministicamente baseadas no nome do usuário, garantindo que:
- O mesmo usuário sempre tenha a mesma cor
- Diferentes usuários tenham cores diferentes
- As cores funcionem bem em temas claro e escuro

## Exemplos de Uso

### 1. Usuário Recém-Criado (Sem Imagem)
```tsx
// Automaticamente mostra iniciais "WS"
<Avatar name="Wellington Santos" />
```

### 2. Usuário com Imagem de Perfil
```tsx
// Mostra a imagem do usuário
<Avatar 
  src="/uploads/profile-123.jpg" 
  name="Wellington Santos" 
/>
```

### 3. Lista de Usuários
```tsx
{users.map(user => (
  <Avatar 
    key={user.id}
    src={user.avatarUrl}
    name={user.name}
    size="medium"
  />
))}
```

### 4. Header com Status
```tsx
<Avatar 
  name="Wellington Santos"
  size="large"
  status="online"
  alt="Avatar de Wellington Santos"
/>
```

## Migração

### Antes (Avatar Antigo)
```tsx
<Avatar src="/images/user/owner.jpg" />
```

### Depois (Avatar Inteligente)
```tsx
<Avatar 
  src={user.avatarUrl} 
  name={user.name} 
/>
```

## Benefícios

1. **Experiência do Usuário**: Usuários recém-criados têm avatares imediatamente
2. **Consistência Visual**: Cores consistentes baseadas no nome
3. **Manutenibilidade**: Menos código para gerenciar avatares padrão
4. **Acessibilidade**: Sempre há algo para mostrar, mesmo sem imagem
5. **Performance**: Não precisa carregar imagens desnecessárias

## Casos de Uso

- **Registro de Usuário**: Automaticamente gera avatar com iniciais
- **Perfil de Usuário**: Mostra imagem se disponível, senão iniciais
- **Listas de Usuários**: Funciona com ou sem imagens
- **Chat/Comentários**: Avatares consistentes para todos os usuários
- **Dashboard**: Indicadores visuais claros para diferentes usuários 