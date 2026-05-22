import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Extract } from './pages/Extract';
import { InteractiveBrowserScraper } from './pages/InteractiveBrowser';
import { Verify } from './pages/Verify';
import { ProxyManager } from './pages/ProxyManager';
import { ExportManager } from './pages/ExportManager';
import { Settings } from './pages/Settings';
import { ActivityLogs } from './pages/ActivityLogs';
import { Mailer } from './pages/Mailer';
import { Activation } from './pages/Activation';
import { LicenseStatus } from './types';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkLicense();
  }, []);

  const checkLicense = async () => {
    try {
      if (window.electronAPI) {
        const status = await window.electronAPI.checkLicense();
        setLicenseStatus(status);
      } else {
        // Dev mode without electron
        setLicenseStatus({ licensed: true, trial: true, trialExpired: false, hoursRemaining: 24 });
      }
    } catch (err) {
      setLicenseStatus({ licensed: true, trial: true, trialExpired: false, hoursRemaining: 24 });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="h-screen bg-cyber-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl font-bold glow-text mb-4">
            <span className="text-green-500">Tom</span>
            <span className="text-white">X</span>
            <span className="text-green-500">tractor</span>
          </div>
          <div className="text-xl text-cyber-text/70 animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  if ((licenseStatus?.trialExpired && !licenseStatus.licensed) || currentPage === 'activate') {
    return <Activation onActivated={() => { setCurrentPage('dashboard'); checkLicense(); }} />;
  }

  const renderPage = () => {
    try {
      const page = currentPage.toLowerCase();
      console.log(`Navigation target: ${page}`);
      
      switch (page) {
        case 'dashboard': return <Dashboard />;
        case 'extract':
        case 'keyword-scraper':
        case 'website-crawler': return <Extract />;
        case 'interactive': return <InteractiveBrowserScraper />;
        case 'verify':
        case 'duplicate-cleaner': return <Verify />;
        case 'proxy-manager': return <ProxyManager />;
        case 'mailer': 
        case 'mailer-section':
        case 'email-sender': 
        case 'emailer': return <Mailer />;
        case 'export': return <ExportManager />;
        case 'activity-logs': return <ActivityLogs />;
        case 'settings': return <Settings licenseStatus={licenseStatus} />;
        default: return <Dashboard />;
      }
    } catch (err: any) {
      return (
        <div className="p-8 bg-red-500/10 border border-red-500/50 rounded-xl">
          <h2 className="text-red-500 font-bold mb-2">Component Error</h2>
          <pre className="text-xs text-red-400 font-mono">{err.message}</pre>
        </div>
      );
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      licenseStatus={licenseStatus}
    >
      {renderPage()}
    </Layout>
  );
};

export default App;
