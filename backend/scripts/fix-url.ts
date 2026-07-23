// backend/scripts/fix-url.ts
import 'dotenv/config';
import { db } from '../src/db/index'; // Fixed: go up one level to src
import { tomcatInstances } from '../src/db/schema'; // Fixed: go up one level to src
import { sql } from 'drizzle-orm';

async function fixManagerUrl() {
  console.log('🔍 Checking current instances...');
  const instances = await db.select().from(tomcatInstances);
  console.log('Current instances:', JSON.stringify(instances, null, 2));

  // Replace the bad URL path
  const result = await db.update(tomcatInstances)
    .set({
      managerUrl: sql`REPLACE(manager_url, '/synctl/html/list', '/synctl')`
    })
    .where(sql`manager_url LIKE '%/synctl/html/list%'`)
    .returning();

  console.log('✅ Updated instances:', JSON.stringify(result, null, 2));
  process.exit(0);
}

fixManagerUrl().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});