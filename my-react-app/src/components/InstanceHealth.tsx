import { useState, useEffect } from 'react';
import { fetchLatestHealth } from '../api/health';

export default function InstanceHealth() {
    const [health, setHealth] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const res = await fetchLatestHealth();
            if (res.success) setHealth(res.data);
            setLoading(false);
        };
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="p-4">Loading health data...</div>;

    return (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Tomcat Instance Health</h2>

            {health.length === 0 ? (
                <p className="text-gray-500">No health data collected yet.</p>
            ) : (
                <div className="grid gap-4">
                    {health.map((h) => (
                        <div key={h.id} className="border rounded p-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-lg">{h.connectorName}</h3>
                                <span className="text-xs text-gray-500">
                                    {new Date(h.collectedAt).toLocaleTimeString()}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-500">Threads</p>
                                    <p className="font-mono">{h.threadInfo?.currentThreadsBusy} / {h.threadInfo?.maxThreads}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Requests</p>
                                    <p className="font-mono">{h.requestInfo?.requestCount?.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Errors</p>
                                    <p className={`font-mono ${(h.requestInfo?.errorCount || 0) > 0 ? 'text-red-600' : ''}`}>
                                        {h.requestInfo?.errorCount || 0}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Memory</p>
                                    <p className="font-mono">
                                        {((h.memoryInfo?.used || 0) / 1024 / 1024).toFixed(1)} MB free
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}