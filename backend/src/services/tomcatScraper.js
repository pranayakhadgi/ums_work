"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAppList = parseAppList;
exports.parseStatus = parseStatus;
exports.parseStatusText = parseStatusText;
exports.parseVminfo = parseVminfo;
exports.discoverApps = discoverApps;
exports.fetchInstanceHealth = fetchInstanceHealth;
exports.fetchJvmSnapshot = fetchJvmSnapshot;
// backend/src/services/tomcatScraper.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https_1 = require("https");
const timers_1 = require("timers");
const fast_xml_parser_1 = require("fast-xml-parser");
// env vars may be set after import in tests, so read them per call
function getEnv() {
    return {
        useTestFile: process.env.USE_TEST_FILE === 'true',
        tomcatUser: process.env.TOMCAT_USER || '',
        tomcatPass: process.env.TOMCAT_PASS || '',
        scheme: process.env.TOMCAT_SCHEME || 'https',
        host: process.env.TOMCAT_HOST || 'localhost',
        port: process.env.TOMCAT_PORT || '8443',
        managerPath: process.env.TOMCAT_MANAGER_PATH || '/synctl',
    };
}
// setting the return value with ternary default as 0 will predent the downstream math to break.
function safeInt(value, defaultValue = 0) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
}
//same logic applies to the float datatype as well
function safeFloat(value, defaultValue = 0) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
}
const httpsAgent = new https_1.Agent({ rejectUnauthorized: false });
async function tomcatFetch(pathSuffix, retries = 3) {
    const env = getEnv();
    if (env.useTestFile) {
        const fileMap = {
            '/text/list': 'test-list.txt',
            '/status?XML=true': 'test-status.txt',
            '/text/vminfo': 'test-vminfo.txt',
        };
        const fileName = fileMap[pathSuffix];
        if (!fileName)
            throw new Error(`Time out! No test file mapped for ${pathSuffix}`);
        const filePath = path.join(process.cwd(), 'test-data', fileName);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Test file not found: ${filePath}`); //can I add retryable errors here?
        }
        return fs.readFileSync(filePath, 'utf-8');
    }
    const url = `${env.scheme}://${env.host}:${env.port}${env.managerPath}${pathSuffix}`;
    const auth = Buffer.from(`${env.tomcatUser}:${env.tomcatPass}`).toString('base64'); //encryption
    let lastError;
    //setting three retries during fetch error, prevents the monitor from failing immediately
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        try {
            // Native fetch with custom agent for Node 18+
            const response = await fetch(url, {
                headers: { Authorization: `Basic ${auth}` },
                // @ts-ignore — Node 18+ fetch accepts dispatcher/agent
                // dispatcher: env.scheme === 'https' ? httpsAgent : undefined,
                signal: controller.signal,
            });
            (0, timers_1.clearTimeout)(timeoutId);
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                //a proper error log with the first 200 lines of the body that caused the error
                throw new Error(`HTTP ${response.status}: ${response.statusText} at ${url}: ${body.substring(0, 200)}`);
            }
            return await response.text();
        }
        catch (error) {
            (0, timers_1.clearTimeout)(timeoutId);
            console.error(`[tomcatFetch] Attempt ${attempt} error:`, {
                name: error.name,
                code: error.code,
                message: error.message,
                cause: error.cause?.message,
            });
            console.log("[tomcatFetch] Final URL:", url);
            console.log("[tomcatFetch] Config:", {
                host: process.env.TOMCAT_HOST,
                port: process.env.TOMCAT_PORT,
                protocol: process.env.TOMCAT_PROTOCOL,
            });
            lastError = error;
            const isRetryable = error.name === 'AbortError' ||
                error.code === 'ECONNREFUSED' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET' ||
                error.code === 'ENOTFOUND';
            if (!isRetryable || attempt === retries)
                break;
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.warn(`[tomcatFetch] Attempt ${attempt}/${retries} failed for ${url}: ${error.message}.
                Retrying in ${delay / 1000}secs...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error(`[tomcatFetch] Failed after ${retries} attempts for ${url}: ${lastError?.message}`);
}
function parseAppList(raw) {
    const lines = raw.split('\n').filter(l => l.trim());
    const apps = [];
    //prevents the header validation breakage silent failure warning the dev
    const header = lines[0]?.trim();
    if (!header?.startsWith('OK - Listed applications')) {
        console.warn('[parseAppList] Unexpected header:', header?.substring(0, 100));
    }
    for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2)
            continue; // Need at least path + state
        const contextPath = parts[0];
        const state = parts[1] || 'unknown';
        // Session count is positionally the 3rd field. If missing or unparseable, default 0.
        const sessions = parts.length > 2 ? parseInt(parts[2].trim(), 10) || 0 : 0;
        const displayName = parts.length > 3 ? parts.slice(3).join(':') : contextPath;
        apps.push({ contextPath, state, sessions, displayName });
    }
    if (apps.length === 0) {
        console.warn('[parseAppList] No applications parsed from response');
    }
    else {
        console.log(`[parseAppList] Parsed ${apps.length} applications`);
    }
    return apps;
}
function parseStatusXml(raw) {
    const parser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseAttributeValue: true,
        removeNSPrefix: true,
        isArray: (name) => name === 'connector',
    });
    let parsed;
    try {
        parsed = parser.parse(raw);
    }
    catch (err) {
        throw new Error(`Failed to parse XML: ${err instanceof Error ? err.message : String(err)}`);
    }
    const status = parsed.status;
    if (!status)
        throw new Error('XML status response is missing the <status> root element');
    const result = {
        serverInfo: { tomcatVersion: '', jvmVersion: '', osName: '', architecture: '' },
        memoryInfo: { freeMemory: 0, totalMemory: 0, maxMemory: 0 },
        connectors: [],
        raw,
    };
    const serverInfo = status.serverInfo || status;
    result.serverInfo.tomcatVersion = String(serverInfo.tomcatVersion || serverInfo['@_tomcatVersion'] || '');
    result.serverInfo.jvmVersion = String(serverInfo.jvmVersion || serverInfo['@_jvmVersion'] || '');
    result.serverInfo.osName = String(serverInfo.osName || serverInfo['@_osName'] || '');
    result.serverInfo.architecture = String(serverInfo.architecture || serverInfo['@_architecture'] || '');
    if (status.jvm?.memory) {
        const mem = status.jvm.memory;
        const attrs = mem['@_'] || mem;
        result.memoryInfo.freeMemory = safeInt(attrs.free || attrs['@_free']);
        result.memoryInfo.totalMemory = safeInt(attrs.total || attrs['@_total']);
        result.memoryInfo.maxMemory = safeInt(attrs.max || attrs['@_max']);
    }
    const connectors = status.connector;
    if (connectors) {
        const arr = Array.isArray(connectors) ? connectors : [connectors];
        for (const conn of arr) {
            const threadInfo = conn.threadInfo || {};
            const requestInfo = conn.requestInfo || {};
            const tiAttrs = threadInfo['@_'] || threadInfo;
            const riAttrs = threadInfo['@_'] || requestInfo;
            result.connectors.push({
                name: String(conn['@_name'] || conn.name || 'unknown'),
                threadInfo: {
                    maxThreads: safeInt(tiAttrs.maxThreads || tiAttrs['@_maxThreads']),
                    currentThreadCount: safeInt(tiAttrs.currentThreadCount || tiAttrs['@_maxThreads']),
                    currentThreadsBusy: safeInt(tiAttrs.currentThreadsBusy || tiAttrs['@_currentThreadCount']),
                    keepAliveCount: safeInt(tiAttrs.keepAliveCount || tiAttrs['@_keepAliveCount'] ||
                        tiAttrs.keepAliveSockets || tiAttrs['_@keepAliveSockets']),
                },
                requestInfo: {
                    maxProcessingTime: safeInt(riAttrs.maxTime || riAttrs['@_maxTime'] ||
                        riAttrs.maxProcessingTime || riAttrs['@_maxProcessingTime']),
                    processingTime: safeInt(riAttrs.processingTime || riAttrs['@_processingTime']),
                    requestCount: safeInt(riAttrs.requestCount || riAttrs['@_requestCount']),
                    errorCount: safeInt(riAttrs.errorCount || riAttrs['@_errorCount']),
                    bytesReceived: safeInt(riAttrs.bytesReceived || riAttrs['@_bytesReceived']),
                    bytesSent: safeInt(riAttrs.bytesSent || riAttrs['@_bytesSent']),
                },
            });
        }
    }
    if (result.connectors.length === 0) {
        console.warn('[parseStatusXml] No connectors found in XML status');
    }
    return result;
}
function parseStatus(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('<?xml>') || trimmed.startsWith('<status')) {
        return parseStatusXml(raw);
    }
    return parseStatusText(raw);
}
function parseStatusText(raw) {
    const lines = raw.split('\n');
    const result = {
        serverInfo: { tomcatVersion: '', jvmVersion: '', osName: '', architecture: '' },
        memoryInfo: { freeMemory: 0, totalMemory: 0, maxMemory: 0 },
        connectors: [],
        raw,
    };
    let currentSection = '';
    let currentConnector = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            currentSection = '';
            continue;
        }
        if (line.includes('Tomcat Version'))
            currentSection = 'server';
        else if (line.includes('Memory usage') || line.includes('JVM memory'))
            currentSection = 'memory';
        else if (line.includes('Thread Pools') || line.includes('Connectors'))
            currentSection = 'connector';
        else if (line.startsWith('Name:') && currentSection === 'connector') {
            if (currentConnector)
                result.connectors.push(currentConnector);
            currentConnector = {
                name: line.replace('Name:', '').trim(),
                threadInfo: { maxThreads: 0, currentThreadCount: 0, currentThreadsBusy: 0, keepAliveCount: 0 },
                requestInfo: { maxProcessingTime: 0, processingTime: 0, requestCount: 0, errorCount: 0, bytesReceived: 0, bytesSent: 0 },
            };
        }
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1)
            continue;
        const key = line.substring(0, colonIdx).trim().toLowerCase();
        const value = line.substring(colonIdx + 1).trim();
        if (key === 'tomcat version')
            result.serverInfo.tomcatVersion = value;
        else if (key === 'jvm version')
            result.serverInfo.jvmVersion = value;
        else if (key === 'os name')
            result.serverInfo.osName = value;
        else if (key === 'architecture')
            result.serverInfo.architecture = value;
        else if (key === 'free memory')
            result.memoryInfo.freeMemory = parseMemory(value);
        else if (key === 'total memory')
            result.memoryInfo.totalMemory = parseMemory(value);
        else if (key === 'max memory')
            result.memoryInfo.maxMemory = parseMemory(value);
        else if (currentConnector) {
            if (key === 'max threads')
                currentConnector.threadInfo.currentThreadCount = parseInt(value, 10);
            else if (key === 'current thread count')
                currentConnector.threadInfo.currentThreadCount = parseInt(value, 10);
            else if (key === 'current threads busy')
                currentConnector.threadInfo.currentThreadsBusy = parseInt(value, 10);
            else if (key === 'keep-alive sockets')
                currentConnector.threadInfo.keepAliveCount = parseInt(value, 10);
            else if (key === 'max processing time')
                currentConnector.requestInfo.maxProcessingTime = parseInt(value, 10);
            else if (key === 'processing time')
                currentConnector.requestInfo.processingTime = parseInt(value, 10);
            else if (key === 'request count')
                currentConnector.requestInfo.requestCount = parseInt(value, 10);
            else if (key === 'error count')
                currentConnector.requestInfo.errorCount = parseInt(value, 10);
            else if (key === 'bytes received')
                currentConnector.requestInfo.bytesReceived = parseInt(value, 10);
            else if (key === 'bytes sent')
                currentConnector.requestInfo.bytesSent = parseInt(value, 10);
        }
    }
    if (currentConnector?.name)
        result.connectors.push(currentConnector);
    return result;
}
function parseVminfo(raw) {
    const lines = raw.split('\n');
    const result = {
        runtimeInfo: { vmName: '', vmVersion: '', vmVendor: '', uptime: 0 },
        memoryPools: [],
        gcInfo: [],
        osInfo: { osName: '', osVersion: '', architecture: '', availableProcessors: 0, systemLoadAverage: 0 },
        raw,
    };
    let section = '';
    let currentPool = null;
    //header validation
    const header = lines[0]?.trim();
    if (!header?.startsWith('OK - VM info')) {
        console.warn('[parseVminfo] Unexpected header:', header?.substring(0, 100));
    }
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        // Section detection — must come before key:value parsing
        if (trimmed === 'Runtime information:') {
            section = 'runtime';
            continue;
        }
        if (trimmed === 'OS information:') {
            section = 'os';
            continue;
        }
        if (trimmed.startsWith('Memory Pool Name:')) {
            section = 'memory';
            // Flush previous pool
            if (currentPool)
                result.memoryPools.push(currentPool);
            currentPool = {
                name: trimmed.substring('Memory Pool Name:'.length).trim(),
                type: '', used: 0, committed: 0, max: 0
            };
            continue;
        }
        if (trimmed.startsWith('Garbage Collector Name:')) {
            section = 'gc';
            result.gcInfo.push({
                name: trimmed.substring('Garbage Collector Name:'.length).trim(),
                collectionCount: 0,
                collectionTime: 0
            });
            continue;
        }
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1)
            continue;
        const key = trimmed.substring(0, colonIdx).trim().toLowerCase();
        const value = trimmed.substring(colonIdx + 1).trim();
        if (section === 'runtime') {
            if (key === 'vmname')
                result.runtimeInfo.vmName = value;
            else if (key === 'vmversion')
                result.runtimeInfo.vmVersion = value;
            else if (key === 'vmvendor')
                result.runtimeInfo.vmVendor = value;
            else if (key === 'uptime')
                result.runtimeInfo.uptime = safeInt(value, 10);
        }
        else if (section === 'os') {
            if (key === 'osname')
                result.osInfo.osName = value;
            else if (key === 'osversion')
                result.osInfo.osVersion = value;
            else if (key === 'architecture')
                result.osInfo.architecture = value;
            else if (key === 'availableprocessors')
                result.osInfo.availableProcessors = safeInt(value);
            else if (key === 'systemloadaverage')
                result.osInfo.systemLoadAverage = safeFloat(value);
        }
        else if (section === 'memory' && currentPool) {
            if (key === 'type')
                currentPool.type = value;
            else if (key === 'used')
                currentPool.used = parseMemory(value);
            else if (key === 'committed')
                currentPool.committed = parseMemory(value);
            else if (key === 'max')
                currentPool.max = parseMemory(value);
        }
        else if (section === 'gc' && result.gcInfo.length > 0) {
            const currentGc = result.gcInfo[result.gcInfo.length - 1];
            if (key === 'collectioncount')
                currentGc.collectionCount = safeInt(value);
            else if (key === 'collectiontime')
                currentGc.collectionTime = safeInt(value);
        }
    }
    if (currentPool)
        result.memoryPools.push(currentPool);
    if (!result.runtimeInfo.vmName)
        console.warn('[parseVminfo] Missing runtime information');
    if (!result.osInfo.osName)
        console.warn('[parseVminfo] Missing OS information');
    if (result.memoryPools.length === 0)
        console.warn('[parseVminfo] No memory pools parsed');
    return result;
}
function parseMemory(value) {
    const match = value.match(/^([\d.]+)\s*(KB|MB|GB|bytes)?$/i);
    if (!match)
        return 0;
    const num = parseFloat(match[1]);
    const unit = (match[2] || 'bytes').toUpperCase();
    if (unit === 'KB')
        return num * 1024;
    if (unit === 'MB')
        return num * 1024 * 1024;
    if (unit === 'GB')
        return num * 1024 * 1024 * 1024;
    return num;
}
async function discoverApps() {
    const raw = await tomcatFetch('/text/list');
    return parseAppList(raw);
}
async function fetchInstanceHealth() {
    const raw = await tomcatFetch('/status?XML=true');
    return parseStatus(raw);
}
async function fetchJvmSnapshot() {
    const raw = await tomcatFetch('/text/vminfo');
    return parseVminfo(raw);
}
