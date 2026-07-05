# E-mail para a Cedro — bloqueio de login no trial

**Assunto:** Trial API SOCKET (usuário `myfinance`) — "Invalid Login" / liberação de IP

---

Olá, [nome do contato],

Estamos avaliando a API SOCKET da Cedro Crystal com as credenciais de trial que nos
foram fornecidas (usuário `myfinance`) e esbarramos num bloqueio de autenticação.

**O que funciona:**
- A conexão TCP na porta 81 é estabelecida normalmente nos dois servidores
  (`cd102.cedrotech.com` e `cd302.cedrotech.com`).
- O handshake segue o fluxo documentado: recebemos `Welcome to Cedro Crystal`, o prompt
  `Username:` e o prompt `Password:`, e enviamos os três parâmetros na ordem (Software Key
  vazia → Username → Password).

**O que falha:**
- Após enviar usuário e senha, o servidor responde **`Invalid Login.`** e encerra a
  conexão — o mesmo comportamento em `cd102` e em `cd302`.

**Informação que pode ajudar:**
- Nosso **IP público de saída** é **`200.199.187.2`**. Caso o trial seja restrito por IP,
  pedimos a liberação desse endereço.

Poderiam, por favor, verificar:
1. Se as credenciais do usuário `myfinance` estão **ativas** e se a senha está correta;
2. Se o acesso exige **liberação de IP** (e, em caso afirmativo, liberar o `200.199.187.2`);
3. Se há uma **Software Key** específica a ser informada no handshake (estamos enviando vazia).

Como a janela do trial é curta, agradeceríamos uma orientação o quanto antes para
conseguirmos concluir a avaliação técnica.

Obrigado desde já.

Atenciosamente,
[seu nome]
[empresa / cargo]
[telefone / contato]
