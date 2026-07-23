import 'dotenv/config';
import { db } from '../src/db';
import { tomcatInstances } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { normalizeManagerUrl } from '../src/utils/url';
import { tomcatFetch } from '../src/services/tomcatScraper';

async function fixInstanceUrls() {
  console.log('Fixing manager URLs for existing instances...');
  const instances = await db.select().from(tomcatInstances);

  for (const inst of instances) {
    try {
      const normalized = normalizeManagerUrl(inst.managerUrl);
      const tempInstance = { ...inst, managerUrl: normalized };
      await tomcatFetch('/text/list', tempInstance, 1);

      if (normalized !== inst.managerUrl) {
        await db.update(tomcatInstances)
          .set({ managerUrl: normalized })
          .where(eq(tomcatInstances.id, inst.id));
        console.log(`Fixed URL for ${inst.name}: ${normalized}`);
      } else {
        console.log(`No change needed for ${inst.name}`);
      }
    } catch (err: any) {
      console.error(`Failed to validate/fix ${inst.name} (${inst.managerUrl}):`, err.message);
    }
  }

  console.log('Backfill complete.');
  process.exit(0);
}

fixInstanceUrls().catch(console.error);
