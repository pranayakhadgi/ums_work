import { db } from '../src/db';
import { monitors, discoveredApps, tomcatInstances } from '../src/db/schema';
import { eq, isNull, sql } from 'drizzle-orm';

async function backfill() {
  console.log('Backfilling instance_id...');

  const promoted = await db
    .select({
      id: monitors.id,
      instanceId: discoveredApps.instanceId,
    })
    .from(monitors)
    .innerJoin(discoveredApps, eq(monitors.discoveredAppId, discoveredApps.id));

  console.log(`Found ${promoted.length} promoted monitors.`);

  for (const row of promoted) {
    if (!row.instanceId) {
      console.warn(`Monitor ${row.id} has no instanceId from discoveredApps. Skipping.`);
      continue;
    }
    // Raw SQL update 
    await db.run(sql`
      UPDATE monitors
      SET instance_id = ${row.instanceId}
      WHERE id = ${row.id}
    `);
    console.log(`Updated monitor ${row.id} with instance ${row.instanceId}`);
  }

  const orphans = await db
    .select()
    .from(monitors)
    .where(isNull(monitors.instanceId));

  console.log(`Found ${orphans.length} orphaned monitors.`);

  if (orphans.length === 0) {
    console.log('No orphaned monitors.');
    process.exit(0);
  }

  const [firstInstance] = await db.select().from(tomcatInstances).limit(1);
  if (!firstInstance) {
    console.warn('No Tomcat instances exist! Orphaned monitors remain unassigned.');
    process.exit(1);
  }

  await db.run(sql`
    UPDATE monitors
    SET instance_id = ${firstInstance.id}
    WHERE instance_id IS NULL
  `);
  console.log(`Assigned ${orphans.length} orphaned monitors to instance "${firstInstance.name}".`);
  process.exit(0);
}

backfill().catch(console.error);