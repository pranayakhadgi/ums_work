"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
console.log('[env] Raw values after dotenv load:', {
    TOMCAT_HOST: process.env.TOMCAT_HOST,
    TOMCAT_PORT: process.env.TOMCAT_PORT,
    TOMCAT_SCHEME: process.env.TOMCAT_SCHEME,
    TOMCAT_STATUS_URL: process.env.TOMCAT_STATUS_URL,
    USE_TEST_FILE: process.env.USE_TEST_FILE,
    NODE_ENV: process.env.NODE_ENV,
    cwd: process.cwd(),
});
// SET ENV DEFAULTS BEFORE ANY IMPORTS THAT READ THEM
if (!process.env.USE_TEST_FILE && !process.env.TOMCAT_STATUS_URL) {
    process.env.USE_TEST_FILE = 'true';
}
process.env.TOMCAT_SCHEME = process.env.TOMCAT_SCHEME || 'http';
process.env.TOMCAT_HOST = process.env.TOMCAT_HOST || 'localhost';
process.env.TOMCAT_PORT = process.env.TOMCAT_PORT || '8080';
console.log('ENV CHECK:', {
    TOMCAT_HOST: process.env.TOMCAT_HOST,
    TOMCAT_PORT: process.env.TOMCAT_PORT,
    TOMCAT_PROTOCOL: process.env.TOMCAT_PROTOCOL,
});
// NOW import everything else
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const broadcaster_1 = require("./services/broadcaster");
const monitors_1 = require("./routes/monitors");
const discovery_1 = require("./routes/discovery");
const scheduler_1 = require("./services/scheduler");
const health_1 = __importDefault(require("./routes/health"));
const jvm_1 = __importDefault(require("./routes/jvm"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const skipForMonitoring = (req) => {
    const path = req.path;
    return path.startsWith('/api/monitors') ||
        path.startsWith('/api/health') ||
        path.startsWith('/api/jvm') ||
        path.startsWith('/api/discovery');
};
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' }
});
app.use('/api/', limiter);
// Routes
app.use('/api/monitors', monitors_1.monitorsRouter);
app.use('/api/discovery', discovery_1.discoveryRouter);
app.use('/api/health', health_1.default);
app.use('/api/jvm', jvm_1.default);
app.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
    (0, scheduler_1.startScheduler)();
});
(0, broadcaster_1.initWebSocket)(server);
