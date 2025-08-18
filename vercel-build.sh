#!/bin/bash

# Script de build para o Vercel
echo "🚀 Iniciando build no Vercel..."

# Verificar se o Prisma está configurado
if [ -f "prisma/schema.prisma" ]; then
    echo "📦 Gerando cliente Prisma..."
    npx prisma generate
else
    echo "⚠️  Schema Prisma não encontrado, pulando geração..."
fi

# Verificar dependências
echo "🔍 Verificando dependências..."
npm ci --only=production

# Build do Next.js
echo "🏗️  Executando build do Next.js..."
npm run build

echo "✅ Build concluído com sucesso!" 