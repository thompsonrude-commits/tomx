import React, { useState, useEffect, useCallback } from 'react';
import { Key, Copy, Check, Shield, RefreshCw, Trash2, Ban, RotateCcw, Plus, Search } from 'lucide-react';

interface LicenseRow {
  key: string;
  status: 'available' | 'active' | 'revoked';
  machine_id: string | null;
  duration_days: number | null;
  created_at: string;
  activated_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  available: 'text-green-400 bg-green-400/10 border-green-400/20',
  active:    'text-blue-400 bg-blue-400/10 border-blue-400/20',
  revoked:   'text-red-400 bg-red-400/10 border-red-400/20',
};

export default function KeygenUI() {
  const [tab, setTab] = useState<'generate' | 'keys'>('generate');
  const [machineId, setMachineId] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [copied, setCopied] = useState('');
  const [batchCount, setBatchCount] = useState(5);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [keys, setKeys] = useState<LicenseRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [duration, setDuration] = useState<number | null>(null); // null means Lifetime
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const api = (window as any).electronAPI;

  useEffect(() => { api?.getMachineId?.().then(setMachineId); }, []);
  useEffect(() => { loadKeys(); }, []); // load on startup for count badge
  useEffect(() => { if (tab === 'keys') loadKeys(); }, [tab]);

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    const result = await api.listKeys();
    if (result.success) setKeys(result.data);
    else setSyncStatus(`Error: ${result.message}`);
    setLoadingKeys(false);
  }, []);

  const generateLocalKey = async () => {
    if (!machineId.trim()) return;
    const key = await api.generateKey(machineId);
    setGeneratedKey(key);
  };

  const syncBatchKeys = async () => {
    setSyncing(true);
    setSyncStatus('Generating & syncing keys...');
    const result = await api.syncKeys(batchCount);
    if (result.success) {
      setSyncStatus(`${result.keys.length} keys synced to Supabase!`);
      setGeneratedKey(result.keys[0]);
    } else {
      setSyncStatus(`Error: ${result.message}`);
    }
    setSyncing(false);
    setTimeout(() => setSyncStatus(''), 5000);
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleRevoke = async (key: string) => {
    setActionLoading(key + '-revoke');
    await api.revokeKey(key);
    await loadKeys();
    setActionLoading(null);
  };

  const handleRestore = async (key: string) => {
    setActionLoading(key + '-restore');
    await api.restoreKey(key);
    await loadKeys();
    setActionLoading(null);
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Permanently delete key ${key}?`)) return;
    setActionLoading(key + '-delete');
    await api.deleteKey(key);
    await loadKeys();
    setActionLoading(null);
  };

  const handlePurge = async () => {
    if (!confirm('⚠️ This will permanently delete ALL keys from the database. This cannot be undone. Continue?')) return;
    setSyncing(true);
    setSyncStatus('Purging all keys...');
    const result = await api.purgeKeys();
    if (result.success) {
      setKeys([]);
      setSyncStatus('All keys purged successfully.');
    } else {
      setSyncStatus(`Error: ${result.message}`);
    }
    setSyncing(false);
    setTimeout(() => setSyncStatus(''), 5000);
  };

  const filteredKeys = keys.filter(k => {
    const matchSearch = k.key.includes(search.toUpperCase()) || (k.machine_id || '').includes(search);
    const matchStatus = statusFilter === 'all' || k.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: keys.length,
    available: keys.filter(k => k.status === 'available').length,
    active: keys.filter(k => k.status === 'active').length,
    revoked: keys.filter(k => k.status === 'revoked').length,
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-white font-sans">
      {/* Header */}
      <div className="border-b border-orange-500/40 px-6 py-4 flex items-center gap-3 bg-orange-500/10">
        <div className="bg-orange-500/20 w-9 h-9 rounded-xl flex items-center justify-center border border-orange-500/40">
          <Shield className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-orange-400">TomXtractor 49ja — Firebase Edition</h1>
          <p className="text-[10px] text-orange-500/70 uppercase tracking-widest">License Admin v2.0</p>
        </div>
        <div className="ml-auto flex gap-2">
          {(['generate', 'keys'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {t === 'keys' ? `Keys (${stats.total})` : t}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Tab */}
      {tab === 'generate' && (
        <div className="p-6 max-w-lg mx-auto space-y-6 mt-4">
          {/* Batch Serial Generator (Primary Commercial Tool) */}
          <div className="bg-[#161b2c] rounded-2xl border border-white/10 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300">Generate Available Serial Keys</h2>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400 whitespace-nowrap">Quantity:</label>
              <input type="number" min={1} max={100} value={batchCount} onChange={e => setBatchCount(Number(e.target.value))}
                className="w-24 bg-[#0b0f19] border border-white/10 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400 whitespace-nowrap">Duration:</label>
              <select 
                value={duration === null ? 'lifetime' : duration.toString()} 
                onChange={e => setDuration(e.target.value === 'lifetime' ? null : Number(e.target.value))}
                className="flex-1 bg-[#0b0f19] border border-white/10 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="lifetime">Full / Lifetime (No Expiry)</option>
                <option value="1">Demo: 24 Hours</option>
                <option value="3">Demo: 3 Days</option>
                <option value="7">Demo: 7 Days</option>
                <option value="30">Demo: 1 Month (30 Days)</option>
                <option value="90">Demo: 3 Months</option>
              </select>
            </div>
            <button 
              onClick={async () => {
                setSyncing(true);
                setSyncStatus(`Generating ${batchCount} keys...`);
                const result = await api.syncKeys(batchCount, duration || undefined);
                if (result.success) {
                  setSyncStatus(result.message);
                  loadKeys(); // Refresh list
                } else {
                  setSyncStatus(`Error: ${result.message}`);
                }
                setSyncing(false);
              }} 
              disabled={syncing}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              {syncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Generate & Sync Batch to Firebase
            </button>
            {syncStatus && (
              <p className={`text-center text-xs font-semibold ${syncStatus.toLowerCase().includes('error') ? 'text-red-400' : 'text-green-400'}`}>
                {syncStatus}
              </p>
            )}
            <p className="text-[10px] text-gray-500 text-center italic">These keys will lock to the first user machine that activates them.</p>
          </div>

          {/* Machine Specific Key (Optional Tool) */}
          <div className="bg-[#161b2c] rounded-2xl border border-white/10 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 opacity-60">Specific Machine ID Key</h2>
            <div className="space-y-4">
              <div className="bg-[#0b0f19] rounded-xl p-4 border border-white/5">
                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Target Machine ID (Current or Manual Override)</label>
                <div className="flex gap-2">
                  <input type="text" value={machineId} onChange={e => setMachineId(e.target.value)}
                    className="flex-1 bg-transparent border-none p-0 text-xs text-blue-400 focus:ring-0 font-mono" />
                </div>
              </div>

              <button 
                onClick={async () => {
                  if (!machineId) return;
                  setSyncing(true);
                  const result = await api.generateKey(machineId, duration || undefined);
                  if (result.success) {
                    setGeneratedKey(result.key);
                    setSyncStatus('Key generated and synced for specific machine.');
                  } else {
                    setSyncStatus(`Error: ${result.message}`);
                  }
                  setSyncing(false);
                }} 
                disabled={!machineId || syncing}
                className="w-full bg-[#1e253a] hover:bg-[#252d45] disabled:opacity-40 text-gray-300 font-semibold py-2.5 rounded-xl border border-white/5 transition-all flex items-center justify-center gap-2"
              >
                Match Specific Machine
              </button>
            </div>
          </div>

          {generatedKey && (
            <div className="bg-[#161b2c] rounded-2xl border border-blue-500/30 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Produced License Key</label>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-[#0b0f19] rounded-xl py-4 px-4 font-mono text-xl tracking-widest text-blue-400 text-center border border-white/5">{generatedKey}</div>
                <button onClick={() => copy(generatedKey, 'gen')} className="bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-colors">
                  {copied === 'gen' ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-gray-400" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keys Tab */}
      {tab === 'keys' && (
        <div className="p-4 space-y-3 h-[calc(100vh-80px)] flex flex-col overflow-hidden">
          <div className="grid grid-cols-4 gap-3 shrink-0">
            {[
              { label: 'Total', value: stats.total, color: 'text-white' },
              { label: 'Available', value: stats.available, color: 'text-green-400' },
              { label: 'Active', value: stats.active, color: 'text-blue-400' },
              { label: 'Revoked', value: stats.revoked, color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#161b2c] rounded-xl border border-white/10 p-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search key or machine ID..."
                className="w-full bg-[#161b2c] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-[#161b2c] border border-white/10 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </select>
            <button onClick={loadKeys} disabled={loadingKeys} className="bg-[#161b2c] border border-white/10 rounded-xl px-3 hover:bg-white/5 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingKeys ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handlePurge} disabled={syncing} title="Purge all keys"
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 hover:bg-red-500/20 transition-colors text-red-400 text-xs font-semibold flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Purge All
            </button>
          </div>

          <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-[#161b2c]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#161b2c] z-10">
                <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Key</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Duration</th>
                  <th className="text-left px-4 py-3">Machine ID</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Activated</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingKeys ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading keys...
                  </td></tr>
                ) : filteredKeys.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-500">No keys found</td></tr>
                ) : filteredKeys.map(row => (
                  <tr key={row.key} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-blue-300">{row.key}</span>
                        <button onClick={() => copy(row.key, row.key)}>
                          {copied === row.key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-500 hover:text-gray-300" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[row.status] || 'text-gray-400 bg-gray-400/10 border-gray-400/20'}`}>{row.status || '—'}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[10px] text-gray-400 italic">
                        {row.duration_days ? `${row.duration_days} ${row.duration_days === 1 ? 'Day' : 'Days'}` : 'Lifetime'}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400 max-w-[160px] truncate">{row.machine_id || '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{row.activated_at ? new Date(row.activated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {row.status !== 'revoked' ? (
                          <button onClick={() => handleRevoke(row.key)} disabled={actionLoading === row.key + '-revoke'} title="Revoke"
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40">
                            {actionLoading === row.key + '-revoke' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <button onClick={() => handleRestore(row.key)} disabled={actionLoading === row.key + '-restore'} title="Restore"
                            className="p-1.5 rounded-lg hover:bg-green-500/10 text-gray-500 hover:text-green-400 transition-colors disabled:opacity-40">
                            {actionLoading === row.key + '-restore' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button onClick={() => handleDelete(row.key)} disabled={actionLoading === row.key + '-delete'} title="Delete permanently"
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40">
                          {actionLoading === row.key + '-delete' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="shrink-0 text-xs text-gray-600 text-right pb-1">
            Showing {filteredKeys.length} of {keys.length} keys
          </div>
        </div>
      )}
    </div>
  );
}
