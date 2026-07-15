"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const db_1 = require("../src/db");
const schema_1 = require("../src/db/schema");
async function seed() {
    console.log('[seed] Starting...');
    const existingUsers = await db_1.db.select().from(schema_1.users).limit(1);
    if (existingUsers.length === 0) {
        await db_1.db.insert(schema_1.users).values({
            email: 'admin@company.com',
            name: 'System Admin',
            role: 'admin',
        });
        console.log('[seed] Created admin user');
    }
    const existingInstances = await db_1.db.select().from(schema_1.tomcatInstances).limit(1);
    if (existingInstances.length === 0) {
        await db_1.db.insert(schema_1.tomcatInstances).values({
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
