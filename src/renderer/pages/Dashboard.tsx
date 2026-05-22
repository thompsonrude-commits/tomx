import React, { useState, useEffect, useCallback } from 'react';
import { StatCard } from '../components/StatCard';
import { ConsoleLog } from '../components/ConsoleLog';
import { LiveFeed } from '../components/LiveFeed';
import { DataTable } from '../components/DataTable';
import { DashboardStats, LogRecord, ExtractionEvent, EmailRecord } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    emailsFound: 0,
    domainsDiscovered: 0,
    pagesCrawled: 0,
    activeJobs: 0,
    isMailerRunning: false,
  });
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [events, setEvents] = useState<ExtractionEvent[]>([]);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [chartData, setChartData] = useState<{ time: string; emails: number }[]>([]);
  const [isPurging, setIsPurging] = useState(false);


  const loadData = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const [s, e, l] = await Promise.all([
          window.electronAPI.getStats(),
          window.electronAPI.getEmails(),
          window.electronAPI.getLogs(),
        ]);
        setStats(s);
        setEmails(e);
        setLogs(l);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, []);

  const handlePurge = async () => {
    if (!window.electronAPI || isPurging) return;
    if (!confirm('This will permanently delete all extractions that look like false positives (nonsense words containing @). Proceed?')) return;
    
    setIsPurging(true);
    try {
      const result = await window.electronAPI.purgeJunkEmails();
      alert(`Cleanup complete! Removed ${result.removed} junk records. ${result.remaining} valid emails remaining.`);
      loadData();
    } catch (err) {
      console.error('Purge failed:', err);
      alert('Failed to clean database.');
    } finally {
      setIsPurging(false);
    }
  };


  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);

    let cleanup: (() => void) | undefined;
    if (window.electronAPI) {
      cleanup = window.electronAPI.onExtractionEvent((_event, data) => {
        setEvents((prev) => [...prev.slice(-200), data]);
        if (data.type === 'email-found') {
          setStats((prev) => ({ ...prev, emailsFound: prev.emailsFound + 1 }));
          setChartData((prev) => {
            const now = new Date().toLocaleTimeString();
            const last = prev[prev.length - 1];
            if (last && last.time === now) {
              return [...prev.slice(0, -1), { time: now, emails: last.emails + 1 }];
            }
            return [...prev.slice(-30), { time: now, emails: (last?.emails || 0) + 1 }];
          });
        }
        if (data.type === 'page-scanned') {
          setStats((prev) => ({ ...prev, pagesCrawled: prev.pagesCrawled + 1 }));
        }
      });
    }

    return () => {
      clearInterval(interval);
      cleanup?.();
    };
  }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-cyber-text">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time extraction monitoring & analytics</p>
        </div>
        <button
          onClick={handlePurge}
          disabled={isPurging}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all
            ${isPurging 
              ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-cyber-card border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan/50 shadow-[0_0_10px_rgba(0,240,255,0.1)]'
            }`}
        >
          <svg className={`w-4 h-4 ${isPurging ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {isPurging ? 'Cleaning...' : 'Clean Junk'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Emails Found"
          value={stats.emailsFound}
          color="cyan"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          }
        />
        <StatCard
          title="Domains Discovered"
          value={stats.domainsDiscovered}
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          }
        />
        <StatCard
          title="Pages Crawled"
          value={stats.pagesCrawled}
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        />
        <StatCard
          title="Active Jobs"
          value={stats.activeJobs}
          color="yellow"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          }
        />
      </div>

      {/* Chart + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Analytics Chart */}
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Extraction Rate</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  itemStyle={{ color: '#00f0ff' }}
                />
                <Area type="monotone" dataKey="emails" stroke="#00f0ff" fill="url(#emailGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Feed */}
        <LiveFeed events={events} maxHeight="232px" />
      </div>

      {/* Emails Table */}
      <DataTable emails={emails} />

      {/* System Console */}
      <ConsoleLog logs={logs} maxHeight="180px" />
    </div>
  );
};
