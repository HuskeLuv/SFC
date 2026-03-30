import { useAssetData } from './useAssetData';
import { FimFiaData, FimFiaAtivo, FimFiaSecao } from '@/types/fimFia';

export const useFimFia = () => {
  const assetData = useAssetData<FimFiaData>({
    apiPath: '/api/carteira/fim-fia',
    objetivoPath: '/api/carteira/fim-fia/objetivo',
    valorAtualizadoPath: '/api/carteira/fim-fia',
    label: 'FIM/FIA',
  });

  const calculateAtivoValues = (
    ativo: Partial<FimFiaAtivo>,
    totalCarteira: number,
  ): FimFiaAtivo => {
    const valorInicial = ativo.valorInicialAplicado || 0;
    const aporte = ativo.aporte || 0;
    const resgate = ativo.resgate || 0;
    const valorAtualizado = valorInicial + aporte - resgate;
    const percentualCarteira = totalCarteira > 0 ? (valorAtualizado / totalCarteira) * 100 : 0;
    const riscoPorAtivo =
      totalCarteira > 0 ? Math.min(100, (valorAtualizado / totalCarteira) * 100) : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte =
      totalCarteira > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalCarteira : 0;
    const rentabilidade =
      valorInicial > 0 ? ((valorAtualizado - valorInicial) / valorInicial) * 100 : 0;

    return {
      id: ativo.id || '',
      nome: ativo.nome || '',
      cotizacaoResgate: ativo.cotizacaoResgate || '',
      liquidacaoResgate: ativo.liquidacaoResgate || '',
      categoriaNivel1: ativo.categoriaNivel1 || '',
      subcategoriaNivel2: ativo.subcategoriaNivel2 || '',
      valorInicialAplicado: valorInicial,
      aporte,
      resgate,
      valorAtualizado,
      percentualCarteira,
      riscoPorAtivo,
      objetivo,
      quantoFalta,
      necessidadeAporte,
      rentabilidade,
      tipo: ativo.tipo || 'fim',
      observacoes: ativo.observacoes,
    };
  };

  const calculateSecaoValues = (secao: FimFiaSecao, totalCarteira: number): FimFiaSecao => {
    const totalValorAplicado = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.valorInicialAplicado,
      0,
    );
    const totalAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const totalResgate = secao.ativos.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalValorAtualizado = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.valorAtualizado,
      0,
    );
    const totalPercentualCarteira =
      totalCarteira > 0 ? (totalValorAtualizado / totalCarteira) * 100 : 0;
    const totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.necessidadeAporte,
      0,
    );
    const rentabilidadeMedia =
      secao.ativos.length > 0
        ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length
        : 0;

    return {
      ...secao,
      totalValorAplicado,
      totalAporte,
      totalResgate,
      totalValorAtualizado,
      totalPercentualCarteira,
      totalRisco,
      totalObjetivo,
      totalQuantoFalta,
      totalNecessidadeAporte,
      rentabilidadeMedia,
    };
  };

  return {
    data: assetData.data,
    loading: assetData.loading,
    error: assetData.error,
    refetch: assetData.fetchData,
    updateObjetivo: assetData.updateObjetivo as (
      ativoId: string,
      novoObjetivo: number,
    ) => Promise<boolean>,
    updateValorAtualizado: assetData.updateValorAtualizado as (
      ativoId: string,
      novoValor: number,
    ) => Promise<boolean>,
    updateCaixaParaInvestir: assetData.updateCaixaParaInvestir,
    formatCurrency: assetData.formatCurrency,
    formatPercentage: assetData.formatPercentage,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
