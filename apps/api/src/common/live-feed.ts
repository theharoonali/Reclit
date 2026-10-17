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

export type LiveFeedNotice =
  /** A row was inserted or updated. */
  | { kind: "changed"; id: string }
  /** The listener reconnected; notices may have been missed meanwhile. */
  | { kind: "resync" };

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 30_000;

export class LiveFeed {
  /** Emits `"notice"` with a `LiveFeedNotice`. */
  readonly events = new EventEmitter();

  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private everConnected = false;
  private stopped = true;

  /**
   * @param channel the `pg_notify` channel the table's trigger publishes to
   * @param label what log lines call this feed ("run-ai", "assistant")
   */
  constructor(
    readonly channel: string,
    private readonly label: string,
  ) {
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
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => {});
  }

  private async connect(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        `DATABASE_URL is not set; the ${this.label} feed cannot listen`,
      );
    }
    const client = new pg.Client({ connectionString, keepAlive: true });
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
      await client.query(`LISTEN ${this.channel}`);
    } catch (error) {
      client.end().catch(() => {});
      throw error;
    }

    this.client = client;
    this.attempt = 0;
    // A reconnect may have missed notices; subscribers re-send their
    // snapshot so the dashboard never shows a stale working run.
    if (this.everConnected) this.emit({ kind: "resync" });
    this.everConnected = true;
  }

  private onDisconnect(client: pg.Client) {
    // `stop()` and a superseded connection both leave `this.client` pointing
    // elsewhere; only the live connection dropping schedules a reconnect.
    if (this.client !== client) return;
    this.client = null;
    this.scheduleReconnect();
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
