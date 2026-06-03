import React, { useState } from 'react';
import { X, Upload, ChevronRight, Eye, Edit2, Check } from 'lucide-react';

interface MailMergeProps {
  onApply: (subject: string, body: string, recipients: { email: string; data: Record<string, string> }[]) => void;
  onClose: () => void;
}

const TEMPLATES = [
  {
    id: 'sales',
    name: 'Sales Proposal',
    subject: 'Special Offer for {{name}} | {{company}}',
    body: `Dear {{name}},

I hope this message finds you well.

My name is [Your Name] from [Your Company]. I am reaching out to you as {{position}} at {{company}} because I believe our solution can make a real difference for your team.

We specialize in [Your Product/Service] and have helped similar organizations achieve [specific result]. I would love to show you how we can help {{company}} as well.

I'd appreciate just 15 minutes of your time for a quick call. Please let me know a convenient time this week.

Looking forward to your response.

Best regards,
[Your Name]
[Your Title]
[Your Company]
[Your Phone]`,
  },
  {
    id: 'job',
    name: 'Job Offer / Recruitment',
    subject: 'Exciting {{position}} Opportunity — {{company}} Is Hiring',
    body: `Dear {{name}},

I hope you are doing well. My name is [Your Name], [HR/Recruitment] at [Your Company].

I am reaching out because we have an exciting opening for a {{position}} role at [Your Company], and based on your profile and experience at {{company}}, I believe you would be a great fit.

Here's a brief overview of the role:
• Position: {{position}}
• Location: [Location / Remote]
• Salary Range: [Salary Range]
• Start Date: [Start Date]

We are looking for someone with [key skills/experience], and your background stands out to us.

If you are open to exploring this opportunity, I would love to schedule a brief call at your convenience. Please reply to this email or reach me at [Your Phone].

Warm regards,
[Your Name]
[HR Manager / Recruiter]
[Your Company]`,
  },
  {
    id: 'investment',
    name: 'Investment Pitch',
    subject: 'Investment Opportunity Tailored for {{name}} | {{company}}',
    body: `Dear {{name}},

I trust this message finds you well. As {{position}} at {{company}}, I believe the opportunity I am about to share will be of great interest to you.

We are [Company Name], a fast-growing [industry] company currently raising [amount] to [purpose]. Our model has already demonstrated [key metric], and we are projecting [growth] over the next [timeframe].

Why this matters for you:
• [Benefit 1]
• [Benefit 2]
• [Projected ROI or outcome]

We have already secured commitments from [notable investors/partners], and we are selectively onboarding a few strategic investors at this stage.

I would be honored to send you our full pitch deck and schedule a 30-minute presentation at your convenience.

Best regards,
[Your Name]
[Your Title]
[Your Company]`,
  },
  {
    id: 'partnership',
    name: 'Partnership Request',
    subject: 'Strategic Partnership Proposal — {{company}} & [Your Company]',
    body: `Dear {{name}},

My name is [Your Name] from [Your Company]. I am writing to you as {{position}} at {{company}} because I see an exciting opportunity for collaboration between our organizations.

{{company}} has built a strong reputation in [industry], and [Your Company] operates in a complementary space. I believe a strategic partnership could benefit both our organizations significantly.

What I envision:
• [Collaboration idea 1]
• [Collaboration idea 2]
• [Mutual benefit for both companies]

We have previously partnered with [similar company] and achieved [result], and I am confident a similar arrangement with {{company}} would be equally rewarding.

I would love to arrange a call or meeting at your earliest convenience to explore this further.

Kind regards,
[Your Name]
[Your Title]
[Your Company]
[Your Phone]`,
  },
  {
    id: 'followup',
    name: 'Follow-Up',
    subject: 'Following Up on My Previous Message — {{name}}',
    body: `Dear {{name}},

I hope you are well. I am following up on the email I sent last week regarding [previous topic].

I understand how busy things can get as {{position}} at {{company}}, so I wanted to make sure my message did not get lost in the inbox.

To briefly recap: [one sentence summary of what you offered or discussed].

I am happy to provide any additional information or answer any questions you may have. If now is not the right time, please let me know and I will follow up at a more convenient moment.

Thank you for your time, {{name}}. I look forward to hearing from you.

Best regards,
[Your Name]
[Your Company]`,
  },
  {
    id: 'coldoutreach',
    name: 'Cold Outreach',
    subject: 'Quick Note for {{name}} at {{company}}',
    body: `Hi {{name}},

I came across {{company}} and was genuinely impressed by [specific thing about their company/work].

I work with [your industry] professionals in roles similar to {{position}} to help them [value proposition — e.g. grow revenue, save time, reduce costs]. We recently helped [client example] achieve [specific result] in [timeframe].

I thought this might be relevant for you given what {{company}} is working on.

Would you be open to a quick 10-minute chat this week to see if there is a fit? No pressure at all — just a friendly conversation.

Thanks for your time,
[Your Name]
[Your Company]
[Your Phone]`,
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    subject: '[Company] Monthly Update — Exclusive for {{name}}',
    body: `Dear {{name}},

Thank you for being a valued contact. Here is our latest update, curated especially for professionals like yourself in the {{position}} space.

━━━━━━━━━━━━━━━━━━━━━━
📌 THIS MONTH'S HIGHLIGHTS
━━━━━━━━━━━━━━━━━━━━━━

🔹 [Update 1 Headline]
[Brief description of update 1]

🔹 [Update 2 Headline]
[Brief description of update 2]

🔹 FEATURED: [Article/Resource Title]
[Brief description — why it matters to your audience]

━━━━━━━━━━━━━━━━━━━━━━

We hope this is useful for you and your team at {{company}}. As always, feel free to reply if you have any questions or feedback.

Until next month,
[Your Name]
[Company Name] Team`,
  },
  {
    id: 'event',
    name: 'Event Invitation',
    subject: "You're Invited, {{name}} — [Event Name] on [Date]",
    body: `Dear {{name}},

On behalf of [Organization], it is my pleasure to invite you to [Event Name], taking place on [Date] at [Venue / Online Platform].

Given your role as {{position}} at {{company}}, we believe this event will be especially valuable for you.

Event Details:
📅 Date: [Date]
🕐 Time: [Time]
📍 Venue: [Location or Link]

The event will feature:
• [Speaker/Session 1]
• [Speaker/Session 2]
• Networking session with industry leaders

Seats are limited. Please RSVP by [RSVP Date] by replying to this email or visiting [Registration Link].

We look forward to welcoming you, {{name}}.

Warm regards,
[Your Name]
[Your Title]
[Organization]`,
  },
  {
    id: 'custom',
    name: '✏️ Write Your Own',
    subject: '',
    body: '',
  },
];

