import { db } from '../db';
import { tomcatInstances } from '../db/schema';

// scheduler and api both need a real instance row, not a placeholder id
export async function getOrCreateDefaultInstance(): Promise<typeof tomcatInstances.$inferSelect> {
  const rows = await db.select().from(tomcatInstances).limit(1);

  if (rows.length > 0) {
    return rows[0];
  }

  const [created] = await db.insert(tomcatInstances).values({
    name: 'Default Tomcat',
    scheme: process.env.TOMCAT_SCHEME ?? 'http',
    host: process.env.TOMCAT_HOST ?? 'localhost',
    port: parseInt(process.env.TOMCAT_PORT ?? '8080'),
    managerUrl: process.env.TOMCAT_STATUS_URL ?? 'http://localhost:8080/manager/text/list',
    managerUser: process.env.TOMCAT_USER ?? 'admin',
    managerPass: process.env.TOMCAT_PASS ?? 'admin',
    environment: 'Dev',
  }).returning();

  return created;
}
