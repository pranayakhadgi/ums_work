import 'dotenv/config';
import { db } from '../src/db';
import { monitors } from '../src/db/schema';
import { sql } from 'drizzle-orm';

async function updateMonitorUrls() {
  console.log('Updating monitor URLs from localhost to dev-multiclientolv...');
  
  const result = await db.update(monitors)
    .set({
      url: sql`REPLACE(url, 'http://localhost:8080', 'https://dev-multiclientolv.syncreon.com:4443')`
    })
    .where(sql`url LIKE 'http://localhost:8080%'`);
  
  console.log('Update completed');
  process.exit(0);
}

updateMonitorUrls().catch(console.error);
