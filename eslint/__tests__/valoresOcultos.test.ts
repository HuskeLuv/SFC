import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
// @ts-expect-error módulo .mjs sem tipos (plugin local de lint)
import { pluginValoresOcultos } from '../valoresOcultos.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const regra = pluginValoresOcultos.rules['valor-sem-sensivel'];
const valor = [{ messageId: 'valor' }];

tester.run('mf/valor-sem-sensivel', regra, {
  valid: [
    'const a = <Sensivel>{formatBRL(v)}</Sensivel>;',
    'const a = <Sensivel curto>{x ? formatBRL(v) : "-"}</Sensivel>;',
    'const a = <p><ValorVisivel>{formatBRL(cotacao)}</ValorVisivel></p>;',
    'const a = <TextoSensivel texto={`Total ${formatBRL(v)}`} />;',
    'const a = <p>{mascarar(formatBRL(v))}</p>;',
    'const a = <p>{renderSensivel(formatBRL(v), "sensivel")}</p>;',
    // Props que não são texto renderizado aqui (formulários visíveis, componentes que detectam R$).
    'const a = <input value={formatBRL(v)} />;',
    'const a = <MetricCard value={formatBRL(v)} />;',
    'const a = <Foo onClick={() => toast(formatBRL(v))} />;',
    // Fora do JSX (render/getValue/cell): coberto pela autodetecção e pelos testes.
    'const col = { render: (r) => formatBRL(r.v) };',
    'const s = formatBRL(v);',
    // toLocaleString sem objeto de opções e format de algo que não é *Formatter.
    'const a = <p>{d.toLocaleString("pt-BR")}</p>;',
    'const a = <p>{dateFns.format(d, "MM/yyyy")}</p>;',
  ],
  invalid: [
    { code: 'const a = <p>{formatBRL(v)}</p>;', errors: valor },
    { code: 'const a = <p>{x ? formatBRL(v) : "-"}</p>;', errors: valor },
    { code: 'const a = <p>{x && formatCurrency(v)}</p>;', errors: valor },
    { code: 'const a = <p>{`${formatBRL(v)} hoje`}</p>;', errors: valor },
    { code: 'const a = <p>{formatarMoeda(v)}</p>;', errors: valor },
    { code: 'const a = <p>{f.formatCurrency(v)}</p>;', errors: valor },
    { code: 'const a = <p>{currencyFormatter.format(v)}</p>;', errors: valor },
    { code: 'const a = <p>{formatBRLCompact(v)}</p>;', errors: valor },
    { code: 'const a = <span title={formatBRL(v)}>x</span>;', errors: valor },
    { code: 'const a = <span aria-label={`Saldo ${formatBRL(v)}`}>x</span>;', errors: valor },
    {
      code: 'const a = <p>{v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>;',
      errors: [{ messageId: 'conferir' }],
    },
    // Dentro de uma prop de render, o texto do <td> continua acusado.
    { code: 'const a = <Lista render={(i) => <td>{formatBRL(i)}</td>} />;', errors: valor },
    // Sensivel em volta de OUTRO trecho não protege este.
    {
      code: 'const a = <p><Sensivel>{formatBRL(a)}</Sensivel>{formatBRL(b)}</p>;',
      errors: valor,
    },
  ],
});
