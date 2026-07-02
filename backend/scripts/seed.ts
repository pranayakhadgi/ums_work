import 'dotenv/config';
import { db } from '../src/db';
import { users, tomcatInstances } from '../src/db/schema';

async function seed() {
  console.log('[seed] Starting...');

  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(users).values({
      email: 'admin@company.com',
      name: 'System Admin',
      role: 'admin',
    });
    console.log('[seed] Created admin user');
  }

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

  console.log('[seed] Done');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});