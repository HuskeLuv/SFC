import { NextResponse } from 'next/server';

// Mock data para demonstração
const mockData = {
  resumo: {
    valorTotalAquisicoes: 850000.00,
    valorTotalMelhorias: 150000.00,
    valorAtualizado: 1200000.00,
    rendimento: 200000.00,
    rentabilidade: 20.00,
  },
  ativos: [
    {
      id: "casa-residencial-1",
      nome: "Casa Residencial",
      cidade: "São Paulo - SP",
      mandato: "2020-2024",
      quantidade: 1.00,
      precoAquisicao: 450000.00,
      melhorias: 80000.00,
      valorTotal: 530000.00,
      valorAtualizado: 650000.00,
      riscoPorAtivo: 15.2,
      percentualCarteira: 54.17,
      rentabilidade: 22.64,
      observacoes: "Casa de 3 quartos com garagem para 2 carros",
    },
    {
      id: "apartamento-1",
      nome: "Apartamento",
      cidade: "Rio de Janeiro - RJ",
      mandato: "2021-2025",
      quantidade: 1.00,
      precoAquisicao: 280000.00,
      melhorias: 25000.00,
      valorTotal: 305000.00,
      valorAtualizado: 380000.00,
      riscoPorAtivo: 12.8,
      percentualCarteira: 31.67,
      rentabilidade: 24.59,
      observacoes: "Apartamento de 2 quartos no centro do Rio",
    },
    {
      id: "terreno-1",
      nome: "Terreno",
      cidade: "Brasília - DF",
      mandato: "2022-2026",
      quantidade: 1.00,
      precoAquisicao: 120000.00,
      melhorias: 15000.00,
      valorTotal: 135000.00,
      valorAtualizado: 170000.00,
      riscoPorAtivo: 18.5,
      percentualCarteira: 14.17,
      rentabilidade: 25.93,
      observacoes: "Terreno de 500m² em área nobre",
    },
    {
      id: "carro-1",
      nome: "Carro",
      cidade: "São Paulo - SP",
      mandato: "2023-2027",
      quantidade: 1.00,
      precoAquisicao: 85000.00,
      melhorias: 5000.00,
      valorTotal: 90000.00,
      valorAtualizado: 75000.00,
      riscoPorAtivo: 25.0,
      percentualCarteira: 6.25,
      rentabilidade: -16.67,
      observacoes: "Honda Civic 2020 com 50.000 km",
    },
    {
      id: "joias-1",
      nome: "Joias",
      cidade: "São Paulo - SP",
      mandato: "2022-2026",
      quantidade: 1.00,
      precoAquisicao: 25000.00,
      melhorias: 0.00,
      valorTotal: 25000.00,
      valorAtualizado: 30000.00,
      riscoPorAtivo: 8.5,
      percentualCarteira: 2.50,
      rentabilidade: 20.00,
      observacoes: "Coleção de joias em ouro e diamantes",
    },
    {
      id: "moto-1",
      nome: "Moto",
      cidade: "São Paulo - SP",
      mandato: "2023-2027",
      quantidade: 1.00,
      precoAquisicao: 15000.00,
      melhorias: 2000.00,
      valorTotal: 17000.00,
      valorAtualizado: 14000.00,
      riscoPorAtivo: 22.0,
      percentualCarteira: 1.17,
      rentabilidade: -17.65,
      observacoes: "Yamaha Fazer 250 2021",
    },
    {
      id: "quadro-1",
      nome: "Quadro",
      cidade: "São Paulo - SP",
      mandato: "2021-2025",
      quantidade: 1.00,
      precoAquisicao: 8000.00,
      melhorias: 0.00,
      valorTotal: 8000.00,
      valorAtualizado: 12000.00,
      riscoPorAtivo: 5.0,
      percentualCarteira: 1.00,
      rentabilidade: 50.00,
      observacoes: "Obra de arte de artista local",
    },
    {
      id: "relogio-1",
      nome: "Relógio",
      cidade: "São Paulo - SP",
      mandato: "2022-2026",
      quantidade: 1.00,
      precoAquisicao: 12000.00,
      melhorias: 0.00,
      valorTotal: 12000.00,
      valorAtualizado: 15000.00,
      riscoPorAtivo: 3.5,
      percentualCarteira: 1.25,
      rentabilidade: 25.00,
      observacoes: "Relógio de luxo suíço",
    },
  ],
  totalGeral: {
    quantidade: 8.00,
    valorAplicado: 1000000.00,
    valorAtualizado: 1200000.00,
    risco: 13.6,
    rentabilidade: 20.00,
  },
};

export async function GET() {
  try {
    // Simula delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return NextResponse.json(mockData);
  } catch (error) {
    console.error('Erro ao buscar dados de imóveis e bens:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

