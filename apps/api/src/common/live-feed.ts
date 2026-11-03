import { EventEmitter } from "node:events";
import pg from "pg";
import { describeError } from "./errors";

// Framework-free (docs/rules/BACKEND.md hard rule 1). One dedicated Postgres
// connection per API process LISTENs on a channel that a table's
// `AFTER INSERT OR UPDATE` trigger publishes row ids to. Every writer — this
// API, the Trigger.dev worker, psql — fires the same trigger, so this is the
// one signal for "a row of that table changed" across every replica. Only the
// row id travels (NOTIFY payloads cap at 8000 bytes); the feature's `-changes`
// service re-reads the row.
//
// Extracted from the run-ai feed at the second consumer (the assistant):
// `runAiFeed` and `assistantFeed` are two instances over two channels.
//
// A LISTEN connection is idle by nature, and an idle TCP connection can die
// without either end hearing about it (a router dropping its NAT entry, a
// changed IPv6 address, a sleeping laptop). The database still lists the
// session, the socket still reads "established", and notices simply stop —
// every stream stays open, pings keep arriving, and nothing ever changes.
// So the connection is asked a question on a timer; one that is not answered
// in time is torn down and replaced, which ends in a `resync`.

export type LiveFeedNotice =
  /** A row was inserted or updated. */
  | { kind: "changed"; id: string }
  /** The listener reconnected; notices may have been missed meanwhile. */
  | { kind: "resync" };

export type LiveFeedOptions = {
  /** Where to connect; read on every (re)connect. Defaults to `DATABASE_URL`. */
  url?: () => string | undefined;
  /** How often the idle connection is asked to answer. */
  heartbeatMs?: number;
  /** How long an answer may take before the connection is declared dead. */
  heartbeatTimeoutMs?: number;
};

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 30_000;
/** Worst case a dead connection goes unnoticed: both of these added up. */
const HEARTBEAT_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 10_000;
/** The OS default (two hours on Windows) is no use for an idle LISTEN. */
const KEEPALIVE_DELAY_MS = 10_000;

/** `work`, or a rejection once `ms` have passed — whichever comes first. */
function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} did not answer within ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

export class LiveFeed {
  /** Emits `"notice"` with a `LiveFeedNotice`. */
  readonly events = new EventEmitter();

  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private probing = false;
  private attempt = 0;
  private everConnected = false;
  private stopped = true;
  private readonly url: () => string | undefined;
  private readonly heartbeatMs: number;
  private readonly heartbeatTimeoutMs: number;

  /**
   * @param channel the `pg_notify` channel the table's trigger publishes to
   * @param label what log lines call this feed ("run-ai", "assistant")
   */
  constructor(
    readonly channel: string,
    private readonly label: string,
    options: LiveFeedOptions = {},
  ) {
    this.url = options.url ?? (() => process.env.DATABASE_URL);
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    // Every open subscription is a listener; the default cap of ten only
    // exists to catch leaks, and these are released on disconnect.
    this.events.setMaxListeners(0);
  }

  /**
   * Connects and LISTENs, once. Safe to call from every subscription: an
   * open connection resolves immediately and a connection in progress is
   * shared. The first failure surfaces to the caller (a misconfigured
   * `DATABASE_URL` must not spin forever); drops after that reconnect on
   * their own with backoff.
   */
  ensureStarted(): Promise<void> {
    this.stopped = false;
    if (this.client) return Promise.resolve();
    if (!this.connecting) {
      this.connecting = this.connect().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => {});
  }

  private async connect(): Promise<void> {
    const connectionString = this.url();
    if (!connectionString) {
      throw new Error(
        `DATABASE_URL is not set; the ${this.label} feed cannot listen`,
      );
    }
    const client = new pg.Client({
      connectionString,
      keepAlive: true,
      keepAliveInitialDelayMillis: KEEPALIVE_DELAY_MS,
      // Without this a connect that never completes would hold every
      // subscriber at `ensureStarted()` for good.
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    client.on("notification", (message) => {
      if (message.channel !== this.channel || !message.payload) return;
      this.emit({ kind: "changed", id: message.payload });
    });
    // `pg.Client` never reconnects by itself: an error ends the connection,
    // and both paths land here.
    client.on("error", (error) => {
      console.error(`[${this.label} feed] connection error:`, error.message);
      this.onDisconnect(client);
    });
    client.on("end", () => this.onDisconnect(client));

    try {
      await client.connect();
      await within(
        client.query(`LISTEN ${this.channel}`),
        CONNECT_TIMEOUT_MS,
        "LISTEN",
      );
    } catch (error) {
      this.destroy(client);
      throw error;
    }

    this.client = client;
    this.attempt = 0;
    this.startHeartbeat(client);
    // A reconnect may have missed notices; subscribers catch up on what they
    // missed and re-send their snapshot, so the dashboard never shows a stale
    // working run.
    if (this.everConnected) this.emit({ kind: "resync" });
    this.everConnected = true;
  }

  private onDisconnect(client: pg.Client) {
    // `stop()` and a superseded connection both leave `this.client` pointing
    // elsewhere; only the live connection dropping schedules a reconnect.
    if (this.client !== client) return;
    this.client = null;
    this.stopHeartbeat();
    this.scheduleReconnect();
  }

  private startHeartbeat(client: pg.Client) {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      void this.probe(client);
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.probing = false;
  }

  /**
   * Asks the connection a question. An answer proves both directions of the
   * socket work, which a LISTEN that merely sits there never can; silence
   * means the notices have stopped too, so the connection is replaced.
   */
  private async probe(client: pg.Client): Promise<void> {
    if (this.client !== client || this.probing) return;
    this.probing = true;
    try {
      await within(client.query("SELECT 1"), this.heartbeatTimeoutMs, "ping");
    } catch (error) {
      if (this.client !== client) return;
      console.error(
        `[${this.label} feed] connection stopped answering, reconnecting:`,
        describeError(error).message,
      );
      this.onDisconnect(client);
      this.destroy(client);
    } finally {
      if (this.client === client) this.probing = false;
    }
  }

  /**
   * Closes a connection that may be dead. A graceful `end()` waits for the
   * server to answer, which a dead socket never does, so the socket is also
   * destroyed outright; `pg` then reports `end` for a client nobody tracks.
   */
  private destroy(client: pg.Client) {
    client.end().catch(() => {});
    (
      client as unknown as { connection?: { stream?: { destroy(): void } } }
    ).connection?.stream?.destroy();
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureStarted().catch((error: unknown) => {
        console.error(
          `[${this.label} feed] reconnect failed:`,
          describeError(error).message,
        );
        this.scheduleReconnect();
      });
    }, delay);
    // A pending reconnect must not keep a shutting-down process alive.
    this.reconnectTimer.unref?.();
  }

  private emit(notice: LiveFeedNotice) {
    this.events.emit("notice", notice);
  }
}
