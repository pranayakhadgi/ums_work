import { useEffect } from 'react';
import { useDiscoveryStore, type DiscoveredApp } from '../store/discoveryStore';
import { ScanLine, Plus, Server, RefreshCw } from 'lucide-react';


export default function DiscoveryPanel() {
    const candidates = useDiscoveryStore((s) => s.candidates);
    const loading = useDiscoveryStore((s) => s.loading);
    const loadCandidates = useDiscoveryStore((s) => s.loadCandidates);
    const promote = useDiscoveryStore((s) => s.promote);

    useEffect(() => { loadCandidates(); }, []);

    const handlePromote = async (app: DiscoveredApp) => {
        await promote(app);
    };

    const unpromoted = candidates.filter(c => !c.isPromoted);

    return (
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <ScanLine size={18} className="text-blue-400" />
                        Discovered Applications
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        From Tomcat Manager /synctl/text/list
                    </p>
                </div>
                <button
                    onClick={loadCandidates}
                    disabled={loading}
                    className="btn btn-primary"
                >
                    {loading ? (
                        <>
                            <RefreshCw size={14} className="spinning" />
                            Scanning...
                        </>
                    ) : (
                        <>
                            <ScanLine size={14} />
                            Scan Tomcat
                        </>
                    )}
                </button>
            </div>

            {unpromoted.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-700 rounded-lg">
                    <Server size={24} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-gray-500 text-sm">No new applications found. Click Scan to discover.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-700 text-xs uppercase tracking-wider text-gray-500">
                                <th className="py-2.5 pr-4">Context Path</th>
                                <th className="py-2.5 pr-4">State</th>
                                <th className="py-2.5 pr-4">Name</th>
                                <th className="py-2.5 pr-4">Discovered</th>
                                <th className="py-2.5"></th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {unpromoted.map((app) => (
                                <tr key={app.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                                    <td className="py-3 pr-4 font-mono text-blue-400">{app.contextPath}</td>
                                    <td className="py-3 pr-4">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${app.tomcatState === 'running'
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-red-500/10 text-red-400'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${app.tomcatState === 'running' ? 'bg-emerald-400' : 'bg-red-400'
                                                }`} />
                                            {app.tomcatState}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 text-gray-300">{app.name}</td>
                                    <td className="py-3 pr-4 text-gray-500 text-xs">
                                        {new Date(app.discoveredAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-3 text-right">
                                        <button
                                            onClick={() => handlePromote(app)}
                                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            <Plus size={12} />
                                            Monitor
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}