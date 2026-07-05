/**
 * Cliente TCP (Telnet) para a API SOCKET da Cedro Crystal.
 *
 * Protocolo (ver "API SOCKET - BASIC 1.pdf"):
 *  - TCP texto, porta 81, mensagens em pares ":<indice>:<valor>" e terminadores
 *    variáveis por comando ("!" / "E" / "END").
 *  - Handshake: após conectar, enviar 3 parâmetros — Software Key (vazio = [ENTER]),
 *    Username, Password — e aguardar "You are connected".
 *
 * Uso fora do request do Next (worker/CLI). connect → auth → comando → ler até
 * terminador → desconectar. Não cabe em serverless por ser conexão persistente.
 */
import net from 'node:net';

export interface CedroConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  softwareKey?: string;
  /** Timeout por comando (ms). */
  commandTimeoutMs?: number;
  /** Loga tráfego cru no stderr. */
  debug?: boolean;
}

/** Erro de protocolo Cedro (E:1 .. E:19). */
export class CedroError extends Error {
  constructor(
    public code: number,
    public raw: string,
  ) {
    super(`Cedro E:${code} — ${raw.trim()}`);
    this.name = 'CedroError';
  }
}

const ERROR_RE = /(?:^|\n)\s*E:(\d{1,2})\b([^\n]*)/;

export class CedroClient {
  private socket: net.Socket | null = null;
  private buffer = '';
  private pending: {
    isDone: (buf: string) => boolean;
    resolve: (raw: string) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  constructor(private cfg: CedroConfig) {}

  private log(...args: unknown[]) {
    if (this.cfg.debug) console.error('[cedro]', ...args);
  }

  /** Conecta e autentica. Resolve quando recebe "You are connected". */
  connect(): Promise<void> {
    const { host, port, user, pass } = this.cfg;
    const softwareKey = this.cfg.softwareKey ?? '';
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        this.log(`conectado em ${host}:${port}`);
      });
      socket.setEncoding('latin1'); // Cedro usa ISO-8859-1 nos textos
      this.socket = socket;

      let sentKey = false;
      let sentUser = false;
      let sentPass = false;
      let authed = false;

      const authTimer = setTimeout(() => {
        if (!authed)
          reject(
            new Error(
              `timeout no handshake (sem "You are connected"). Buffer:\n${this.buffer.slice(0, 500)}`,
            ),
          );
      }, 20_000);

      const sendKey = () => {
        if (sentKey) return;
        this.write(softwareKey);
        sentKey = true;
        // Fallbacks por tempo: o servidor às vezes não ecoa prompts.
        setTimeout(sendUser, 600);
      };
      const sendUser = () => {
        if (sentUser) return;
        this.write(user);
        sentUser = true;
        setTimeout(sendPass, 600);
      };
      const sendPass = () => {
        if (sentPass) return;
        this.write(pass);
        sentPass = true;
      };

      // O servidor envia "Connecting..." e fica em silêncio aguardando a
      // Software Key. Disparamos a key e deixamos os prompts/timers seguirem.
      const kickoff = setTimeout(sendKey, 400);

      const onData = (chunk: string) => {
        this.log('<<', JSON.stringify(chunk));
        if (!authed) {
          const b = (this.buffer += chunk);
          if (!sentKey && /connecting|welcome|crystal|software\s*key|username/i.test(b)) {
            clearTimeout(kickoff);
            sendKey();
          }
          if (sentKey && !sentUser && /username/i.test(b)) sendUser();
          if (sentUser && !sentPass && /password/i.test(b)) sendPass();
          if (/you are connected/i.test(b)) {
            authed = true;
            clearTimeout(authTimer);
            clearTimeout(kickoff);
            this.buffer = '';
            this.log('autenticado');
            resolve();
          }
          const err = ERROR_RE.exec(b);
          if (err) {
            clearTimeout(authTimer);
            clearTimeout(kickoff);
            reject(new CedroError(Number(err[1]), err[0]));
          }
          return;
        }
        this.buffer += chunk;
        this.tryResolve();
      };

      socket.on('data', onData);
      socket.on('error', (err) => {
        clearTimeout(authTimer);
        if (this.pending) {
          clearTimeout(this.pending.timer);
          this.pending.reject(err);
          this.pending = null;
        }
        reject(err);
      });
      socket.on('close', () => this.log('conexão fechada'));
    });
  }

  private write(line: string) {
    this.log('>>', JSON.stringify(line));
    this.socket?.write(line + '\r\n', 'latin1');
  }

  private tryResolve() {
    if (!this.pending) return;
    // ERROR_RE exige "E:<dígitos>" — não colide com terminadores ":E" (GCH/MQC).
    const err = ERROR_RE.exec(this.buffer);
    if (err) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new CedroError(Number(err[1]), err[0]));
      this.pending = null;
      return;
    }
    if (this.pending.isDone(this.buffer)) {
      clearTimeout(this.pending.timer);
      const raw = this.buffer;
      this.pending.resolve(raw);
      this.pending = null;
    }
  }

  /**
   * Envia um comando e coleta a resposta até `isDone(buffer)` retornar true.
   * Reseta o buffer antes de enviar (assume uso serial — um comando por vez).
   */
  sendCommand(cmd: string, isDone: (buf: string) => boolean): Promise<string> {
    if (!this.socket) throw new Error('socket não conectado');
    if (this.pending) throw new Error('comando anterior ainda pendente (uso serial apenas)');
    const timeoutMs = this.cfg.commandTimeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      this.buffer = '';
      const timer = setTimeout(() => {
        const partial = this.buffer;
        this.pending = null;
        reject(
          new Error(
            `timeout (${timeoutMs}ms) no comando "${cmd}". Parcial recebido (${partial.length} bytes):\n${partial.slice(0, 2000)}`,
          ),
        );
      }, timeoutMs);
      this.pending = { isDone, resolve, reject, timer };
      this.write(cmd);
    });
  }

  /** Terminadores prontos por tipo de comando. */
  static doneOn = {
    /** SQT snapshot termina em "!". */
    bang: (buf: string) => buf.includes('!'),
    /** GCH/MQC terminam numa linha terminada em ":E". */
    colonE: (buf: string) => /:E\s*$/.test(buf.trimEnd()) || /\nE\s*$/.test(buf.trimEnd()),
    /** GP termina em "END". */
    end: (buf: string) => /(?:^|\n|:)END\s*$/.test(buf.trimEnd()),
  };

  async quit(): Promise<void> {
    try {
      this.socket?.write('QUIT\r\n', 'latin1');
    } catch {
      /* noop */
    }
    this.socket?.end();
    this.socket?.destroy();
    this.socket = null;
  }
}