// Common column name mappings
const FIELD_MAP: Record<string, string[]> = {
  name:     ['name', 'full name', 'fullname', 'contact name', 'first name', 'firstname', 'last name', 'lastname', 'person'],
  email:    ['email', 'email address', 'e-mail', 'mail', 'contact email'],
  company:  ['company', 'company name', 'organization', 'org', 'business', 'firm', 'employer'],
  position: ['position', 'title', 'job title', 'role', 'designation', 'occupation', 'profession', 'department'],
  phone:    ['phone', 'telephone', 'mobile', 'cell', 'contact number', 'tel'],
  city:     ['city', 'location', 'town', 'region'],
  country:  ['country', 'nation'],
  website:  ['website', 'url', 'web', 'site'],
  month:    ['month'],
};

function detectFieldMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    const match = columns.find(col =>
      aliases.some(alias => col.toLowerCase().trim() === alias.toLowerCase())
    );
    if (match) mapping[field] = match;
  }
  return mapping;
}

function applyTemplate(template: string, data: Record<string, string>, mapping: Record<string, string>): string {
  let result = template;
  for (const [field, col] of Object.entries(mapping)) {
    const value = data[col] || `{{${field}}}`;
    result = result.replace(new RegExp(`\\{\\{${field}\\}\\}`, 'gi'), value);
  }
  // Also replace any remaining {{col}} with direct column values
  for (const [col, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${col}\\}\\}`, 'gi'), value);
  }
  return result;
}

export const MailMerge: React.FC<MailMergeProps> = ({ onApply, onClose }) => {
  const [step, setStep] = useState<'template' | 'data' | 'preview'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [fileData, setFileData] = useState<{ rows: Record<string, string>[]; columns: string[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelectTemplate = (t: typeof TEMPLATES[0]) => {
    setSelectedTemplate(t);
    setEditedSubject(t.subject);
    setEditedBody(t.body);
    setStep('data');
  };

  const handleImportFile = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await (window.electronAPI as any).parseMailMergeFile();
      if (!result) { setLoading(false); return; }
      if (result.error) { setError(result.error); setLoading(false); return; }
      setFileData(result);
      const detected = detectFieldMapping(result.columns);
      setFieldMapping(detected);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleApply = () => {
    if (!fileData) return;
    const emailCol = fieldMapping.email || fileData.columns.find(c => c.toLowerCase().includes('email')) || '';
    const recipients = fileData.rows
      .filter(row => row[emailCol]?.includes('@'))
      .map(row => ({
        email: row[emailCol],
        data: row,
      }));
    onApply(editedSubject, editedBody, recipients);
    onClose();
  };

  const previewRow = fileData?.rows[previewIndex] || {};
  const previewSubject = applyTemplate(editedSubject, previewRow, fieldMapping);
  const previewBody = applyTemplate(editedBody, previewRow, fieldMapping);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1117] border border-gray-700/50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-cyber-panel">
          <div>
            <h2 className="text-lg font-bold text-cyber-accent">✉️ Mail Merge</h2>
            <p className="text-xs text-gray-500">
              {step === 'template' && 'Step 1 — Choose a template'}
              {step === 'data' && 'Step 2 — Import your contact list'}
              {step === 'preview' && `Step 3 — Preview & Send (${fileData?.rows.length || 0} recipients)`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-black/20 border-b border-gray-800/50">
          {['template', 'data', 'preview'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-cyber-accent' : i < ['template','data','preview'].indexOf(step) ? 'text-green-400' : 'text-gray-600'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${step === s ? 'bg-cyber-accent/20 border-cyber-accent text-cyber-accent' : i < ['template','data','preview'].indexOf(step) ? 'bg-green-400/20 border-green-400 text-green-400' : 'border-gray-700 text-gray-600'}`}>
                  {i < ['template','data','preview'].indexOf(step) ? <Check size={10} /> : i + 1}
                </div>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 2 && <ChevronRight size={12} className="text-gray-700" />}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 1: Template Selection */}
          {step === 'template' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className="bg-[#161b2c] hover:bg-cyber-accent/10 border border-gray-700/50 hover:border-cyber-accent/50 rounded-xl p-4 text-left transition-all group"
                >
                  <div className="text-2xl mb-2">
                    {t.id === 'sales' ? '💼' : t.id === 'job' ? '📄' : t.id === 'investment' ? '💰' : t.id === 'partnership' ? '🤝' : t.id === 'followup' ? '🔄' : t.id === 'coldoutreach' ? '🎯' : t.id === 'newsletter' ? '📰' : t.id === 'event' ? '🎉' : '✏️'}
                  </div>
                  <p className="text-sm font-semibold text-cyber-text group-hover:text-cyber-accent transition-colors">{t.name}</p>
                  {t.id !== 'custom' && <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{t.subject}</p>}
                </button>
              ))}
            </div>
          )}

          {/* STEP 2: Import Data */}
          {step === 'data' && selectedTemplate && (
            <div className="space-y-6">
              {/* Edit template */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Edit Template</h3>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Subject</label>
                  <input
                    value={editedSubject}
                    onChange={e => setEditedSubject(e.target.value)}
                    className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text focus:border-cyber-accent/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Body — use {'{{name}}'}, {'{{company}}'}, {'{{position}}'}, {'{{email}}'} for personalization</label>
                  <textarea
                    value={editedBody}
                    onChange={e => setEditedBody(e.target.value)}
                    rows={12}
                    className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyber-text focus:border-cyber-accent/50 focus:outline-none font-mono resize-none custom-scrollbar"
                  />
                </div>
              </div>

              {/* Import file */}
              <div className="bg-cyber-accent/5 border border-cyber-accent/20 rounded-xl p-5 text-center space-y-3">
                <Upload size={32} className="mx-auto text-cyber-accent/50" />
                <p className="text-sm text-gray-300">Import your contact list (CSV or Excel)</p>
                <p className="text-xs text-gray-500">The file should have columns like: Email, Name, Company, Position, etc.</p>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={handleImportFile}
                  disabled={loading}
                  className="px-6 py-2.5 bg-cyber-accent/20 border border-cyber-accent/40 text-cyber-accent rounded-lg text-sm font-semibold hover:bg-cyber-accent/30 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Importing...' : '📂 Import CSV / Excel File'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 'preview' && fileData && (
            <div className="space-y-4">
              {/* Field mapping */}
              <div className="bg-[#161b2c] rounded-xl border border-gray-700/50 p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Auto-detected Column Mapping</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.keys(FIELD_MAP).map(field => (
                    <div key={field}>
                      <label className="text-[10px] text-gray-500 uppercase mb-1 block">{`{{${field}}}`}</label>
                      <select
                        value={fieldMapping[field] || ''}
                        onChange={e => setFieldMapping({ ...fieldMapping, [field]: e.target.value })}
                        className="w-full bg-cyber-bg border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-cyber-text focus:border-cyber-accent/50 focus:outline-none"
                      >
                        <option value="">— not mapped —</option>
                        {fileData.columns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-[#161b2c] rounded-xl border border-gray-700/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Eye size={12} /> Preview
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} disabled={previewIndex === 0} className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30">◀</button>
                    <span className="text-xs text-gray-400">Row {previewIndex + 1} of {fileData.rows.length}</span>
                    <button onClick={() => setPreviewIndex(Math.min(fileData.rows.length - 1, previewIndex + 1))} disabled={previewIndex === fileData.rows.length - 1} className="px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30">▶</button>
                  </div>
                </div>
                <div className="bg-cyber-bg rounded-lg p-3 space-y-2">
                  <p className="text-xs text-gray-500 uppercase font-bold">Subject</p>
                  <p className="text-sm text-cyber-text">{previewSubject}</p>
                </div>
                <div className="bg-cyber-bg rounded-lg p-3 space-y-2">
                  <p className="text-xs text-gray-500 uppercase font-bold">Body</p>
                  <pre className="text-sm text-cyber-text whitespace-pre-wrap font-sans">{previewBody}</pre>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-green-400">Ready to send</p>
                  <p className="text-xs text-gray-400">{fileData.rows.filter(r => {
                    const emailCol = fieldMapping.email || fileData.columns.find(c => c.toLowerCase().includes('email')) || '';
                    return r[emailCol]?.includes('@');
                  }).length} valid recipients found</p>
                </div>
                <button
                  onClick={handleApply}
                  className="px-6 py-2.5 bg-green-500/20 border border-green-500/40 text-green-400 rounded-lg text-sm font-bold hover:bg-green-500/30 transition-colors"
                >
                  ✉️ Apply & Send Campaign
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t border-gray-800 flex justify-between">
          <button
            onClick={() => {
              if (step === 'data') setStep('template');
              else if (step === 'preview') setStep('data');
            }}
            className={`px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors ${step === 'template' ? 'invisible' : ''}`}
          >
            ← Back
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
