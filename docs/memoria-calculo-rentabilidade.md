# Memória de Cálculo — Gráfico de Rentabilidade Diária

> **O que este documento explica:** de onde vem cada número do gráfico de rentabilidade
> diária da seção de Análises e por que ele é calculado daquele jeito. Cobre a **linha da
> própria carteira** e as quatro linhas de comparação (**IBOV, CDI, IPCA e Poupança**).
>
> Linguagem de negócio, sem código. Última atualização: 2026-06-15.

---

## 1. O que o gráfico mostra

Todas as linhas do gráfico representam **rentabilidade acumulada em %**, começando em
**0% no primeiro dia** do período e subindo ou descendo conforme o desempenho.

- A linha da **carteira** mostra quanto o seu dinheiro rendeu (preço dos ativos + renda
  recebida), neutralizando o efeito de quando você aportou ou resgatou.
- As linhas de **IBOV, CDI, IPCA e Poupança** são réguas de comparação: "se eu tivesse
  seguido esse índice no mesmo período, teria rendido X%".

Por começarem todas em zero no mesmo dia, é possível comparar visualmente "ganhei do CDI?",
"acompanhei o IBOV?" etc.

---

## 2. A linha da carteira

### 2.1 A ideia central: retorno total, ajustado pelo tempo

A carteira é medida por **TWR (Time-Weighted Return — retorno ponderado pelo tempo)**. É a
mesma metodologia usada pelo Kinvo e pela indústria de fundos.

O TWR responde à pergunta: **"quão bem os meus investimentos performaram?"** — e não
"quanto dinheiro eu tenho a mais". A diferença importa:

- Se você aporta um valor grande **hoje** e a carteira cai amanhã, o TWR quase não se mexe,
  porque o dinheiro novo ainda não teve tempo de render.
- O TWR isola o **desempenho dos ativos** do **tamanho e do momento dos seus aportes**.

Isso é o que permite comparar de forma justa com IBOV/CDI: estamos comparando qualidade de
desempenho, não volume de aporte.

### 2.2 Como cada dia é calculado, em termos simples

Para cada dia útil da B3, o sistema calcula o **valor total da carteira** ("saldo bruto"):

```
Saldo do dia = valor de mercado dos ativos
             + caixa (dinheiro não investido)
             + proventos já recebidos (acumulados)
```

A partir daí, mede-se quanto a carteira rendeu de um dia para o outro, **descontando** o que
entrou ou saiu de dinheiro novo naquele dia (aportes e resgates). Esse rendimento diário é
encadeado dia após dia, formando a curva acumulada.

> **Por quê descontar aportes/resgates?** Porque dinheiro que você depositou não é
> "rendimento" — é capital novo. Se não descontasse, um aporte grande pareceria,
> falsamente, uma valorização enorme da carteira.

### 2.3 De onde vem cada componente

| Componente | De onde vem | Por quê |
|---|---|---|
| **Quantidade de cada ativo** | Reconstruída a partir do seu histórico de compras e vendas, já considerando **splits, grupamentos e bonificações** | Garante que a quantidade do passado esteja na mesma "escala" de hoje, senão o gráfico daria saltos artificiais na data do split |
| **Preço de mercado** | Histórico de preços de mercado (B3 / BRAPI / Yahoo, nessa ordem de prioridade), já ajustado por splits | É o valor real pelo qual o ativo era negociado naquele dia |
| **Caixa** | Aportes e resgates registrados | Representa dinheiro disponível ainda não aplicado |
| **Proventos** | Histórico de dividendos/JCP/rendimentos por ativo, com possibilidade de ajuste manual | Conta como **renda recebida** (ver 2.4) |
| **Renda fixa** | Valor corrigido pela taxa contratada (CDI, IPCA, prefixado ou PU do Tesouro) | Renda fixa não tem cotação de bolsa, então o valor é calculado pela rentabilidade contratada (ver 2.5) |

### 2.4 Como os proventos entram (ponto sensível)

Proventos (dividendos, JCP, rendimentos de FII) entram como **retorno, não como saque**:

- Eles **somam** ao desempenho da carteira (você recebeu renda).
- Eles **não** reduzem o saldo nem contam como aporte.

**Quando o provento é creditado na curva:** na **data de pagamento** (ajustada para o
próximo pregão), não na data-ex. Essa escolha é deliberada para **espelhar o Kinvo** — é o
que faz a renda acumulada bater praticamente centavo a centavo com a plataforma de
referência.

Para JCP, o valor creditado já é **líquido de IRRF** (imposto retido na fonte); dividendos
são isentos e entram cheios.

> **Reinvestimento de proventos** não é tratado como aporte novo. Se você usou um dividendo
> para comprar mais ações, isso não infla o TWR — afinal o dinheiro já estava dentro da
> carteira.

### 2.5 Renda fixa

