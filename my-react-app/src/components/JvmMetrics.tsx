import { useState, useEffect } from 'react';
import { fetchLatestJvm } from '../api/health';

export default function JvmMetrics() {
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const res = await fetchLatestJvm();
            if (res.success) setSnapshots(res.data);
            setLoading(false);
        };
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="p-4">Loading JVM data...</div>;

    const latest = snapshots[0];
    if (!latest) return <div className="p-4">No JVM data available.</div>;

    const totalUsed = latest.memoryPools?.reduce((sum: number, p: any) => sum + (p.used || 0), 0) || 0;
    const totalMax = latest.memoryPools?.reduce((sum: number, p: any) => sum + (p.max > 0 ? p.max : 0), 0) || 1;

    return (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">JVM Diagnostics</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="border rounded p-4">
                    <p className="text-gray-500 text-sm">JVM Version</p>
                    <p className="font-mono text-lg">{latest.runtimeInfo?.vmVersion}</p>
                    <p className="text-xs text-gray-400">{latest.runtimeInfo?.vmName}</p>
                </div>
                <div className="border rounded p-4">
                    <p className="text-gray-500 text-sm">Uptime</p>
                    <p className="font-mono text-lg">
                        {Math.floor((latest.runtimeInfo?.uptime || 0) / 3600000)}h {' '}
                        {Math.floor(((latest.runtimeInfo?.uptime || 0) % 3600000) / 60000)}m
                    </p>
                </div>
                <div className="border rounded p-4">
                    <p className="text-gray-500 text-sm">OS Load</p>
                    <p className="font-mono text-lg">{latest.osInfo?.systemLoadAverage}</p>
                    <p className="text-xs text-gray-400">{latest.osInfo?.osName} ({latest.osInfo?.availableProcessors} cores)</p>
                </div>
            </div>

            <h3 className="font-semibold mb-2">Memory Pools</h3>
            <div className="space-y-3">
                {latest.memoryPools?.map((pool: any) => {
                    const pct = pool.max > 0 ? (pool.used / pool.max) * 100 : 0;
                    return (
                        <div key={pool.name}>
                            <div className="flex justify-between text-sm mb-1">
                                <span>{pool.name} <span className="text-gray-400">({pool.type})</span></span>
                                <span className="font-mono">{(pool.used / 1024 / 1024).toFixed(1)} / {(pool.max / 1024 / 1024).toFixed(1)} MB</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded h-2">
                                <div
                                    className={`h-2 rounded ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <h3 className="font-semibold mt-4 mb-2">Garbage Collectors</h3>
            <div className="grid grid-cols-2 gap-4">
                {latest.gcInfo?.map((gc: any) => (
                    <div key={gc.name} className="border rounded p-3 text-sm">
                        <p className="font-medium">{gc.name}</p>
                        <p className="text-gray-500">Collections: {gc.collectionCount}</p>
                        <p className="text-gray-500">Time: {gc.collectionTime}ms</p>
                    </div>
                ))}
            </div>
        </div>
    );
}