/**
 * Tomcat Manager scraper.
 * Parses /text/list, /status?XML=true, and /text/vminfo endpoints.
 */
import { Agent } from 'https';
import { clearTimeout } from 'timers';
import { XMLParser } from 'fast-xml-parser';
import { tomcatInstances } from '../db/schema';

function safeInt(value: unknown, defaultValue = 0): number {
    if (typeof value === 'number') return value;
    if(typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed; 
    }
    return defaultValue;
}

function safeFloat(value: unknown, defaultValue = 0): number {
    if (typeof value === 'number') return value;
    if(typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed; 
    }
    return defaultValue;
}

const httpsAgent = new Agent({ rejectUnauthorized: false });

/**
 * Type for a Tomcat instance row from the database
 */
export type TomcatInstance = typeof tomcatInstances.$inferSelect;

/**
 * Represents an application discovered on a Tomcat instance.
 */
export interface DiscoveredApp {
    contextPath: string;
    state: string;
    sessions: number;
    displayName: string;
}

/**
 * Represents health and usage metrics for a specific Tomcat connector.
 */
export interface ConnectorHealth {
    name: string;
    threadInfo: {
        maxThreads: number;
        currentThreadCount: number;
        currentThreadsBusy: number;
        keepAliveCount: number;
    };
    requestInfo: {
        maxProcessingTime: number;
        processingTime: number;
        requestCount: number;
        errorCount: number;
        bytesReceived: number;
        bytesSent: number;
    };
}

/**
 * Represents comprehensive health and configuration data for a Tomcat instance.
 */
export interface InstanceHealth {
    serverInfo: {
        tomcatVersion: string;
        jvmVersion: string;
        osName: string;
        architecture: string;
    };
    memoryInfo: {
        freeMemory: number;
        totalMemory: number;
        maxMemory: number;
    };
    connectors: ConnectorHealth[];
    raw: string;
}

/**
 * Represents a snapshot of the Java Virtual Machine metrics and information.
 */
export interface JvmSnapshot {
    runtimeInfo: {
        vmName: string;
        vmVersion: string;
        vmVendor: string;
        uptime: number;
    };
    memoryPools: Array<{
        name: string;
        type: string;
        used: number;
        committed: number;
        max: number;
    }>;
    gcInfo: Array<{
        name: string;
        collectionCount: number;
        collectionTime: number;
    }>;
    osInfo: {
        osName: string;
        osVersion: string;
        architecture: string;
        availableProcessors: number;
        systemLoadAverage: number;
    };
    raw: string;
}



