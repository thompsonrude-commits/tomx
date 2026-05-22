import React, { useState, useEffect } from 'react';
import { GlowButton } from '../components/GlowButton';
import { EmailRecord, VerificationResult } from '../types';

export const Verify: React.FC = () => {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [results, setResults] = useState<Map<string, VerificationResult>>(new Map());
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const rowsPerPage = 50;

  useEffect(() => {
    loadEmails();
  }, [page, search, statusFilter]);

  const loadEmails = async () => {
    try {
      if (window.electronAPI) {
        const filters = {
          limit: rowsPerPage,
          offset: (page - 1) * rowsPerPage,
          search,
          status: statusFilter
        };
        const [e, count] = await Promise.all([
          window.electronAPI.getEmails(filters),
          window.electronAPI.getEmailCount(filters)
        ]);
        
        setEmails(e || []);
        setTotalCount(count || 0);
        
        // Restore results from database status if not already verifying
        if (!verifying) {
          const restoredResults = new Map<string, VerificationResult>();
          (e || []).forEach((record: EmailRecord) => {
            if (record.status && record.status !== 'pending') {
              restoredResults.set(record.email, {
                email: record.email,
                valid: record.status === 'Active',
                status: record.status,
                mxRecords: []
              });
            }
          });
          setResults(restoredResults);
        }
      }
    } catch (err) {
      console.error('Failed to load emails:', err);
    }
  };

  const verifyAll = async () => {
    if (totalCount === 0) return;
    setVerifying(true);
    setProgress(0);
    try {
      const batchSize = 100;
      let processed = 0;
      
      // We process all IDs matching current filters
      const allMatchingEmails = await window.electronAPI.getEmails({ 
        search, 
        status: statusFilter 
      });

      for (let i = 0; i < allMatchingEmails.length; i += batchSize) {
        const batch = allMatchingEmails.slice(i, i + batchSize).map((e: any) => e.email);
        if (window.electronAPI) {
          const batchResults = await window.electronAPI.verifyEmails(batch);
          setResults((prev) => {
            const newMap = new Map(prev);
            batchResults.forEach((r) => newMap.set(r.email, r));
            return newMap;
          });
        }
        processed += batch.length;
        setProgress((processed / allMatchingEmails.length) * 100);
      }
      loadEmails(); // Refresh current page
    } catch (err) {
      console.error('Verification failed:', err);
    }
    setVerifying(false);
  };

  const removeDuplicates = async () => {
    const seen = new Set<string>();
    const uniqueEmails: EmailRecord[] = [];
    for (const email of emails) {
      if (!seen.has(email.email.toLowerCase())) {
        seen.add(email.email.toLowerCase());
        uniqueEmails.push(email);
      }
    }
    const removedCount = emails.length - uniqueEmails.length;
    setEmails(uniqueEmails);
    alert(`Removed ${removedCount} duplicate emails`);
  };

  const handleExport = async () => {
    const targetStatus = statusFilter === 'All' ? undefined : statusFilter === 'Active' ? 'Active' : statusFilter === 'Rejected' ? 'Rejected' : undefined;
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.exportData('csv', {
          filterStatus: targetStatus as any,
          columns: ['email', 'name', 'phone', 'domain', 'sourcePage', 'status', 'foundAt'],
          format: 'csv'
        });
        if (result) {
          alert(`Exported successfully to: ${result}`);
        }
      }
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleDiscardInactive = async () => {
    if (!confirm('Are you sure you want to PERMANENTLY delete all Rejected and Invalid emails from the database?')) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.deleteEmailsByStatus('Rejected');
        alert('Inactive emails discarded successfully.');
        setPage(1);
        loadEmails();
      }
    } catch (err: any) {
      alert('Failed to discard emails: ' + err.message);
    }
  };

  const handleImport = async () => {
    try {
      if (window.electronAPI) {
        const addedCount = await window.electronAPI.importEmailsFromFile();
        if (addedCount > 0) {
          alert(`Successfully imported ${addedCount} new emails.`);
          loadEmails(); // Refresh the list
        } else if (addedCount === 0) {
          // Could be canceled or no new emails found
        }
      }
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    }
  };

  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const paginatedEmails = emails; // Already paginated from backend

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-cyber-text">Email Verifier</h1>
        <p className="text-sm text-gray-500 mt-1">Verify email addresses using MX record lookup</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-xs text-gray-500 uppercase">Matching Filter</p>
          <p className="text-2xl font-bold text-cyber-accent font-mono mt-1">{totalCount}</p>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-xs text-gray-500 uppercase">Showing</p>
          <p className="text-2xl font-bold text-green-400 font-mono mt-1">{emails.length}</p>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-xs text-gray-500 uppercase">Page</p>
          <p className="text-2xl font-bold text-red-400 font-mono mt-1">{page} / {totalPages || 1}</p>
        </div>
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-4">
          <p className="text-xs text-gray-500 uppercase">Process Batch</p>
          <p className="text-2xl font-bold text-yellow-400 font-mono mt-1">{rowsPerPage}</p>
        </div>
      </div>

      {/* Action buttons */}
          <div className="flex justify-between items-center gap-4">
        <div className="flex gap-3">
          <GlowButton onClick={verifyAll} disabled={verifying || totalCount === 0}>
            {verifying ? `Verifying... ${Math.round(progress)}%` : 'Verify Filtered'}
          </GlowButton>
          <GlowButton onClick={handleDiscardInactive} variant="warning" disabled={verifying}>
            Discard Inactive
          </GlowButton>
          <GlowButton onClick={loadEmails} variant="secondary">
            Refresh
          </GlowButton>
          <GlowButton onClick={handleImport} variant="primary">
            Import Emails
          </GlowButton>
          <GlowButton onClick={handleExport} variant="success" disabled={verifying}>
            Export Active
          </GlowButton>
        </div>

        <div className="flex gap-3 flex-1">
           <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-cyber-bg border border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm text-cyber-text focus:border-cyber-accent/50 focus:outline-none appearance-none"
              >
                <option value="All">All Status</option>
                <option value="Active">Active Only</option>
                <option value="Rejected">Inactive/Rejected</option>
                <option value="Pending">Pending</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
           </div>
           <input
             type="text"
             placeholder="Search emails..."
             value={search}
             onChange={(e) => { setSearch(e.target.value); setPage(1); }}
             className="flex-1 max-w-xs bg-cyber-bg border border-gray-700 rounded-lg px-4 py-2 text-sm text-cyber-text focus:border-cyber-accent/50 focus:outline-none"
           />
        </div>
      </div>

          {/* Progress bar and Pagination info */}
      <div className="flex justify-between items-center">
        {verifying && (
          <div className="flex-1 bg-cyber-card rounded-xl border border-gray-700/50 p-4 mr-4">
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-cyber-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        
        {totalPages > 1 && (
          <div className="flex items-center gap-1 bg-cyber-bg rounded-lg border border-gray-700 p-1 ml-auto">
            <button 
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1 text-gray-500 hover:text-cyber-accent disabled:opacity-30"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-[10px] text-gray-400 font-mono px-2">Page {page} / {totalPages}</span>
            <button 
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1 text-gray-500 hover:text-cyber-accent disabled:opacity-30"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-cyber-card rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">MX Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {paginatedEmails.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-600">
                    {search ? 'No emails matching search.' : 'No emails to verify. Extract some emails first.'}
                  </td>
                </tr>
              ) : (
                paginatedEmails.map((email) => {
                  const result = results.get(email.email);
                  return (
                    <tr key={email.id} className="hover:bg-cyber-accent/5">
                      <td className="px-4 py-3 text-cyber-accent font-mono text-xs">{email.email}</td>
                      <td className="px-4 py-3 text-gray-400">{email.domain}</td>
                      <td className="px-4 py-3">
                        {result ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs ${result.valid ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {result.status || (result.valid ? 'Active' : 'Rejected')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/10 text-gray-400">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono text-right">
                        {result?.mxRecords?.join(', ') || 'ΓÇö'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
