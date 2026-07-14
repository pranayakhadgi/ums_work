import { eq } from 'drizzle-orm';
import { db } from '../db';
import { tomcatInstances } from '../db/schema';

// scheduler and api both need a real instance row, not a placeholder id
export async function getOrCreateDefaultInstance(): Promise<typeof tomcatInstances.$inferSelect> {
  const rows = await db.select().from(tomcatInstances).limit(1);
  
  const scheme = process.env.TOMCAT_SCHEME ?? 'http';
  const host = process.env.TOMCAT_HOST ?? 'localhost';
  const port = parseInt(process.env.TOMCAT_PORT ?? '8080');
  const managerUrl = process.env.TOMCAT_STATUS_URL ?? `${scheme}://${host}:${port}/manager/text/list`;
  const managerUser = process.env.TOMCAT_USER ?? 'admin';
  const managerPass = process.env.TOMCAT_PASS ?? 'admin';
  

  if (rows.length > 0) {
    const existing = rows[0];

    const needsUpdate = existing.scheme !== scheme || existing.host !== host || existing.port !== port || 
    existing.managerUrl !== managerUrl || existing.managerUser !== managerUser || existing.managerPass !== managerPass;
    
    if (needsUpdate) {
      const [updated] = await db.update(tomcatInstances).set({
        scheme,
        host,
        port,
        managerUrl,
        managerUser,
        managerPass,
      }).where(eq(tomcatInstances.id, existing.id))
      .returning();

      console.log('[instances] Synced default instance from env vars:', {
        host: updated.host,
        port: updated.port,
        scheme: updated.scheme,
      });
      
      return updated;
    }
    return existing;
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

  console.log('[instances] Created default instance:', {
    host: created.host,
    port: created.port,
  });
  

  return created;
}