Ativos de renda fixa (CDB, LCI/LCA, Tesouro) não têm preço de bolsa diário. O valor de cada
dia é calculado pela **rentabilidade contratada**:

- **Prefixado:** aplica a taxa anual proporcionalmente a cada dia útil.
- **Pós-fixado (% do CDI):** corrige pelo CDI do dia (taxa publicada pelo Banco Central).
- **IPCA+:** aplica a parte prefixada diariamente e incorpora o IPCA ao virar o mês.
- **Tesouro Direto:** usa o preço unitário (PU) oficial divulgado.

### 2.6 De onde o sistema lê tudo isso (rápido vs. reconstrução)

Existem **dois caminhos** para montar a série, e o resultado é o mesmo:

1. **Caminho rápido (padrão):** lê fotografias diárias já calculadas e guardadas no banco
   (atualizadas por uma rotina automática diária). É o que acontece na maioria dos acessos.
2. **Caminho de reconstrução (fallback):** quando não há fotografias suficientes (usuário
   novo, ou a rotina ainda não cobriu o período), o sistema **recalcula tudo ao vivo** a
   partir das transações, eventos, preços e proventos.

O sistema decide sozinho qual usar, e cai no fallback de forma transparente quando detecta
lacunas no histórico salvo.

---

## 3. As linhas de comparação (benchmarks)

Todas começam em 0% no mesmo dia da carteira e mostram rentabilidade acumulada, para
comparação direta.

| Benchmark | O que é | Fonte oficial | Frequência do dado original |
|---|---|---|---|
| **IBOV** | Índice da bolsa brasileira (B3) | Cotação do índice Bovespa (Yahoo Finance / BRAPI) | Diária |
| **CDI** | Referência da renda fixa pós-fixada | Banco Central (série diária) | Diária |
| **IPCA** | Inflação oficial | Banco Central (série mensal) | Mensal |
| **Poupança** | Rendimento da caderneta | Banco Central (série mensal) | Mensal |

### 3.1 Como cada um vira uma curva diária

- **IBOV:** já é um número diário. A rentabilidade é simplesmente quanto o índice subiu ou
  caiu em relação ao primeiro dia do período. Em fins de semana e feriados, repete-se o
  último valor disponível.
- **CDI:** o Banco Central publica a taxa de **cada dia**. O sistema acumula essas taxas dia
  a dia ("juros sobre juros") para formar a curva.
- **IPCA e Poupança:** o Banco Central só publica valores **mensais**. O sistema acumula mês
  a mês e **distribui de forma suave ao longo dos dias** para desenhar uma linha contínua
  (tecnicamente, interpolação **geométrica** — ver apêndice técnico no `.docx`).

> **Observação importante de interpretação:** como IPCA e Poupança são mensais "esticados"
> em linha reta, a oscilação diária dessas duas linhas **não é dado real diário** — é uma
> aproximação visual entre pontos mensais. Comparar o solavanco de um único dia da carteira
> contra o IPCA não é "maçã com maçã"; a comparação justa é de tendência ao longo de
> semanas/meses.

### 3.2 De onde o sistema lê os benchmarks

Mesma lógica de dois caminhos da carteira, para não depender de internet a cada acesso:

1. **Primeiro:** valores já calculados e guardados no banco (pré-carregados).
2. **Se faltar algum:** busca direto na fonte oficial (Banco Central para CDI/IPCA/Poupança;
   Yahoo/BRAPI para o IBOV) e guarda para os próximos acessos.

Os valores ficam em cache por até 24 horas quando os quatro benchmarks estão completos
(1 hora se algum estiver faltando), para equilibrar atualidade e desempenho.

---

## 4. Resumo de uma frase por linha

- **Carteira:** retorno total (preço dos ativos + proventos recebidos), medido por TWR para
  isolar desempenho do efeito dos aportes — proventos creditados na data de pagamento, igual
  ao Kinvo.
- **IBOV:** variação acumulada do índice da bolsa, dado diário real.
- **CDI:** juros diários do Banco Central acumulados (juros sobre juros).
- **IPCA:** inflação mensal oficial, acumulada e suavizada em linha diária.
- **Poupança:** rendimento mensal da caderneta, acumulado e suavizado em linha diária.

---

## 5. Cuidados e limitações conhecidas

- **IPCA e Poupança são mensais interpolados** — não há precisão diária nessas curvas (ver 3.1).
- **A carteira depende da qualidade dos dados de origem** — preços de mercado, datas de
  proventos e eventos corporativos (splits). Erros de cadastro nessas fontes se propagam ao
  gráfico.
- **Variações diárias muito grandes** (acima de ±50% num único dia) são tratadas como ruído
  de dado e neutralizadas, para evitar que um erro de preço pontual distorça a curva inteira.
- **Pequenas diferenças residuais vs. Kinvo** podem existir por diferenças de metodologia
  fina (ancoragem do primeiro dia, arredondamentos), mesmo com a renda acumulada batendo.
