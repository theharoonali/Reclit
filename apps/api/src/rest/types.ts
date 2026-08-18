import type { Session } from "@api/utils/auth";
import type { Database } from "@repo/db/client";

export type Context = {
  Variables: {
    db: Database;
    session: Session;
    clientIp?: string;
  };
};
