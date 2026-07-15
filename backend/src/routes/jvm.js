"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
router.get('/latest', async (req, res) => {
    try {
        const latest = await db_1.db.select().from(schema_1.jvmSnapshots)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.jvmSnapshots.collectedAt))
            .limit(5);
        res.json({ success: true, data: latest });
    }
    catch (err) {
        res.status(500).json({ success: false, error: String(err) });
    }
});
exports.default = router;
