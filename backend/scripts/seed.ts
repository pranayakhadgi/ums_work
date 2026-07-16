// DEMO ONLY — synthetic seed data for development and presentation environments
import 'dotenv/config';
import { db } from '../src/db';
import { users, tomcatInstances, monitors, checkResults } from '../src/db/schema';
import { desc } from 'drizzle-orm';

const WINDOW_MINUTES = 30;
/** Re-seed if the newest check is older than this (i.e. the window has aged out). */
const STALE_THRESHOLD_MS = (WINDOW_MINUTES + 5) * 60_000; // 35 min

async function seed() {
  console.log('[seed] Starting...');

  // ── Users ─────────────────────────────────────────────────────────────────
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(users).values({
      email: 'admin@company.com',
      name: 'System Admin',
      role: 'admin',
    });
    console.log('[seed] Created admin user');
  }

  // ── Tomcat instance ───────────────────────────────────────────────────────
  const existingInstances = await db.select().from(tomcatInstances).limit(1);
  if (existingInstances.length === 0) {
    await db.insert(tomcatInstances).values({
      name: 'Default Tomcat Instance',
      scheme: process.env.TOMCAT_SCHEME ?? 'http',
      host: process.env.TOMCAT_HOST ?? 'localhost',
      port: parseInt(process.env.TOMCAT_PORT ?? '8080'),
      managerUrl: process.env.TOMCAT_STATUS_URL ?? 'http://localhost:8080/manager/text/list',
      managerUser: process.env.TOMCAT_USER ?? 'admin',
      managerPass: process.env.TOMCAT_PASS ?? 'admin',
      environment: 'Dev',
    });
    console.log('[seed] Created default Tomcat instance');
  }

  // ── Synthetic check history ───────────────────────────────────────────────
  // Regenerate if:
  //   (a) check_results is empty, OR
  //   (b) the newest check is older than STALE_THRESHOLD_MS (window has aged out)
  //
  // If real checks are arriving (newest check is recent), needsSeed stays false
  // and we never touch live data.
  const [newestRow] = await db
    .select({ checkedAt: checkResults.checkedAt })
    .from(checkResults)
    .orderBy(desc(checkResults.checkedAt))
    .limit(1);

  const newestMs = newestRow ? new Date(newestRow.checkedAt).getTime() : 0;
  const needsSeed = !newestRow || Date.now() - newestMs > STALE_THRESHOLD_MS;

  if (!needsSeed) {
    console.log('[seed] check_results up-to-date — skipping synthetic data');
    console.log('[seed] Done');
    process.exit(0);
    return;
  }

  if (newestRow) {
    // Stale: delete old synthetic rows and regenerate relative to NOW
    await db.delete(checkResults);
    console.log('[seed] Stale window cleared — regenerating rolling demo data...');
  } else {
    console.log('[seed] No check history — generating synthetic demo data...');
  }

  let monitorRows = await db.select({ id: monitors.id }).from(monitors);

  if (monitorRows.length > 0) {
    const monitorIds = monitorRows.map((r) => r.id);
    const now = Date.now(); // rolling — always relative to the moment seed runs

    type CheckInsert = {
      monitorId: string;
      status: 'UP' | 'DOWN';
      responseTimeMs: number;
      errorCategory: string | null;
      checkedAt: Date;
    };
    const rows: CheckInsert[] = [];

    for (let minAgo = WINDOW_MINUTES - 1; minAgo >= 0; minAgo--) {
      const checkedAt = new Date(now - minAgo * 60_000);
      // minFromStart: 0 = oldest end of window, 29 = newest (just now)
      const minFromStart = WINDOW_MINUTES - 1 - minAgo;

      let scenario: 'stable' | 'degraded' | 'spike' | 'recovery';
      if (minFromStart >= 26 && minFromStart <= 28)      scenario = 'spike';
      else if (minFromStart >= 21 && minFromStart <= 25) scenario = 'degraded';
      else if (minFromStart >= 29)                       scenario = 'recovery';
      else                                               scenario = 'stable';

      for (let i = 0; i < monitorIds.length; i++) {
        const monitorId = monitorIds[i];
        let status: 'UP' | 'DOWN' = 'UP';
        let responseTimeMs = 30 + Math.round(Math.random() * 30); // 30–60 ms
        let errorCategory: string | null = null;

        if (scenario === 'degraded' && i >= 3) {
          // Monitors at index 3 and 4 degrade (2 of 5)
          responseTimeMs = 800 + Math.round(Math.random() * 700); // 800–1500 ms
          errorCategory = 'TIMEOUT';
        } else if (scenario === 'spike' && i >= 2) {
          // Monitors at index 2, 3, 4 go down (3 of 5)
          status = 'DOWN';
          responseTimeMs = 5000 + Math.round(Math.random() * 1000); // 5000–6000 ms
          errorCategory = 'REFUSED';
        } else if (scenario === 'recovery') {
          responseTimeMs = 40 + Math.round(Math.random() * 40); // 40–80 ms
        }

        rows.push({ monitorId, status, responseTimeMs, errorCategory, checkedAt });
      }
    }

    // Batch insert — stay within SQLite parameter limits (max ~999/statement)
    const BATCH = 100;
    for (let offset = 0; offset < rows.length; offset += BATCH) {
      await db.insert(checkResults).values(rows.slice(offset, offset + BATCH));
    }

    console.log(`[seed] Inserted ${rows.length} synthetic rows (${WINDOW_MINUTES} min × ${monitorIds.length} monitors)`);
    console.log('[seed] Pattern: stable (0–20) → degraded (21–25) → spike (26–28) → recovery (29)');
  } else {
    console.log('[seed] No monitors found, skipping synthetic history generation');
  }

  console.log('[seed] Done');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
