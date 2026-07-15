"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const db_1 = require("../src/db");
const schema_1 = require("../src/db/schema");
const drizzle_orm_1 = require("drizzle-orm");
async function updateMonitorUrls() {
    console.log('Updating monitor URLs from localhost to dev-multiclientolv...');
    const result = await db_1.db.update(schema_1.monitors)
        .set({
        url: (0, drizzle_orm_1.sql) `REPLACE(url, 'http://localhost:8080', 'https://dev-multiclientolv.syncreon.com:4443')`
    })
        .where((0, drizzle_orm_1.sql) `url LIKE 'http://localhost:8080%'`);
    console.log('Update completed');
    process.exit(0);
}
updateMonitorUrls().catch(console.error);
