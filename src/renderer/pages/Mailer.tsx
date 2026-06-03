import React, { useState, useEffect } from 'react';
import { GlowButton } from '../components/GlowButton';
import { MailMerge } from '../components/MailMerge';
import { Mail, Loader2, Play, Square, Plus, Trash2, CheckCircle2, AlertCircle, Clock, AlertTriangle, Paperclip, GitMerge, X } from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor';

interface SmtpAccount {
  id?: number;
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

interface MailingLog {
  id: number;
  recipient: string;
  subject: string;
  status: string;
  deliveryLocation: string;
  statusDetails?: string;
  error?: string;
  sentAt: string;
}

export const Mailer: React.FC = () => {
  const [smtps, setSmtps] = useState<SmtpAccount[]>([]);
  const [logs, setLogs] = useState<MailingLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // SMTP Form state
  const [newSmtp, setNewSmtp] = useState<SmtpAccount>({
    host: '', port: 465, user: '', pass: '', secure: true,
    fromName: '', fromEmail: '', replyTo: ''
  });
  
  // Campaign state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState('');
  const [autoRephrase, setAutoRephrase] = useState(false);
  const [attachments, setAttachments] = useState<{filename: string, path: string}[]>([]);
  const [spamRisk, setSpamRisk] = useState<{ score: number; triggers: string[] }>({ score: 0, triggers: [] });
  const [campaignReport, setCampaignReport] = useState<{ sent: number; failed: number; skipped: number; total: number; reportPath: string } | null>(null);

  const [autoSyncVerified, setAutoSyncVerified] = useState(false);
  const [showMailMerge, setShowMailMerge] = useState(false);
  const [mailMergeRecipients, setMailMergeRecipients] = useState<{ email: string; data: Record<string, string> }[] | null>(null);

  const SPAM_TRIGGER_WORDS = [
    'free', 'win', 'winner', 'cash', 'money', 'urgent', 'act now', 'guarantee',
    '100%', 'no cost', 'no obligation', 'offer', 'congratulations', 'claims',
    'refinance', 'insurance', 'debt', 'investment', 'rich', 'wealth',
    'bitcoin', 'crypto', 'lottery', 'inheritance', 'bank account', 'beneficiary',
    'exclusive', 'limited time', 'lowest price', 'apply now', 'instant'
  ];

  const calculateSpamRisk = (sub: string, msg: string) => {
    const fullText = (sub + ' ' + msg).toLowerCase();
    const triggers: string[] = [];
    let score = 0;

    for (const word of SPAM_TRIGGER_WORDS) {
      if (fullText.includes(word)) {
        score += 10;
        triggers.push(word);
      }
    }
    if ((fullText.match(/[A-Z]/g) || []).length > fullText.length * 0.3 && fullText.length > 20) {
        score += 25;
        triggers.push('Excessive Caps');
    }
    if (/!!!/.test(fullText)) {
        score += 15;
        triggers.push('Multiple !!!');
    }
    setSpamRisk({ score: Math.min(score, 100), triggers: [...new Set(triggers)] });
  };

  useEffect(() => {
    calculateSpamRisk(subject, body);
  }, [subject, body]);

  // Initial Data Fetching
  useEffect(() => {
    let cleanupFunc: (() => void) | undefined;
    
    const init = async () => {
      try {
        // Load settings and data in parallel without blocking UI
        loadData(); // Fire and forget initial load
        
        if (window.electronAPI) {
          window.electronAPI.getMailingSettings().then(settings => {
            if (settings) {
              if (settings.subject) setSubject(settings.subject);
              if (settings.body) setBody(settings.body);
              if (settings.recipients) setRecipients(settings.recipients);
              if (settings.autoRephrase) setAutoRephrase(settings.autoRephrase === 'true');
            }
          }).catch(err => console.error('Mailing settings error:', err));

          cleanupFunc = window.electronAPI.onMailingEvent((_event, data: any) => {
            if (!data) return;
            if (data.type === 'started') { setIsRunning(true); setStatus('Sending...'); }
            else if (data.type === 'complete') { 
              setIsRunning(false); 
              setStatus('Complete'); 
              loadData(); 
              if (data.report) setCampaignReport(data.report);
            }
            else if (data.type === 'stopped') { setIsRunning(false); setStatus('Stopped'); }
            else if (data.type === 'sent') { setStatus(`Sent to ${data.recipient}`); loadData(); }
            else if (data.type === 'waiting') { setStatus('Waiting (1 min)...'); }
            else if (data.type === 'error') { setStatus(`Error: ${data.message || 'Unknown error'}`); loadData(); }
          });
        }
      } catch (err: any) {
        console.error('Mailer initialization error:', err);
      } finally {
        setLoading(false); // Enable UI regardless of data fetch success
      }
    };

    init();
    return () => {
      if (cleanupFunc) cleanupFunc();
    };
  }, []);

  const loadData = async () => {
    if (window.electronAPI) {
      try {
        const s = await window.electronAPI.getSmtps();
        setSmtps(Array.isArray(s) ? s : []);
        
        const l = await window.electronAPI.getMailingLogs();
        setLogs(Array.isArray(l) ? l : []);

        // Check if already running
        const stats = await window.electronAPI.getStats();
        if (stats && stats.isMailerRunning) {
          setIsRunning(true);
          setStatus('Sending...');
        }
      } catch (err) {
        console.error('Failed to load Mailer data:', err);
      }
    }
  };

  const handleAddSmtp = async () => {
    if (!newSmtp.host || !newSmtp.user || !newSmtp.pass) {
      alert('Please fill in host, username, and password');
      return;
    }
    
    // Auto-correct secure toggle based on port to prevent SSL errors
    let finalSmtp = { ...newSmtp };
    if (newSmtp.port === 465) finalSmtp.secure = true;
    if (newSmtp.port === 587 || newSmtp.port === 25) finalSmtp.secure = false;

    if (window.electronAPI) {
      await window.electronAPI.addSmtp(finalSmtp);
      loadData();
      setNewSmtp({
        host: '', port: 465, user: '', pass: '', secure: true,
        fromName: '', fromEmail: '', replyTo: ''
      });
    }
  };

  const handleDeleteSmtp = async (id: number) => {
    if (window.electronAPI) {
      await window.electronAPI.deleteSmtp(id);
      loadData();
    }
  };

  const handleTestSmtp = async (smtp: SmtpAccount) => {
    if (window.electronAPI) {
      const result = await window.electronAPI.testSmtp(smtp);
      if (result.success) {
        alert('SMTP Connection Successful!');
      } else {
        alert('SMTP Connection Failed: ' + result.error);
      }
    }
  };

  const handleStartCampaign = async () => {
    if (smtps.length === 0) {
      alert('Please add at least one SMTP account');
      return;
    }
    if (!subject || !body) {
      alert('Please fill in subject and body');
      return;
    }
    
    let recipientList: string[] = [];

    // Mail Merge mode — use personalized recipients
    if (mailMergeRecipients && mailMergeRecipients.length > 0) {
      recipientList = mailMergeRecipients.map(r => r.email).filter(e => e?.includes('@'));
      if (recipientList.length === 0) {
        alert('No valid email addresses found in the mail merge data.');
        return;
      }
    } else if (autoSyncVerified && window.electronAPI) {
      try {
        const verifiedRecords = await window.electronAPI.getEmails({ status: 'Active' });
        recipientList = verifiedRecords.map((r: any) => r.email).filter((e: string) => e?.includes('@'));
        if (recipientList.length === 0) {
          alert('No Active/Verified emails found in the database. Please verify some emails first.');
          return;
        }
      } catch (err: any) {
        alert('Failed to fetch verified emails: ' + err.message);
        return;
      }
    } else {
      recipientList = recipients.split(/[\n,]/).map(r => r.trim()).filter(r => r.includes('@'));
      if (recipientList.length === 0) {
        alert('No valid recipients found in the text box.');
        return;
      }
    }

    if (window.electronAPI) {
      await window.electronAPI.startMailing({
        subject,
        body,
        recipients: recipientList,
        autoRephrase,
        attachments
      });
    }
  };

  const handleStopCampaign = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopMailing();
    }
  };
  
  const handleClearMemory = async () => {
    if (confirm('Are you sure you want to clear all sender memory?')) {
      if (window.electronAPI) {
        await window.electronAPI.clearSmtps();
        loadData();
      }
    }
  };

  const handleClearLogs = async () => {
    if (confirm('Are you sure you want to clear all delivery logs?')) {
      if (window.electronAPI) {
        await window.electronAPI.clearMailingLogs();
        loadData();
      }
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center animate-pulse">
        <Loader2 className="w-10 h-10 text-cyber-accent mx-auto mb-4 animate-spin" />
        <p className="text-gray-500">Connecting to Mailer System...</p>
      </div>
    );
  }

  // Double check recipients split logic
  const handleRecipientsChange = (val: string) => {
    setRecipients(val);
    if (window.electronAPI) {
      window.electronAPI.saveMailingSetting({ key: 'recipients', value: val }).catch(() => {});
    }
  };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).map(f => ({
        filename: f.name,
        path: (f as any).path
      }));
      setAttachments(prev => [...prev, ...files]);
    }
    // Reset value so same file can be selected again if deleted
    e.target.value = '';
  };

  return (
    <div key="mailer-root" className="space-y-6 animate-fade-in relative pb-12">
      {showMailMerge && (
        <MailMerge
          onApply={(mergeSubject, mergeBody, recipients) => {
            setSubject(mergeSubject);
            setBody(mergeBody);
            setMailMergeRecipients(recipients);
            setAutoSyncVerified(false);
          }}
          onClose={() => setShowMailMerge(false)}
        />
      )}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-cyber-text flex items-center gap-2">
            <Mail className="text-cyber-accent" />
            Email Sender
          </h1>
          <p className="text-sm text-gray-400 mt-1">Send campaigns with auto-rotation (1 email per minute)</p>
        </div>
        <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMailMerge(true)}
              className="px-3 py-1.5 bg-cyber-accent/10 border border-cyber-accent/30 text-cyber-accent rounded-lg text-xs font-semibold hover:bg-cyber-accent/20 transition-all flex items-center gap-1.5"
            >
              <GitMerge size={12} /> Mail Merge
            </button>
            {mailMergeRecipients && (
              <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-lg">
                <CheckCircle2 size={12} className="text-green-400" />
                <span className="text-xs text-green-400 font-medium">{mailMergeRecipients.length} merged recipients</span>
                <button onClick={() => setMailMergeRecipients(null)} className="text-gray-500 hover:text-red-400 ml-1">
                  <X size={10} />
                </button>
              </div>
            )}
            <button 
            onClick={handleClearMemory}
            className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-all flex items-center gap-1.5"
            title="Remove all saved SMTP accounts"
          >
            <Trash2 size={12} /> Clear All SMTPs
          </button>
          <div className={`px-3 py-1 rounded-full text-xs font-medium border ${
            isRunning ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}>
            Status: {status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SMTP Configuration */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-5 space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-cyber-accent uppercase flex items-center gap-2">
                <Plus size={16} /> Add SMTP Account
              </h3>
              <button 
                onClick={() => setNewSmtp({...newSmtp, host: 'smtp.gmail.com', port: 587, secure: false})}
                className="text-[10px] text-gray-400 hover:text-cyber-accent border border-gray-700 hover:border-cyber-accent/50 px-2 py-0.5 rounded transition-all"
              >
                + Gmail Preset
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="SMTP Host (e.g. smtp.gmail.com)"
                value={newSmtp.host}
                onChange={e => setNewSmtp({...newSmtp, host: e.target.value})}
                className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Port"
                  value={newSmtp.port}
                  onChange={e => setNewSmtp({...newSmtp, port: parseInt(e.target.value)})}
                  className="w-24 bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
                />
                <label className="flex items-center gap-2 text-xs text-gray-400 px-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSmtp.secure}
                    onChange={e => setNewSmtp({...newSmtp, secure: e.target.checked})}
                    className="rounded bg-cyber-bg border-gray-700 pointer-events-auto"
                  />
                  SSL/TLS
                </label>
              </div>
              <input
                type="text"
                placeholder="Username / Email"
                value={newSmtp.user}
                onChange={e => setNewSmtp({...newSmtp, user: e.target.value})}
                className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
              />
              <input
                type="password"
                placeholder="Direct Password"
                value={newSmtp.pass}
                onChange={e => setNewSmtp({...newSmtp, pass: e.target.value})}
                className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="From Name"
                  value={newSmtp.fromName}
                  onChange={e => setNewSmtp({...newSmtp, fromName: e.target.value})}
                  className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
                />
                <input
                  type="text"
                  placeholder="From Email"
                  value={newSmtp.fromEmail}
                  onChange={e => setNewSmtp({...newSmtp, fromEmail: e.target.value})}
                  className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
                />
              </div>
              <input
                type="text"
                placeholder="Reply-To (Optional)"
                value={newSmtp.replyTo}
                onChange={e => setNewSmtp({...newSmtp, replyTo: e.target.value})}
                className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text"
              />
              <div className="flex gap-2">
                <GlowButton onClick={handleAddSmtp} className="flex-1">Save SMTP</GlowButton>
                <button 
                  onClick={() => setNewSmtp({ host: '', port: 465, user: '', pass: '', secure: true, fromName: '', fromEmail: '', replyTo: '' })}
                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs hover:bg-gray-700 transition-all"
                >
                  Clear Form
                </button>
              </div>
            </div>
          </div>

          {/* SMTP List */}
          <div className="space-y-3 overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
            <h3 className="text-xs font-bold text-gray-500 uppercase px-1">Active Senders ({smtps.length})</h3>
            {smtps.map(smtp => (
              <div key={smtp.id} className="bg-cyber-card/50 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-all group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cyber-text truncate">{smtp.user}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">{smtp.host}:{smtp.port}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleTestSmtp(smtp)} className="p-1 hover:text-green-400 text-gray-500" title="Test Connection">
                      <Play size={12} fill="currentColor" />
                    </button>
                    <button onClick={() => smtp.id && handleDeleteSmtp(smtp.id)} className="p-1 hover:text-red-400 text-gray-500" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {smtp.replyTo && (
                  <p className="text-[10px] text-cyber-accent/80 italic">Reply-to: {smtp.replyTo}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Campaign Management */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-cyber-card rounded-xl border border-gray-700/50 p-6 space-y-5">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 relative">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Recipients</label>
                    <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setAutoSyncVerified(!autoSyncVerified)}>
                      <span className={`text-[10px] uppercase font-bold tracking-tight ${autoSyncVerified ? 'text-cyber-accent' : 'text-gray-500'}`}>
                        Auto-Sync Verified
                      </span>
                      <div className={`w-6 h-3 rounded-full relative transition-colors ${autoSyncVerified ? 'bg-cyber-accent' : 'bg-gray-700'}`}>
                        <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${autoSyncVerified ? 'right-0.5' : 'left-0.5'}`}></div>
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    {autoSyncVerified && (
                       <div className="absolute inset-0 bg-cyber-bg/80 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-lg border border-cyber-accent/30 z-10">
                          <CheckCircle2 size={24} className="text-cyber-accent mb-1" />
                          <span className="text-xs font-bold text-cyber-accent uppercase tracking-wider text-center px-2">
                             Auto-Sync Active<br/>
                             <span className="text-[9px] text-gray-400">Pulls directly from Verified list on start</span>
                          </span>
                       </div>
                    )}
                    <textarea
                      rows={4}
                      value={recipients}
                      onChange={e => handleRecipientsChange(e.target.value)}
                      placeholder="example@mail.com&#10;test@demo.org"
                      disabled={autoSyncVerified}
                      className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-4 py-3 text-sm text-cyber-text focus:border-cyber-accent/50 focus:outline-none custom-scrollbar"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase px-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => {
                      const val = e.target.value;
                      setSubject(val);
                      window.electronAPI?.saveMailingSetting({ key: 'subject', value: val });
                    }}
                    placeholder="Enter email subject..."
                    className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-4 py-3 text-sm text-cyber-text focus:border-cyber-accent/50 focus:outline-none"
                  />
                  
                  <div className="flex items-center gap-2 px-1 pt-2">
                     <input 
                        type="checkbox" 
                        id="autoRephrase"
                        checked={autoRephrase}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAutoRephrase(val);
                          window.electronAPI?.saveMailingSetting({ key: 'autoRephrase', value: val.toString() });
                        }}
                        className="rounded bg-cyber-bg border-gray-700 text-cyber-accent focus:ring-0"
                     />
                     <label htmlFor="autoRephrase" className="text-xs font-bold text-cyber-accent cursor-pointer uppercase tracking-tight">
                        Enable "Subtle" Auto-Rephrase (Smart Evasion)
                     </label>
                  </div>

                  <div className="p-3 bg-cyber-accent/5 border border-cyber-accent/20 rounded-lg text-[11px] text-gray-400 leading-relaxed mt-2">
                    <Clock size={12} className="inline mr-1 text-cyber-accent" />
                    **Safety Rule**: System sends 1 email per minute across all rotated SMTPs to maximize deliverability and avoid spam filters.
                    <hr className="my-2 border-gray-800" />
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-gray-500">Real-time Spam Risk</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                spamRisk.score > 50 ? 'bg-red-500/20 text-red-400' : 
                                spamRisk.score > 20 ? 'bg-yellow-500/20 text-yellow-400' : 
                                'bg-green-500/20 text-green-400'
                            }`}>
                                {spamRisk.score > 50 ? 'CRITICAL' : spamRisk.score > 20 ? 'MODERATE' : 'CLEAN'}
                            </span>
                        </div>
                        <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-500 ${
                                    spamRisk.score > 50 ? 'bg-red-500' : 
                                    spamRisk.score > 20 ? 'bg-yellow-500' : 
                                    'bg-green-500'
                                }`}
                                style={{ width: `${spamRisk.score}%` }}
                            />
                        </div>
                        {spamRisk.triggers.length > 0 && (
                            <p className="text-[9px] text-gray-500 italic">
                                Triggers: {spamRisk.triggers.join(', ')}
                            </p>
                        )}
                    </div>
                  </div>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Message Body (HTML supported)</label>
                  <div className="flex gap-2">
                    {['{email}', '{domain}', '{date}'].map(tag => (
                      <span key={tag} className="text-[10px] bg-cyber-accent/10 border border-cyber-accent/30 text-cyber-accent px-1.5 py-0.5 rounded font-mono cursor-help" title={`Replaced by recipient's ${tag.slice(1, -1)}`}>
                        {tag}
                      </span>
                    ))}
                    <span className="text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 px-1.5 py-0.5 rounded font-mono cursor-help" title="Randomly picks one: {Hi|Hello}">
                      {`{Spintax|Logic}`}
                    </span>
                  </div>
                </div>
                <RichTextEditor
                  value={body}
                  onChange={val => {
                    setBody(val);
                    window.electronAPI?.saveMailingSetting({ key: 'body', value: val });
                  }}
                  placeholder="Hello, I found your contact at {domain}. My system shows the date is {date}."
                  className="min-h-[300px]"
                />
                <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-gray-800 mt-2">
                   <div className="flex flex-wrap gap-2 items-center">
                     <label className="cursor-pointer text-xs flex items-center gap-1.5 bg-cyber-bg border border-gray-700 hover:border-cyber-accent/50 text-gray-400 px-3 py-1.5 rounded transition-all">
                       <Paperclip size={14} /> Add Attachment
                       <input type="file" multiple className="hidden" onChange={handleAttachment} />
                     </label>
                     {attachments.map((att, i) => (
                       <div key={i} className="flex items-center gap-1 bg-cyber-accent/10 border border-cyber-accent/30 text-cyber-accent px-2 py-1 rounded text-[10px]">
                         <span className="truncate max-w-[150px]" title={att.filename}>{att.filename}</span>
                         <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="hover:text-red-400 ml-1">
                           <Trash2 size={10} />
                         </button>
                       </div>
                     ))}
                   </div>
                </div>
             </div>

             <div className="flex gap-3">
               {!isRunning ? (
                 <GlowButton onClick={handleStartCampaign} className="flex-1 flex justify-center gap-2 items-center py-3">
                   <Play size={18} fill="currentColor" /> Start Mailing Campaign
                 </GlowButton>
               ) : (
                 <GlowButton onClick={handleStopCampaign} variant="secondary" className="flex-1 flex justify-center gap-2 items-center py-3 border-red-500/50 hover:bg-red-500/10 text-red-400">
                   <Square size={18} fill="currentColor" /> Stop Campaign
                 </GlowButton>
               )}
             </div>

             {/* Campaign Report */}
             {campaignReport && !isRunning && (
               <div className="bg-cyber-accent/5 border border-cyber-accent/20 rounded-xl p-4 space-y-3">
                 <div className="flex justify-between items-center">
                   <h4 className="text-xs font-bold text-cyber-accent uppercase tracking-wider">Campaign Report</h4>
                   <button
                     onClick={() => setCampaignReport(null)}
                     className="text-gray-500 hover:text-gray-300 text-xs"
                   >✕</button>
                 </div>
                 <div className="grid grid-cols-4 gap-3 text-center">
                   <div className="bg-cyber-bg rounded-lg p-2">
                     <div className="text-lg font-bold text-white">{campaignReport.total}</div>
                     <div className="text-[10px] text-gray-500 uppercase">Total</div>
                   </div>
                   <div className="bg-cyber-bg rounded-lg p-2">
                     <div className="text-lg font-bold text-green-400">{campaignReport.sent}</div>
                     <div className="text-[10px] text-gray-500 uppercase">Sent</div>
                   </div>
                   <div className="bg-cyber-bg rounded-lg p-2">
                     <div className="text-lg font-bold text-red-400">{campaignReport.failed}</div>
                     <div className="text-[10px] text-gray-500 uppercase">Failed</div>
                   </div>
                   <div className="bg-cyber-bg rounded-lg p-2">
                     <div className="text-lg font-bold text-yellow-400">{campaignReport.skipped}</div>
                     <div className="text-[10px] text-gray-500 uppercase">Skipped</div>
                   </div>
                 </div>
                 {campaignReport.reportPath && (
                   <button
                     onClick={async () => {
                       if (window.electronAPI) {
                         const saved = await (window.electronAPI as any).exportCampaignReport(campaignReport.reportPath);
                         if (saved) alert(`Report saved to: ${saved}`);
                       }
                     }}
                     className="w-full flex items-center justify-center gap-2 py-2 bg-cyber-accent/20 border border-cyber-accent/40 text-cyber-accent rounded-lg text-sm font-semibold hover:bg-cyber-accent/30 transition-colors"
                   >
                     ⬇ Export Campaign Report (CSV)
                   </button>
                 )}
               </div>
             )}
          </div>

          {/* Mailing Status / Logs */}
          <div className="bg-cyber-bg/50 border border-gray-800 rounded-xl overflow-hidden min-h-[300px]">
            <div className="px-4 py-3 border-b border-gray-800 bg-black/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live Delivery Manifest</h3>
                <span className="text-[10px] text-gray-500 uppercase tracking-tighter hidden sm:inline">Last 500 Events</span>
              </div>
              <button 
                onClick={handleClearLogs}
                className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded text-[10px] hover:bg-red-500/20 transition-all flex items-center gap-1"
                title="Clear all delivery logs"
              >
                <Trash2 size={10} /> Clear Logs
              </button>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-cyber-panel/50 text-gray-500 text-xs">
                    <tr>
                      <th className="px-4 py-2 font-medium">To</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Location</th>
                      <th className="px-4 py-2 font-medium">Time</th>
                      <th className="px-4 py-2 font-medium text-right">Details</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-800">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 text-cyber-text text-xs">{log.recipient}</td>
                        <td className="px-4 py-2">
                          {log.status === 'success' ? (
                            <span className="text-green-400 flex items-center gap-1 text-[10px]"><CheckCircle2 size={12} /> Delivered</span>
                          ) : log.status === 'skipped' ? (
                            <span className="text-yellow-400 flex items-center gap-1 text-[10px]"><AlertTriangle size={12} /> Skipped</span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1 text-[10px]"><AlertCircle size={12} /> Failed</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                           <div className="flex items-center gap-2">
                              {log.deliveryLocation === 'Inbox' ? (
                                <span className="text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 border border-green-400/20">
                                   <Mail size={10} /> INBOX
                                </span>
                              ) : log.deliveryLocation === 'Likely Spam' ? (
                                <span className="text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 border border-yellow-500/20">
                                   <AlertTriangle size={10} /> SPAM RISK
                                </span>
                              ) : log.deliveryLocation === 'Spam/Blocked' || log.deliveryLocation === 'Blocked' ? (
                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 border border-red-500/20">
                                   <Trash2 size={10} /> BLOCKED
                                </span>
                              ) : (
                                <span className="text-gray-500 text-[9px]">{log.deliveryLocation || '---'}</span>
                              )}
                           </div>
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-[10px]">{new Date(log.sentAt).toLocaleTimeString()}</td>
                        <td className="px-4 py-2 text-right">
                          {log.error || log.statusDetails ? (
                            <span className="text-[10px] text-red-400/70 truncate inline-block max-w-[150px]" title={log.error || log.statusDetails}>
                                {log.error || log.statusDetails}
                            </span>
                          ) : (
                            <span className="text-gray-600">---</span>
                          )}
                        </td>
                      </tr>
                    ))}
                   {logs.length === 0 && (
                     <tr>
                       <td colSpan={4} className="px-4 py-12 text-center text-gray-600 italic">No campaign activity recorded yet</td>
                     </tr>
                   )}
                 </tbody>
               </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