export async function tomcatFetch(pathSuffix: string, instance: TomcatInstance, retries = 3): Promise<string> {
    // instance.managerUrl is stored without a trailing slash (see normalizeManagerUrl),
    // and pathSuffix is passed with a leading slash by convention (e.g. '/text/list').
    // A leading-slash reference passed to `new URL()` replaces the ENTIRE base path
    // instead of joining to it, so we normalize both sides before constructing the URL.
    const base = instance.managerUrl.endsWith('/') ? instance.managerUrl : `${instance.managerUrl}/`;
    const suffix = pathSuffix.startsWith('/') ? pathSuffix.slice(1) : pathSuffix;
    const url = new URL(suffix, base).href;
    const auth = Buffer.from(`${instance.managerUser}:${instance.managerPass}`).toString('base64');

     let lastError: Error | undefined;

     for ( let attempt = 1; attempt <= retries; attempt++){
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const response = await fetch(url, {
                headers: { Authorization: `Basic ${auth}` },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if(!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${response.statusText} at ${url}: ${body.substring(0, 200)}`);
            }

            return await response.text();
        } catch (error: any) {
            clearTimeout(timeoutId);
            console.error(`[tomcatFetch] Attempt ${attempt} error:`, {
                name: error.name,
                code: error.code,
                message: error.message,
                cause: error.cause?.message,
            });
            lastError = error;

            const isRetryable = 
                error.name === 'AbortError' ||
                error.code === 'ECONNREFUSED' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET' ||
                error.code === 'ENOTFOUND';

            if (!isRetryable || attempt === retries)
                break;

            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.warn(
                `[tomcatFetch] Attempt ${attempt}/${retries} failed for ${url}: ${error.message}.
                Retrying in ${delay/1000}secs...`
            );
            await new Promise((r) => setTimeout(r, delay));
        }   
     }

    throw new Error(
        `[tomcatFetch] Failed after ${retries} attempts for ${url}: ${lastError?.message}`
    );

    
}



/**
 * Parses raw application list text from the Tomcat Manager.
 * @param raw - Raw /text/list response body
 * @returns Parsed application entries
 */
export function parseAppList(raw: string): DiscoveredApp[] {
    const lines = raw.split('\n').filter(l => l.trim());
    const apps: DiscoveredApp[] = [];

    const header = lines[0]?.trim();
    if (!header?.startsWith('OK - Listed applications')) {
        console.warn('[parseAppList] Unexpected header:', header?.substring(0, 100));
    }

    for (const line of lines) {
        const parts = line.split(':');
        if (parts.length < 2) continue; // Need at least path + state

        const contextPath = parts[0];
        const state = parts[1] || 'unknown';
        // Session count is positionally the 3rd field. If missing or unparseable, default 0.
        const sessions = parts.length > 2 ? parseInt(parts[2].trim(), 10) || 0 : 0;
        const displayName = parts.length > 3 ? parts.slice(3).join(':') : contextPath;

        apps.push({ contextPath, state, sessions, displayName });
    }

    if (apps.length === 0) {
        console.warn('[parseAppList] No applications parsed from response');
    } else {
        console.log(`[parseAppList] Parsed ${apps.length} applications`);
    }

    return apps;
}

function parseStatusXml(raw: string): InstanceHealth {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseAttributeValue: true,
        removeNSPrefix: true,
        isArray: (name) => name === 'connector',
    });

    let parsed : any;
    try {
        parsed = parser.parse(raw);
    } catch(err) {
        throw new Error(
            `Failed to parse XML: ${err instanceof Error ? err.message : String(err)}`
        );
    }
    
    const status = parsed.status;
    if(!status)
        throw new Error('XML status response is missing the <status> root element');

    const result: InstanceHealth = {
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
    if(connectors) {
        const arr = Array.isArray(connectors) ? connectors : [connectors];

        for(const conn of arr){
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
                    keepAliveCount: safeInt( 
                        tiAttrs.keepAliveCount || tiAttrs['@_keepAliveCount'] || 
                        tiAttrs.keepAliveSockets || tiAttrs['_@keepAliveSockets']),
                },
                requestInfo: {
                    maxProcessingTime: safeInt(
                        riAttrs.maxTime || riAttrs['@_maxTime'] ||
                        riAttrs.maxProcessingTime || riAttrs['@_maxProcessingTime']
                    ),
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

/**
 * Parses raw status response from Tomcat into structured health data.
 * Supports both XML and plain text formats.
 * @param raw - Raw /status response body
 * @returns Parsed instance health
 */
export function parseStatus(raw: string): InstanceHealth {
    const trimmed = raw.trim();
    if (trimmed.startsWith('<?xml>') || trimmed.startsWith('<status')) {
        return parseStatusXml(raw);
    }
    return parseStatusText(raw);
}

/**
 * Parses raw plain text status response from Tomcat.
 * @param raw - Raw plain-text /status response body
 * @returns Parsed instance health
 */
export function parseStatusText(raw: string): InstanceHealth {
    const lines = raw.split('\n');

    const result: InstanceHealth = {
        serverInfo: { tomcatVersion: '', jvmVersion: '', osName: '', architecture: '' },
        memoryInfo: { freeMemory: 0, totalMemory: 0, maxMemory: 0 },
        connectors: [],
        raw,
    };

    let currentSection = '';
    let currentConnector: ConnectorHealth | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) { currentSection = ''; continue; }

        if (line.includes('Tomcat Version')) currentSection = 'server';
        else if (line.includes('Memory usage') || line.includes('JVM memory')) currentSection = 'memory';
        else if (line.includes('Thread Pools') || line.includes('Connectors')) currentSection = 'connector';
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
        if (colonIdx === -1) continue;
        const key = line.substring(0, colonIdx).trim().toLowerCase();
        const value = line.substring(colonIdx + 1).trim();

        if (key === 'tomcat version') result.serverInfo.tomcatVersion = value;
        else if (key === 'jvm version') result.serverInfo.jvmVersion = value;
        else if (key === 'os name') result.serverInfo.osName = value;
        else if (key === 'architecture') result.serverInfo.architecture = value;
        else if (key === 'free memory') result.memoryInfo.freeMemory = parseMemory(value);
        else if (key === 'total memory') result.memoryInfo.totalMemory = parseMemory(value);
        else if (key === 'max memory') result.memoryInfo.maxMemory = parseMemory(value);
        else if (currentConnector) {
            if (key === 'max threads') currentConnector.threadInfo.currentThreadCount = parseInt(value, 10);  
            else if (key === 'current thread count') currentConnector.threadInfo.currentThreadCount = parseInt(value, 10);
            else if (key === 'current threads busy') currentConnector.threadInfo.currentThreadsBusy = parseInt(value, 10);
            else if (key === 'keep-alive sockets') currentConnector.threadInfo.keepAliveCount = parseInt(value, 10);
            else if (key === 'max processing time') currentConnector.requestInfo.maxProcessingTime = parseInt(value, 10);
            else if (key === 'processing time') currentConnector.requestInfo.processingTime = parseInt(value, 10);
            else if (key === 'request count') currentConnector.requestInfo.requestCount = parseInt(value, 10);
            else if (key === 'error count') currentConnector.requestInfo.errorCount = parseInt(value, 10);
            else if (key === 'bytes received') currentConnector.requestInfo.bytesReceived = parseInt(value, 10);
            else if (key === 'bytes sent') currentConnector.requestInfo.bytesSent = parseInt(value, 10);
        }
    }

    if (currentConnector?.name) result.connectors.push(currentConnector as ConnectorHealth);
    return result;
}

/**
 * Parses raw JVM info text into a structured JVM snapshot.
 * @param raw - Raw /text/vminfo response body
 * @returns Parsed JVM snapshot
 */
export function parseVminfo(raw: string): JvmSnapshot {
    const lines = raw.split('\n');
    const result: JvmSnapshot = {
        runtimeInfo: { vmName: '', vmVersion: '', vmVendor: '', uptime: 0 },
        memoryPools: [],
        gcInfo: [],
        osInfo: { osName: '', osVersion: '', architecture: '', availableProcessors: 0, systemLoadAverage: 0 },
        raw,
    };

    let section = '';
    let currentPool: any = null;

    //header validation
    const header = lines[0]?.trim();
    if(!header?.startsWith('OK - VM info')) {
        console.warn('[parseVminfo] Unexpected header:', header?.substring(0, 100));
    }

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Section detection — must come before key:value parsing
        if (trimmed === 'Runtime information:') { section = 'runtime'; continue; }
        if (trimmed === 'OS information:') { section = 'os'; continue; }
        if (trimmed.startsWith('Memory Pool Name:')) { 
            section = 'memory'; 
            // Flush previous pool
            if (currentPool) result.memoryPools.push(currentPool);
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
        if (colonIdx === -1) continue;
        const key = trimmed.substring(0, colonIdx).trim().toLowerCase();
        const value = trimmed.substring(colonIdx + 1).trim();

        if (section === 'runtime') {
            if (key === 'vmname') result.runtimeInfo.vmName = value;
            else if (key === 'vmversion') result.runtimeInfo.vmVersion = value;
            else if (key === 'vmvendor') result.runtimeInfo.vmVendor = value;
            else if (key === 'uptime') result.runtimeInfo.uptime = safeInt(value, 10);
        }
        else if (section === 'os') {
            if (key === 'osname') result.osInfo.osName = value;
            else if (key === 'osversion') result.osInfo.osVersion = value;
            else if (key === 'architecture') result.osInfo.architecture = value;
            else if (key === 'availableprocessors') result.osInfo.availableProcessors = safeInt(value);
            else if (key === 'systemloadaverage') result.osInfo.systemLoadAverage = safeFloat(value);
        }
        else if (section === 'memory' && currentPool) {
            if (key === 'type') currentPool.type = value;
            else if (key === 'used') currentPool.used = parseMemory(value);
            else if (key === 'committed') currentPool.committed = parseMemory(value);
            else if (key === 'max') currentPool.max = parseMemory(value);
        }
        else if (section === 'gc' && result.gcInfo.length > 0) {
            const currentGc = result.gcInfo[result.gcInfo.length - 1];
            if (key === 'collectioncount') currentGc.collectionCount = safeInt(value);
            else if (key === 'collectiontime') currentGc.collectionTime = safeInt(value);
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

function parseMemory(value: string): number {
    const match = value.match(/^([\d.]+)\s*(KB|MB|GB|bytes)?$/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = (match[2] || 'bytes').toUpperCase();
    if (unit === 'KB') return num * 1024;
    if (unit === 'MB') return num * 1024 * 1024;
    if (unit === 'GB') return num * 1024 * 1024 * 1024;
    return num;
}

/**
 * Discovers applications deployed on the configured Tomcat instance.
 * @param instance - Tomcat instance configuration
 * @returns Parsed application list from /text/list
 */
export async function discoverApps(instance: TomcatInstance): Promise<DiscoveredApp[]> {
    const raw = await tomcatFetch('/text/list', instance);
    return parseAppList(raw);
}

/**
 * Fetches and parses instance health metrics from /status?XML=true.
 * @param instance - Tomcat instance configuration
 * @returns Parsed instance health snapshot
 */
export async function fetchInstanceHealth(instance: TomcatInstance): Promise<InstanceHealth> {
    const raw = await tomcatFetch('/status?XML=true', instance);
    return parseStatus(raw);
}

/**
 * Fetches and parses a snapshot of JVM metrics from /text/vminfo.
 * @param instance - Tomcat instance configuration
 * @returns Parsed JVM snapshot
 */
export async function fetchJvmSnapshot(instance: TomcatInstance): Promise<JvmSnapshot> {
    const raw = await tomcatFetch('/text/vminfo', instance);
    return parseVminfo(raw);
}