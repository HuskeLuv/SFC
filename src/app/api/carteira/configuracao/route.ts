import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';

interface AlocacaoConfig {
  categoria: string;
  minimo: number;
  maximo: number;
  target: number;
}

// Configurações padrão - serão armazenadas em memória por sessão
const userConfigurations: { [userId: string]: AlocacaoConfig[] } = {};

// Configurações padrão baseadas na imagem original
const defaultConfig: AlocacaoConfig[] = [
  { categoria: "reservaOportunidade", minimo: 5, maximo: 10, target: 7 },
  { categoria: "rendaFixaFundos", minimo: 25, maximo: 60, target: 30 },
  { categoria: "fimFia", minimo: 0, maximo: 10, target: 5 },
  { categoria: "fiis", minimo: 20, maximo: 70, target: 25 },
  { categoria: "acoes", minimo: 0, maximo: 10, target: 5 },
  { categoria: "stocks", minimo: 0, maximo: 10, target: 8 },
  { categoria: "reits", minimo: 0, maximo: 10, target: 5 },
  { categoria: "etfs", minimo: 0, maximo: 10, target: 10 },
  { categoria: "moedasCriptos", minimo: 0, maximo: 5, target: 2 },
  { categoria: "previdenciaSeguros", minimo: 0, maximo: 5, target: 2 },
  { categoria: "opcoes", minimo: 0, maximo: 5, target: 1 },
];

// GET - Buscar configurações de alocação do usuário
export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);
    
    // Retorna configurações salvas ou defaults
    const alocacaoConfig = userConfigurations[payload.id] || defaultConfig;
    
    return NextResponse.json({ configuracoes: alocacaoConfig });

  } catch (error) {
    console.error('Erro ao buscar configurações de alocação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// PUT - Atualizar configurações de alocação do usuário
export async function PUT(request: NextRequest) {
  try {
    const payload = requireAuth(request);
    const { configuracoes } = await request.json();

    if (!configuracoes || !Array.isArray(configuracoes)) {
      return NextResponse.json(
        { error: 'Configurações inválidas' },
        { status: 400 }
      );
    }

    // Validar configurações
    for (const config of configuracoes) {
      if (!config.categoria || 
          typeof config.minimo !== 'number' || 
          typeof config.maximo !== 'number' || 
          typeof config.target !== 'number') {
        return NextResponse.json(
          { error: 'Formato de configuração inválido' },
          { status: 400 }
        );
      }

      if (config.minimo < 0 || config.maximo < 0 || config.target < 0) {
        return NextResponse.json(
          { error: 'Valores não podem ser negativos' },
          { status: 400 }
        );
      }

      if (config.minimo > config.maximo) {
        return NextResponse.json(
          { error: 'Valor mínimo não pode ser maior que o máximo' },
          { status: 400 }
        );
      }

      if (config.target < config.minimo || config.target > config.maximo) {
        return NextResponse.json(
          { error: 'Valor target deve estar entre mínimo e máximo' },
          { status: 400 }
        );
      }
    }

    // Verificar se soma dos targets não excede 100%
    const totalTargets = configuracoes.reduce((sum: number, config: AlocacaoConfig) => sum + config.target, 0);
    if (totalTargets > 100) {
      return NextResponse.json(
        { error: 'A soma dos targets não pode exceder 100%' },
        { status: 400 }
      );
    }

    // Salvar configurações em memória (temporário)
    userConfigurations[payload.id] = configuracoes;

    return NextResponse.json({ 
      success: true, 
      configuracoes 
    });

  } catch (error) {
    console.error('Erro ao salvar configurações de alocação:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 