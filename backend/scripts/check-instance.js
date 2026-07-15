"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const db_1 = require("../src/db");
const schema_1 = require("../src/db/schema");
async function checkInstance() {
    const instances = await db_1.db.select().from(schema_1.tomcatInstances);
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
