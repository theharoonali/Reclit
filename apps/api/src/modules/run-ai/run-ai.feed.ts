import { EventEmitter } from "node:events";
import pg from "pg";

// Framework-free: no @nestjs/* imports. The service subscribes to this feed
// and src/trpc/** imports the service, so this file is in the dashboard's
// type-only import graph — like @prisma/adapter-pg (which imports `pg` too).
//
// One dedicated Postgres connection per API process LISTENs on the channel
// the `run_ai_notify` trigger publishes to (migration
// `run_ai_status_text_and_feed`). Every writer — this API, the Trigger.dev
// worker, psql — goes through the same trigger, so this is the one signal
// for "a RunAi row changed", and it works across several API replicas. Only
// the row id travels; the service re-reads the row.

export const RUN_AI_CHANNEL = "run_ai_changed";

export type RunAiFeedNotice =
  /** A `RunAi` row was inserted or updated. */
  | { kind: "changed"; id: string }
  /** The listener reconnected; notices may have been missed meanwhile. */
  | { kind: "resync" };

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 30_000;

export class RunAiFeed {
  /** Emits `"notice"` with a `RunAiFeedNotice`. */
  readonly events = new EventEmitter();

  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private everConnected = false;
  private stopped = true;

  constructor() {
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
      throw new Error("DATABASE_URL is not set; the run-ai feed cannot listen");
    }
    const client = new pg.Client({ connectionString, keepAlive: true });
    client.on("notification", (message) => {
      if (message.channel !== RUN_AI_CHANNEL || !message.payload) return;
      this.emit({ kind: "changed", id: message.payload });
    });
    // `pg.Client` never reconnects by itself: an error ends the connection,
    // and both paths land here.
    client.on("error", (error) => {
      console.error("[run-ai feed] connection error:", error.message);
      this.onDisconnect(client);
    });
    client.on("end", () => this.onDisconnect(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${RUN_AI_CHANNEL}`);
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
          "[run-ai feed] reconnect failed:",
          error instanceof Error ? error.message : error,
        );
        this.scheduleReconnect();
      });
    }, delay);
    // A pending reconnect must not keep a shutting-down process alive.
    this.reconnectTimer.unref?.();
  }

  private emit(notice: RunAiFeedNotice) {
    this.events.emit("notice", notice);
  }
}

export const runAiFeed = new RunAiFeed();
