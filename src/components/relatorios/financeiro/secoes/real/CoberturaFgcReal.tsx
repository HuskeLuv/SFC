import Link from 'next/link';
import type {
  AvisoFgcRelatorio,
  BlocoFgcRelatorio,
  StatusEmissorFgc,
} from '@/types/relatorioFinanceiroFgc';
import { fP } from '../../formato';
import { useFormato } from '../../FormatoProvider';
import { Callout } from '../../ui/Callout';
import { ChartBox } from '../../ui/ChartBox';
import { Progresso } from '../../ui/Progresso';
import { Tag } from '../../ui/Tag';

/** Tela com o detalhe por título e o botão de informar o emissor. */
export const LINK_COBERTURA_FGC = '/carteira?aba=analise';

/** Emissores listados; o resto vira uma linha de resumo. */
export const MAX_EMISSORES_FGC = 6;

export const TOM_FGC: Record<StatusEmissorFgc, 'good' | 'warn' | 'bad'> = {
  dentro: 'good',
  atencao: 'warn',
  acima: 'bad',
};

export const ROTULO_FGC: Record<StatusEmissorFgc, string> = {
  dentro: 'Dentro do limite',
  atencao: 'Atenção',
  acima: 'Acima do limite',
};

const titulos = (n: number) => `${n} ${n === 1 ? 'título' : 'títulos'}`;

/** 'A, B e C'. */
const juntar = (nomes: string[]) =>
  nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];

function Aviso({ aviso, fR0 }: { aviso: AvisoFgcRelatorio; fR0: (v: number) => string }) {
  if (aviso.tipo === 'conglomerado') {
    return (
      <p className="fine" data-fgc-aviso="conglomerado">
        <b>{juntar(aviso.nomes)} são do mesmo grupo financeiro:</b> para o FGC, o limite de R$ 250
        mil pode ser um só. Juntos somam {fR0(aviso.total)}
        {aviso.acima > 0 ? `, ${fR0(aviso.acima)} acima do limite` : ''}.
      </p>
    );
  }
  return (
    <p className="fine" data-fgc-aviso="emissor">
      {aviso.n === 1
        ? '1 investimento está sem o banco emissor confirmado'
        : `${aviso.n} investimentos estão sem o banco emissor confirmado`}
      . Informe o emissor em <Link href={LINK_COBERTURA_FGC}>Análises &gt; Cobertura FGC</Link> para
      o limite ficar certo.
    </p>
  );
}

/**
 * Cobertura do FGC da 4b (Advanced), porte do protótipo do Pedro: limite de R$ 250 mil por
 * banco emissor e o teto global de R$ 1 milhão. null = a carga falhou no servidor.
 */
export function CoberturaFgcReal({ fgc }: { fgc: BlocoFgcRelatorio | null }) {
  // Com o olho fechado o % sai também: % de um limite fixo (R$ 250 mil, R$ 1 milhão) revela o
  // valor. Fica só a tag de status.
  const { fR0, ocultos } = useFormato();
  if (!fgc) {
    return (
      <Callout>
        <b>Cobertura do FGC:</b> indisponível agora. Veja em{' '}
        <Link href={LINK_COBERTURA_FGC}>Análises &gt; Cobertura FGC</Link>.
      </Callout>
    );
  }
  const vazio = fgc.emissores.length === 0;
  const listados = fgc.emissores.slice(0, MAX_EMISSORES_FGC);
  const resto = fgc.emissores.slice(MAX_EMISSORES_FGC);
  return (
    <ChartBox
      titulo="Cobertura do FGC"
      sub={vazio || ocultos ? undefined : `${fP(fgc.pctTetoGlobal)} do teto global de R$ 1 milhão`}
    >
      {vazio ? (
        <p className="fine">Nenhum investimento coberto pelo FGC na carteira.</p>
      ) : (
        <div className="ind">
          {listados.map((e) => {
            const tom = TOM_FGC[e.status];
            return (
              <div key={e.chave} data-fgc-emissor="">
                <div className="dream" style={{ border: 0, padding: 0, gap: 4 }}>
                  <div className="row">
                    <span>
                      {e.nome} · {titulos(e.nTitulos)}
                    </span>
                    <b>{fR0(e.valorCoberto)}</b>
                  </div>
                  {ocultos ? null : <Progresso pct={e.pctLimite} tom={tom} />}
                  <div className="row">
                    <span>
                      {ocultos ? 'Limite de R$ 250 mil' : `${fP(e.pctLimite)} de R$ 250 mil`} por
                      emissor
                      {e.excedente > 0 ? ` · ${fR0(e.excedente)} acima` : ''}
                    </span>
                    <Tag tom={tom}>{ROTULO_FGC[e.status]}</Tag>
                  </div>
                </div>
              </div>
            );
          })}
          {resto.length > 0 ? (
            <p className="fine" style={{ margin: 0 }}>
              Mais {resto.length} {resto.length === 1 ? 'emissor' : 'emissores'}, somando{' '}
              {fR0(resto.reduce((s, e) => s + e.valorCoberto, 0))}.
            </p>
          ) : null}
        </div>
      )}
      {fgc.avisos.map((a) => (
        <Aviso key={a.tipo === 'conglomerado' ? a.nomes.join('|') : a.tipo} aviso={a} fR0={fR0} />
      ))}
      {fgc.rendaFixaSemCobertura > 0 ? (
        <p className="fine">
          {fR0(fgc.rendaFixaSemCobertura)} em renda fixa sem cobertura do FGC (CRI, CRA, debêntures
          e letras financeiras).
        </p>
      ) : null}
    </ChartBox>
  );
}
