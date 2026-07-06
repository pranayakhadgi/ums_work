// backend/src/services/tomcatScraper.ts
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from 'https';

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

const httpsAgent = new Agent({ rejectUnauthorized: false });

export interface DiscoveredApp {
    contextPath: string;
    state: string;
    sessions: number;
    displayName: string;
}

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



async function tomcatFetch(pathSuffix: string): Promise<string> {
    const env = getEnv();

    if (env.useTestFile) {
        const fileMap: Record<string, string> = {
            '/text/list': 'test-list.txt',
            '/status?XML=true': 'test-status.txt',
            '/text/vminfo': 'test-vminfo.txt',
        };
        const fileName = fileMap[pathSuffix];
        if (!fileName) throw new Error(`No test file mapped for ${pathSuffix}`);

        const filePath = path.join(process.cwd(), 'test-data', fileName);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Test file not found: ${filePath}`);
        }
        return fs.readFileSync(filePath, 'utf-8');
    }

    const url = `${env.scheme}://${env.host}:${env.port}${env.managerPath}${pathSuffix}`;
    const auth = Buffer.from(`${env.tomcatUser}:${env.tomcatPass}`).toString('base64');

    // Native fetch with custom agent for Node 18+
    const response = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
        // @ts-ignore — Node 18+ fetch accepts dispatcher/agent
        dispatcher: env.scheme === 'https' ? httpsAgent : undefined,
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
}



export function parseAppList(raw: string): DiscoveredApp[] {
    const lines = raw.split('\n').filter(l => l.trim());
    const apps: DiscoveredApp[] = [];

    for (const line of lines) {
        const match = line.match(/^(\/[^:]+):([^:]+):(\d+):(.+)$/);
        if (match) {
            apps.push({
                contextPath: match[1],
                state: match[2].toLowerCase(),
                sessions: parseInt(match[3], 10),
                displayName: match[4],
            });
        }
    }
    return apps;
}

export function parseStatusText(raw: string): InstanceHealth {
    const lines = raw.split('\n');

    const result: InstanceHealth = {
        serverInfo: { tomcatVersion: '', jvmVersion: '', osName: '', architecture: '' },
        memoryInfo: { freeMemory: 0, totalMemory: 0, maxMemory: 0 },
        connectors: [],
        raw,
    };

    let currentSection = '';
    let currentConnector: Partial<ConnectorHealth> | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) { currentSection = ''; continue; }

        if (line.includes('Tomcat Version')) currentSection = 'server';
        else if (line.includes('Memory usage') || line.includes('JVM memory')) currentSection = 'memory';
        else if (line.includes('Thread Pools') || line.includes('Connectors')) currentSection = 'connector';
        else if (line.startsWith('Name:') && currentSection === 'connector') {
            if (currentConnector?.name) result.connectors.push(currentConnector as ConnectorHealth);
            currentConnector = { name: line.replace('Name:', '').trim() } as Partial<ConnectorHealth>;
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
            if (key === 'max threads') currentConnector.threadInfo = { ...currentConnector.threadInfo, maxThreads: parseInt(value, 10) } as any;
            else if (key === 'current thread count') currentConnector.threadInfo = { ...currentConnector.threadInfo, currentThreadCount: parseInt(value, 10) } as any;
            else if (key === 'current threads busy') currentConnector.threadInfo = { ...currentConnector.threadInfo, currentThreadsBusy: parseInt(value, 10) } as any;
            else if (key === 'keep-alive sockets') currentConnector.threadInfo = { ...currentConnector.threadInfo, keepAliveCount: parseInt(value, 10) } as any;
            else if (key === 'max processing time') currentConnector.requestInfo = { ...currentConnector.requestInfo, maxProcessingTime: parseInt(value, 10) } as any;
            else if (key === 'processing time') currentConnector.requestInfo = { ...currentConnector.requestInfo, processingTime: parseInt(value, 10) } as any;
            else if (key === 'request count') currentConnector.requestInfo = { ...currentConnector.requestInfo, requestCount: parseInt(value, 10) } as any;
            else if (key === 'error count') currentConnector.requestInfo = { ...currentConnector.requestInfo, errorCount: parseInt(value, 10) } as any;
            else if (key === 'bytes received') currentConnector.requestInfo = { ...currentConnector.requestInfo, bytesReceived: parseInt(value, 10) } as any;
            else if (key === 'bytes sent') currentConnector.requestInfo = { ...currentConnector.requestInfo, bytesSent: parseInt(value, 10) } as any;
        }
    }

    if (currentConnector?.name) result.connectors.push(currentConnector as ConnectorHealth);
    return result;
}

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
            else if (key === 'uptime') result.runtimeInfo.uptime = parseInt(value, 10);
        }
        else if (section === 'os') {
            if (key === 'osname') result.osInfo.osName = value;
            else if (key === 'osversion') result.osInfo.osVersion = value;
            else if (key === 'architecture') result.osInfo.architecture = value;
            else if (key === 'availableprocessors') result.osInfo.availableProcessors = parseInt(value, 10);
            else if (key === 'systemloadaverage') result.osInfo.systemLoadAverage = parseFloat(value);
        }
        else if (section === 'memory' && currentPool) {
            if (key === 'type') currentPool.type = value;
            else if (key === 'used') currentPool.used = parseMemory(value);
            else if (key === 'committed') currentPool.committed = parseMemory(value);
            else if (key === 'max') currentPool.max = parseMemory(value);
        }
        else if (section === 'gc' && result.gcInfo.length > 0) {
            const currentGc = result.gcInfo[result.gcInfo.length - 1];
            if (key === 'collectioncount') currentGc.collectionCount = parseInt(value, 10);
            else if (key === 'collectiontime') currentGc.collectionTime = parseInt(value, 10);
        }
    }

    if (currentPool) result.memoryPools.push(currentPool);
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

export async function discoverApps(): Promise<DiscoveredApp[]> {
    const raw = await tomcatFetch('/text/list');
    return parseAppList(raw);
}

export async function fetchInstanceHealth(): Promise<InstanceHealth> {
    const raw = await tomcatFetch('/status?XML=true');
    return parseStatusText(raw);
}

export async function fetchJvmSnapshot(): Promise<JvmSnapshot> {
    const raw = await tomcatFetch('/text/vminfo');
    return parseVminfo(raw);
}