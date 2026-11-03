/**
 * Pesquisa de satisfação (CSAT) no app logado — regras de exibição (ClickUp 86e3vmyv7).
 *
 * Função pura (sem Prisma/relógio): a rota monta os fatos e decide aqui. Regras:
 *  - nunca com consultor agindo por cliente (impersonation) nem para admin;
 *  - só cliente ativo: cadastro há ≥ 14 dias e acesso nos últimos 30 (no app, a própria sessão
 *    autenticada conta como acesso; o parâmetro existe para o disparo por e-mail futuro);
 *  - no máximo 1 resposta por mês (30 dias); quem deu nota 5 (promotor) só a cada 2 meses (60 dias);
 *  - "Agora não" adia 7 dias; depois de 3 "Agora não" seguidos (sem resposta entre eles) a próxima
 *    pergunta só vem 30 dias depois do último, para não virar lembrete semanal.
 *
 * Contas de seed/e2e (@finapp.local) nunca veem o cartão: no CI elas já cairiam na carência de 14
 * dias (o banco é recriado a cada job), mas no banco de dev local o demo envelhece; assim os
 * snapshots do e2e não mudam em nenhum ambiente.
 */

export const CSAT_DIAS_CADASTRO_MIN = 14;
export const CSAT_DIAS_ACESSO_MAX = 30;
export const CSAT_DIAS_ENTRE_PERGUNTAS = 30;
export const CSAT_DIAS_ENTRE_PERGUNTAS_PROMOTOR = 60;
export const CSAT_DIAS_ADIAMENTO = 7;
export const CSAT_MAX_ADIAMENTOS_SEGUIDOS = 3;
export const CSAT_NOTA_PROMOTOR = 5;
export const CSAT_COMENTARIO_MAX = 1000;

/** Domínio das contas de seed/e2e (prisma/seed*.ts). */
export const CSAT_DOMINIO_CONTAS_TESTE = '@finapp.local';

const DIA_MS = 86_400_000;

/** Um evento gravado em csat_respostas: nota 1–5 = resposta; nota null = "Agora não". */
export interface CsatEvento {
  nota: number | null;
  createdAt: Date;
}

export interface CsatFatos {
  agora: Date;
  role: string;
  email: string;
  /** consultor agindo por um cliente */
  personificando: boolean;
  cadastradoEm: Date;
  ultimoAcesso: Date | null;
  /** eventos do usuário, em qualquer ordem (basta os mais recentes, ex.: últimos 10) */
  eventos: CsatEvento[];
}

export type CsatMotivo =
  | 'elegivel'
  | 'personificacao'
  | 'admin'
  | 'conta_teste'
  | 'cadastro_recente'
  | 'sem_acesso_recente'
  | 'respondeu_recentemente'
  | 'adiado';

export interface CsatDecisao {
  mostrar: boolean;
  motivo: CsatMotivo;
  /** a partir de quando volta a ser elegível (só para respondeu_recentemente / adiado) */
  proximaEm?: Date;
}

const somaDias = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

export function avaliarExibicaoCsat(f: CsatFatos): CsatDecisao {
  if (f.personificando) return { mostrar: false, motivo: 'personificacao' };
  if (f.role === 'admin') return { mostrar: false, motivo: 'admin' };
  if (f.email.toLowerCase().endsWith(CSAT_DOMINIO_CONTAS_TESTE)) {
    return { mostrar: false, motivo: 'conta_teste' };
  }

  if (f.agora.getTime() - f.cadastradoEm.getTime() < CSAT_DIAS_CADASTRO_MIN * DIA_MS) {
    return { mostrar: false, motivo: 'cadastro_recente' };
  }
  if (
    !f.ultimoAcesso ||
    f.agora.getTime() - f.ultimoAcesso.getTime() > CSAT_DIAS_ACESSO_MAX * DIA_MS
  ) {
    return { mostrar: false, motivo: 'sem_acesso_recente' };
  }

  const eventos = [...f.eventos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const ultimaResposta = eventos.find((e) => e.nota !== null);
  if (ultimaResposta) {
    const intervalo =
      ultimaResposta.nota === CSAT_NOTA_PROMOTOR
        ? CSAT_DIAS_ENTRE_PERGUNTAS_PROMOTOR
        : CSAT_DIAS_ENTRE_PERGUNTAS;
    const proximaEm = somaDias(ultimaResposta.createdAt, intervalo);
    if (f.agora < proximaEm) return { mostrar: false, motivo: 'respondeu_recentemente', proximaEm };
  }

  // "Agora não" depois da última resposta (ou desde sempre, se nunca respondeu).
  const adiamentos = eventos.filter(
    (e) => e.nota === null && (!ultimaResposta || e.createdAt > ultimaResposta.createdAt),
  );
  const ultimoAdiamento = adiamentos[0];
  if (ultimoAdiamento) {
    const dias =
      adiamentos.length >= CSAT_MAX_ADIAMENTOS_SEGUIDOS
        ? CSAT_DIAS_ENTRE_PERGUNTAS
        : CSAT_DIAS_ADIAMENTO;
    const proximaEm = somaDias(ultimoAdiamento.createdAt, dias);
    if (f.agora < proximaEm) return { mostrar: false, motivo: 'adiado', proximaEm };
  }

  return { mostrar: true, motivo: 'elegivel' };
}
