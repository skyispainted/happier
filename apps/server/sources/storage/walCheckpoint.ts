import { db } from "@/storage/db";
import { getDbProviderFromEnv } from "@/storage/prisma";
import { delay } from "@/utils/runtime/delay";
import { forever } from "@/utils/runtime/forever";
import { shutdownSignal } from "@/utils/process/shutdown";
import { log } from "@/utils/logging/log";
import { parseIntEnv } from "@/config/env";

const DEFAULT_WAL_CHECKPOINT_INTERVAL_MS = 60 * 1000;

export function startWalCheckpoint(): void {
    const provider = getDbProviderFromEnv(process.env, "postgres");
    if (provider !== "sqlite") return;

    const intervalMs = parseIntEnv(
        process.env.HAPPIER_SQLITE_WAL_CHECKPOINT_INTERVAL_MS,
        DEFAULT_WAL_CHECKPOINT_INTERVAL_MS,
        { min: 30_000, max: 60 * 60_000 },
    );

    forever("sqlite-wal-checkpoint", async () => {
        while (true) {
            try {
                // Use RESTART which waits for readers to finish, unlike PASSIVE.
                // This is safe because we only run it periodically — brief blocking is acceptable
                // for a light server with few concurrent users.
                const result = await db.$queryRawUnsafe<Array<{ busy: bigint; log: bigint; checkpointed: bigint }>>(
                    "PRAGMA wal_checkpoint(RESTART);",
                );
                if (result[0]?.busy && result[0].busy > 0n) {
                    // busy=1 means a reader blocked the checkpoint — will retry next tick.
                } else if (result[0]?.checkpointed && result[0].checkpointed > 0n) {
                    log(
                        { module: "sqlite-wal-checkpoint" },
                        `WAL checkpoint: ${result[0].checkpointed} pages flushed`,
                    );
                }
            } catch (err) {
                log(
                    { module: "sqlite-wal-checkpoint", level: "warn" },
                    `WAL checkpoint failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

            await delay(intervalMs, shutdownSignal);
        }
    });
}
