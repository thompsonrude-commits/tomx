import React, { useState, useEffect } from 'react';
import { GlowButton } from '../components/GlowButton';

interface ActivationProps {
  onActivated: () => void;
}

export const Activation: React.FC<ActivationProps> = ({ onActivated }) => {
  const [machineId, setMachineId] = useState('Loading...');
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMachineId();
  }, []);

  const loadMachineId = async () => {
    try {
      if (window.electronAPI) {
        const id = await window.electronAPI.getMachineId();
        setMachineId(id);
      }
    } catch { setMachineId('ERROR'); }
  };

  const activate = async () => {
    if (!licenseKey.trim()) { setError('Please enter a license key'); return; }
    setLoading(true);
    setError('');
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.activateLicense(licenseKey.trim());
        if (result.success) { onActivated(); }
        else { setError(result.message); }
      }
    } catch (err: any) { setError(err.message || 'Activation failed'); }
    setLoading(false);
  };

  const exit = () => { if (window.electronAPI) window.electronAPI.closeWindow(); };

  return (
    <div className="h-screen bg-cyber-bg flex items-center justify-center">
      <div className="w-full max-w-md mx-auto p-8">
        <div className="bg-cyber-card rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <svg className="w-16 h-16 text-cyber-accent mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <h1 className="text-2xl font-bold text-cyber-accent glow-text">TomXtractor 49ja</h1>
            <p className="text-sm text-gray-500 mt-1">v1.0.6</p>
          </div>

          {/* Trial info message */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5 mb-8">
            <p className="text-sm text-blue-400 text-center leading-relaxed">
              To continue using all features of <strong>TomXtractor 49ja</strong>, please enter your valid license key below.
            </p>
          </div>

          {/* License input */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 block mb-1">License Key</label>
            <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && activate()}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-4 py-3 text-sm text-cyber-text font-mono placeholder-gray-600 focus:outline-none focus:border-cyber-accent/50 tracking-wider text-center" />
          </div>

          {error && <p className="text-xs text-red-400 text-center mb-4">{error}</p>}

          {/* Buttons */}
          <div className="flex gap-3">
            <GlowButton onClick={activate} disabled={loading} className="flex-1 justify-center">
              {loading ? 'Activating...' : 'Activate'}
            </GlowButton>
            <GlowButton onClick={exit} variant="secondary" className="justify-center">Exit</GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
};
