import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import net from "node:net";
import type { LiveFeedNotice } from "../common/live-feed";
import { LiveFeed } from "../common/live-feed";
import { pingDatabase, prisma } from "../db/prisma";

// The shared LISTEN connection behind every live stream (docs/features/
// run-ai.md "One read per change per process"). A fresh listener is the easy
// case; what bit in practice is a connection that goes silent without closing,
// so this suite stages exactly that: a TCP proxy between the feed and the
// database that can be told to stop forwarding while keeping its sockets open.
//
// Skips (rather than fails) when DATABASE_URL points nowhere.
const dbUp = await pingDatabase();

const CHANNEL = `live_feed_test_${process.pid}`;

type Link = { client: net.Socket; server: net.Socket; frozen: boolean };

/** Forwards bytes both ways; `freeze()` makes every open link a black hole. */
async function startProxy(target: { host: string; port: number }) {
  const links: Link[] = [];
  const server = net.createServer((client) => {
    const upstream = net.connect(target);
    const link: Link = { client, server: upstream, frozen: false };
    links.push(link);
    client.on("data", (chunk) => {
      if (!link.frozen) upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      if (!link.frozen) client.write(chunk);
    });
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", close).on("close", close);
    upstream.on("error", close).on("close", close);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    /** From now on the links open so far swallow everything, in both directions. */
    freeze() {
      for (const link of links) link.frozen = true;
    },
    close() {
      for (const link of links) {
        link.client.destroy();
        link.server.destroy();
      }
      server.close();
    },
  };
}

let proxy: Awaited<ReturnType<typeof startProxy>>;
let feed: LiveFeed;
const notices: LiveFeedNotice[] = [];

const notify = (payload: string) =>
  prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`;

/** Resolves once `predicate` holds for the notices so far, or fails after `ms`. */
async function until(predicate: () => boolean, ms: number, what: string) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const changedIds = () =>
  notices.flatMap((n) => (n.kind === "changed" ? [n.id] : []));

beforeAll(async () => {
  if (!dbUp) return;
  const real = new URL(process.env.DATABASE_URL ?? "");
  proxy = await startProxy({
    host: real.hostname.replace(/^\[|\]$/g, ""),
    port: Number(real.port || 5432),
  });
  const viaProxy = new URL(real);
  viaProxy.hostname = "127.0.0.1";
  viaProxy.port = String(proxy.port);
  feed = new LiveFeed(CHANNEL, "live-feed-test", {
    url: () => viaProxy.toString(),
    heartbeatMs: 150,
    heartbeatTimeoutMs: 400,
  });
  feed.events.on("notice", (notice: LiveFeedNotice) => notices.push(notice));
  await feed.ensureStarted();
});

afterAll(async () => {
  if (!dbUp) return;
  await feed.stop();
  proxy.close();
});

describe.skipIf(!dbUp)("LiveFeed", () => {
  it("delivers a notified id", async () => {
    await notify("first");
    await until(() => changedIds().includes("first"), 3000, "the first notice");
  });

  it("replaces a connection that stops answering and says `resync`", async () => {
    notices.length = 0;
    // Nothing closes: the socket stays open and simply goes quiet, the way a
    // connection does when a router forgets it.
    proxy.freeze();
    await notify("lost");
    await until(
      () => notices.some((n) => n.kind === "resync"),
      6000,
      "the feed to notice the silence and reconnect",
    );
    // The notice sent into the void is gone — which is what `resync` is for —
    // and the new connection is live.
    expect(changedIds()).not.toContain("lost");
    await notify("after");
    await until(
      () => changedIds().includes("after"),
      3000,
      "a notice on the new connection",
    );
  });
});
