import React from 'react';
import { LicenseStatus } from '../types';

interface SettingsProps {
  licenseStatus: LicenseStatus | null;
}

export const Settings: React.FC<SettingsProps> = ({ licenseStatus }) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-cyber-text">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Application configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* About */}
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <svg className="w-8 h-8 text-cyber-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-cyber-accent glow-text">TomXtractor 49ja</h3>
              <p className="text-xs text-gray-500">Version 1.0.6</p>
            </div>
          </div>
          <p className="text-sm text-gray-400">Professional email extraction tool with advanced crawling capabilities.</p>
        </div>

        {/* License Info */}
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">License Information</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span className={licenseStatus?.licensed ? 'text-green-400' : licenseStatus?.trial ? 'text-yellow-400' : 'text-red-400'}>
                {licenseStatus?.licensed ? 'Licensed' : licenseStatus?.trial ? 'Trial' : 'Expired'}
              </span>
            </div>
            {licenseStatus?.trial && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Time Remaining</span>
                <span className="text-yellow-400 font-mono">{Math.round(licenseStatus.hoursRemaining || 0)}h</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Machine ID</span>
              <span className="text-cyber-accent font-mono text-xs">{licenseStatus?.machineId || 'Loading...'}</span>
            </div>
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">General</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Default threads</span>
              <input type="number" defaultValue={3} min={1} max={10}
                className="w-20 bg-cyber-bg border border-gray-700 rounded px-2 py-1 text-sm text-cyber-text text-center focus:outline-none focus:border-cyber-accent/50" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Default timeout (s)</span>
              <input type="number" defaultValue={30} min={5} max={120}
                className="w-20 bg-cyber-bg border border-gray-700 rounded px-2 py-1 text-sm text-cyber-text text-center focus:outline-none focus:border-cyber-accent/50" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Auto-remove duplicates</span>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
            </div>
          </div>
        </div>

        {/* Data */}
        <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Data Management</h3>
          <div className="space-y-3">
            <button 
              onClick={async () => {
                if (confirm('Clear all extracted emails?')) {
                  await window.electronAPI?.clearEmails();
                  alert('Emails cleared successfully');
                }
              }}
              className="w-full text-left px-4 py-3 bg-cyber-bg rounded-lg text-sm text-gray-400 hover:text-cyber-text hover:bg-gray-800 transition-colors"
            >
              Clear all extracted emails
            </button>
            <button 
              onClick={async () => {
                if (confirm('Clear crawl logs?')) {
                  await window.electronAPI?.clearLogs();
                  alert('Logs cleared successfully');
                }
              }}
              className="w-full text-left px-4 py-3 bg-cyber-bg rounded-lg text-sm text-gray-400 hover:text-cyber-text hover:bg-gray-800 transition-colors"
            >
              Clear crawl logs
            </button>
            <button 
              onClick={async () => {
                if (confirm('RESET ENTIRE DATABASE? This cannot be undone.')) {
                  await window.electronAPI?.resetDatabase();
                  alert('Database reset successfully. The app will now reload.');
                  window.location.reload();
                }
              }}
              className="w-full text-left px-4 py-3 bg-cyber-bg rounded-lg text-sm text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Reset database
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
