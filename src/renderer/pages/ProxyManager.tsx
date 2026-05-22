import React, { useState, useEffect, useRef } from 'react';
import { GlowButton } from '../components/GlowButton';
import { ProxyTestResult } from '../types';
import { Shield, Trash2, CheckCircle2, AlertCircle, Clock, Upload, List, Zap } from 'lucide-react';

interface DBProxy {
  id: number;
  address: string;
  working: number;
  latency?: number;
  last_tested?: string;
}

export const ProxyManager: React.FC = () => {
  const [proxies, setProxies] = useState<DBProxy[]>([]);
  const [bulkInput, setBulkInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [view, setView] = useState<'list' | 'import'>('list');
  const [autopilotStatus, setAutopilotStatus] = useState<string>('Autopilot: Initializing proxy verification...');
  const [autopilotDone, setAutopilotDone] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadProxies();

    // Poll every 3 seconds while autopilot is running to reflect live changes
    pollRef.current = setInterval(async () => {
      if (window.electronAPI) {
        const p = await window.electronAPI.getProxies();
        setProxies(p);
      }
    }, 3000);

    // Listen for autopilot complete event from main process
    if (window.electronAPI?.onProxyAutopilotDone) {
      window.electronAPI.onProxyAutopilotDone((working: number) => {
        setAutopilotStatus(`Autopilot complete — ${working} working proxies ready`);
        setAutopilotDone(true);
        if (pollRef.current) clearInterval(pollRef.current);
        loadProxies();
      });
    } else {
      // Fallback: stop polling after 60s if no event support
      setTimeout(() => {
        setAutopilotDone(true);
        setAutopilotStatus('Autopilot: Background verification running...');
        if (pollRef.current) clearInterval(pollRef.current);
        loadProxies();
      }, 60000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadProxies = async () => {
    if (window.electronAPI) {
      const p = await window.electronAPI.getProxies();
      setProxies(p);
      if (p.length === 0 && !fetching) {
        handleFetchFree();
      }
    }
  };

  const handleFetchFree = async () => {
    if (!window.electronAPI) return;
    setFetching(true);
    try {
      await window.electronAPI.fetchFreeProxies();
      await loadProxies();
    } catch (err) {}
    setFetching(false);
  };

  const handleBulkImport = async () => {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length === 0) return;

    if (window.electronAPI) {
      for (const line of lines) {
        await window.electronAPI.addProxy(line);
      }
      setBulkInput('');
      setView('list');
      loadProxies();
    }
  };

  const handleDeleteProxy = async (id: number) => {
    if (window.electronAPI) {
      await window.electronAPI.deleteProxy(id);
      loadProxies();
    }
  };

  const testProxy = async (address: string) => {
    if (window.electronAPI) {
      const result = await window.electronAPI.testProxy(address);
      await window.electronAPI.updateProxyStatus({
        address,
        working: result.working,
        latency: result.latency
      });
      loadProxies();
    }
  };

  const testAll = async () => {
    setTesting(true);
    for (const p of proxies) {
      await testProxy(p.address);
    }
    // Reload — failed proxies are auto-deleted, only working ones remain
    await loadProxies();
    setTesting(false);
  };

  const workingCount = proxies.filter((p) => p.working === 1).length;
  const failedCount = proxies.filter((p) => p.last_tested && p.working === 0).length;

  return (
    <div className="space-y-6 animate-fade-in relative pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-cyber-text flex items-center gap-2">
            <Shield className="text-cyber-accent" />
            Proxy Manager
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and rotate proxies for anonymous extraction</p>
        </div>
        <div className="flex gap-2">
           <GlowButton onClick={() => setView('import')} variant={view === 'import' ? 'primary' : 'secondary'} size="sm">
             <Upload size={14} className="mr-1" /> Bulk Import
           </GlowButton>
           <GlowButton onClick={() => setView('list')} variant={view === 'list' ? 'primary' : 'secondary'} size="sm">
             <List size={14} className="mr-1" /> Proxy List
           </GlowButton>
        </div>
      </div>

      {/* Autopilot Status Banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
        autopilotDone
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
      }`}>
        <Zap size={16} className={autopilotDone ? '' : 'animate-pulse'} />
        <span>{autopilotStatus}</span>
        {!autopilotDone && (
          <span className="ml-auto text-[10px] text-blue-300 font-mono animate-pulse">RUNNING</span>
        )}
      </div>

      {/* Health Monitor */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Total Loaded</p>
          <p className="text-2xl font-bold text-cyber-text font-mono mt-1">{proxies.length}</p>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-[10px] text-green-500/70 uppercase tracking-wider font-bold">Working</p>
          <p className="text-2xl font-bold text-green-400 font-mono mt-1">{workingCount}</p>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-[10px] text-red-500/70 uppercase tracking-wider font-bold">Failed</p>
          <p className="text-2xl font-bold text-red-400 font-mono mt-1">{failedCount}</p>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4 flex items-center justify-center">
           <GlowButton onClick={handleFetchFree} disabled={fetching} variant="primary" className="w-full h-full text-[10px] py-1">
             {fetching ? 'Searching...' : 'Auto-Fetch Free'}
           </GlowButton>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4 flex items-center justify-center">
           <GlowButton onClick={testAll} disabled={testing || proxies.length === 0} variant="warning" className="w-full h-full text-[10px] py-1">
             {testing ? 'Checking...' : 'Verify All'}
           </GlowButton>
        </div>
      </div>

      {view === 'import' ? (
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-6 space-y-4 animate-in slide-in-from-bottom-4">
          <h3 className="text-sm font-bold text-cyber-accent uppercase">Bulk Import Proxies</h3>
          <p className="text-xs text-gray-400">Enter proxies one per line (format: host:port or user:pass@host:port)</p>
          <textarea
            rows={10}
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            placeholder="127.0.0.1:8080&#10;user:pass@1.2.3.4:443"
            className="w-full bg-cyber-bg border border-gray-700 rounded-xl px-4 py-3 text-sm text-cyber-text focus:outline-none focus:border-cyber-accent/50 custom-scrollbar font-mono"
          />
          <div className="flex gap-2">
             <GlowButton onClick={handleBulkImport} className="flex-1">Import {bulkInput.split('\n').filter(l => l.trim()).length} Proxies</GlowButton>
             <GlowButton onClick={() => setView('list')} variant="secondary">Cancel</GlowButton>
          </div>
        </div>
      ) : (
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 overflow-hidden min-h-[400px]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/40 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
              <tr>
                <th className="px-6 py-4">Address</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Latency</th>
                <th className="px-6 py-4">Last Tested</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {proxies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-600 italic">
                    No proxies found. Use 'Bulk Import' to add proxies.
                  </td>
                </tr>
              ) : (
                proxies.map((p) => (
                  <tr key={p.id} className="hover:bg-cyber-accent/5 transition-colors group">
                    <td className="px-6 py-4 font-mono text-xs text-cyber-text">{p.address}</td>
                    <td className="px-6 py-4">
                      {p.working === 1 ? (
                        <span className="text-green-400 flex items-center gap-1 text-[10px]"><CheckCircle2 size={12} /> Active</span>
                      ) : p.last_tested ? (
                        <span className="text-red-400 flex items-center gap-1 text-[10px]"><AlertCircle size={12} /> Failed</span>
                      ) : (
                        <span className="text-gray-500 flex items-center gap-1 text-[10px]"><Clock size={12} /> Untested</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono">
                      {p.latency ? <span className="text-yellow-400">{p.latency}ms</span> : <span className="text-gray-600">--</span>}
                    </td>
                    <td className="px-6 py-4 text-[10px] text-gray-500">
                      {p.last_tested ? new Date(p.last_tested).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => testProxy(p.address)} className="text-gray-500 hover:text-cyber-accent" title="Test Now">
                          <Clock size={14} />
                        </button>
                        <button onClick={() => handleDeleteProxy(p.id)} className="text-gray-500 hover:text-red-400" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
;
