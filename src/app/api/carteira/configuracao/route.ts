import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

interface AlocacaoConfig {
  categoria: string;
  minimo: number;
  maximo: number;
  target: number;
  descricao?: string;
}

// Configurações padrão baseadas na imagem original
const defaultConfig: AlocacaoConfig[] = [
  { categoria: "reservaEmergencia", minimo: 5, maximo: 15, target: 10, descricao: "" },
  { categoria: "reservaOportunidade", minimo: 5, maximo: 10, target: 7, descricao: "" },
  { categoria: "rendaFixaFundos", minimo: 25, maximo: 60, target: 30, descricao: "" },
  { categoria: "fimFia", minimo: 0, maximo: 10, target: 5, descricao: "" },
  { categoria: "fiis", minimo: 20, maximo: 70, target: 25, descricao: "" },
  { categoria: "acoes", minimo: 0, maximo: 10, target: 5, descricao: "" },
  { categoria: "stocks", minimo: 0, maximo: 10, target: 8, descricao: "" },
  { categoria: "reits", minimo: 0, maximo: 10, target: 5, descricao: "" },
  { categoria: "etfs", minimo: 0, maximo: 10, target: 10, descricao: "" },
  { categoria: "moedasCriptos", minimo: 0, maximo: 5, target: 2, descricao: "" },
  { categoria: "previdenciaSeguros", minimo: 0, maximo: 5, target: 2, descricao: "" },
  { categoria: "opcoes", minimo: 0, maximo: 5, target: 1, descricao: "" },
];

// GET - Buscar configurações de alocação do usuário
export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    
    // Buscar configurações do banco de dados
    const savedConfigs = await prisma.alocacaoConfig.findMany({
      where: { userId: targetUserId },
    });

    // Se não houver configurações salvas, retornar defaults
    if (savedConfigs.length === 0) {
      return NextResponse.json({ configuracoes: defaultConfig });
    }

    // Converter para o formato esperado
    const alocacaoConfig = savedConfigs.map(config => ({
      categoria: config.categoria,
      minimo: config.minimo,
      maximo: config.maximo,
      target: config.target,
      descricao: config.descricao || "",
    }));

    // Garantir que todas as categorias padrão estejam presentes
    const configMap = new Map(alocacaoConfig.map(c => [c.categoria, c]));
    const completeConfig = defaultConfig.map(defaultItem => {
      const saved = configMap.get(defaultItem.categoria);
      return saved || defaultItem;
    });

    return NextResponse.json({ configuracoes: completeConfig });

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
    const { targetUserId } = await requireAuthWithActing(request);
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

      if (config.descricao !== undefined && typeof config.descricao !== 'string') {
        return NextResponse.json(
          { error: 'Formato de descrição inválido' },
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

      // Pular validação de target entre min/max para reserva de emergência
      if (config.categoria !== 'reservaEmergencia') {
        if (config.target < config.minimo || config.target > config.maximo) {
          return NextResponse.json(
            { error: 'Valor target deve estar entre mínimo e máximo' },
            { status: 400 }
          );
        }
      }
    }

    // Verificar se soma dos targets não excede 100% (excluindo reserva de emergência)
    const totalTargets = configuracoes
      .filter((config: AlocacaoConfig) => config.categoria !== 'reservaEmergencia')
      .reduce((sum: number, config: AlocacaoConfig) => sum + config.target, 0);
    if (totalTargets > 100) {
      return NextResponse.json(
        { error: 'A soma dos targets não pode exceder 100%' },
        { status: 400 }
      );
    }

    // Salvar configurações no banco de dados
    await Promise.all(
      configuracoes.map(async (config: AlocacaoConfig) => {
        await prisma.alocacaoConfig.upsert({
          where: {
            userId_categoria: {
              userId: targetUserId,
              categoria: config.categoria,
            },
          },
          update: {
            minimo: config.minimo,
            maximo: config.maximo,
            target: config.target,
            descricao: config.descricao || "",
          },
          create: {
            userId: targetUserId,
            categoria: config.categoria,
            minimo: config.minimo,
            maximo: config.maximo,
            target: config.target,
            descricao: config.descricao || "",
          },
        });
      })
    );

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