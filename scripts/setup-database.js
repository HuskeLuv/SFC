#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🗄️  Configurando banco de dados...');

async function setupDatabase() {
  try {
    // Verificar se estamos no ambiente Vercel
    const isVercel = process.env.VERCEL === '1';
    console.log(`🌍 Ambiente: ${isVercel ? 'Vercel' : 'Local'}`);

    // Verificar se o DATABASE_URL está configurado
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL não está configurado!');
      console.log('💡 Configure a variável DATABASE_URL no Vercel');
      process.exit(1);
    }

    console.log('✅ DATABASE_URL configurado');

    // Gerar Prisma Client
    console.log('📦 Gerando Prisma Client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // Verificar se o banco está acessível
    console.log('🔍 Verificando conexão com o banco...');
    try {
      execSync('npx prisma db pull', { stdio: 'inherit' });
      console.log('✅ Conexão com banco estabelecida');
    } catch (error) {
      console.log('⚠️  Não foi possível conectar ao banco, tentando criar...');
    }

    // Executar migrações
    console.log('🚀 Executando migrações...');
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✅ Migrações executadas com sucesso');
    } catch (error) {
      console.log('⚠️  Erro ao executar migrações:', error.message);
      
      // Tentar criar o banco do zero
      console.log('🔄 Tentando criar banco do zero...');
      try {
        execSync('npx prisma db push', { stdio: 'inherit' });
        console.log('✅ Banco criado com sucesso');
      } catch (pushError) {
        console.error('❌ Erro ao criar banco:', pushError.message);
        throw pushError;
      }
    }

    // Verificar estrutura do banco
    console.log('🔍 Verificando estrutura do banco...');
    execSync('npx prisma db pull', { stdio: 'inherit' });
    console.log('✅ Estrutura do banco verificada');

    console.log('🎉 Banco de dados configurado com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante configuração do banco:', error.message);
    process.exit(1);
  }
}

setupDatabase(); 