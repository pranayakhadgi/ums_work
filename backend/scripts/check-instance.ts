import 'dotenv/config';
import { db } from '../src/db';
import { tomcatInstances } from '../src/db/schema';

async function checkInstance() {
  const instances = await db.select().from(tomcatInstances);
  console.log('Current instances in DB:', JSON.stringify(instances, null, 2));
  console.log('Env vars:', {
    TOMCAT_HOST: process.env.TOMCAT_HOST,
    TOMCAT_PORT: process.env.TOMCAT_PORT,
    TOMCAT_SCHEME: process.env.TOMCAT_SCHEME,
    TOMCAT_STATUS_URL: process.env.TOMCAT_STATUS_URL,
  });
  process.exit(0);
}

checkInstance().catch(console.error);
