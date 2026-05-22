import React, { useState, useEffect, useRef } from 'react';
import { GlowButton } from '../components/GlowButton';
import { LiveFeed } from '../components/LiveFeed';
import { DataTable } from '../components/DataTable';
import { ExtractionEvent, EmailRecord } from '../types';
import { Search, Globe, ChevronLeft, ChevronRight, RotateCw, Mail, Layout as LayoutIcon } from 'lucide-react';

export const InteractiveBrowserScraper: React.FC = () => {
  const [url, setUrl] = useState('https://www.google.com');
  const [currentUrl, setCurrentUrl] = useState('https://www.google.com');
  const [isExtracting, setIsExtracting] = useState(false);
  const [events, setEvents] = useState<ExtractionEvent[]>([]);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [isBrowserActive, setIsBrowserActive] = useState(false);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    loadEmails();
    
    // Listen for events from main process if needed
    let cleanup: (() => void) | undefined;
    if (window.electronAPI) {
      cleanup = window.electronAPI.onExtractionEvent((_event, data) => {
        setEvents((prev) => [...prev.slice(-200), data]);
        if (data.type === 'email-found' && data.data) {
          setEmails((prev) => [data.data, ...prev]);
        }
      });
    }

    const webview = webviewRef.current;
    if (webview) {
      const handleNavigate = (e: any) => {
        setCurrentUrl(e.url);
        setUrl(e.url);
        setIsBrowserActive(true); // Active once navigated
      };
      webview.addEventListener('did-navigate', handleNavigate);
      webview.addEventListener('did-navigate-in-page', handleNavigate);
      return () => {
        webview.removeEventListener('did-navigate', handleNavigate);
        webview.removeEventListener('did-navigate-in-page', handleNavigate);
        cleanup?.();
      };
    }
    return () => cleanup?.();
  }, []);

  const loadEmails = async () => {
    try {
      if (window.electronAPI) {
        const e = await window.electronAPI.getEmails();
        setEmails(e);
      }
    } catch {}
  };

  const handleGo = () => {
    let targetUrl = url.trim();
    if (!targetUrl) return;

    // Check if it's a URL or a search query
    const isUrl = targetUrl.includes('.') && !targetUrl.includes(' ');
    
    if (isUrl) {
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `https://${targetUrl}`;
        }
    } else {
        // Search query
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
    }

    setCurrentUrl(targetUrl);
    setIsBrowserActive(true);
    if (webviewRef.current) {
        webviewRef.current.loadURL(targetUrl);
    }
  };

  const quickLinks = [
    { name: 'Google', url: 'https://www.google.com' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/login' },
    { name: 'Facebook', url: 'https://www.facebook.com' },
    { name: 'Justdial', url: 'https://www.justdial.com' },
    { name: 'IndiaMART', url: 'https://www.indiamart.com' },
    { name: 'Instagram', url: 'https://www.instagram.com' },
  ];

  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const autoPilotInterval = useRef<any>(null);

  useEffect(() => {
    if (isAutoPilot) {
        startAutoPilot();
    } else {
        stopAutoPilot();
    }
    return () => stopAutoPilot();
  }, [isAutoPilot]);

  const startAutoPilot = () => {
    setEvents(prev => [...prev, {
        type: 'started',
        message: 'Auto-Pilot Activated: Scroller & Clicker Running',
        timestamp: new Date().toISOString()
    }]);

    autoPilotInterval.current = setInterval(async () => {
        if (!webviewRef.current || !isAutoPilot) return;

        try {
            // 1. Auto Scroll & Click Next
            const automationScript = `
                (() => {
                    // 1. Scroll down
                    window.scrollBy({ top: 800, behavior: 'smooth' });

                    // 2. Automate "View Phone" or "Contact" buttons (common in IndiaMART/Justdial)
                    const contactSelectors = [
                        '.cnt_fluid', '.view-contact', '.contact-detail', 
                        '[id^="contact_"]', '.m-lst-itm__btn', '.clck-act',
                        'span:contains("View Mobile")', 'button:contains("Contact")'
                    ];
                    
                    document.querySelectorAll(contactSelectors.join(',')).forEach(el => {
                        if (el instanceof HTMLElement && el.innerText.toLowerCase().includes('phone') || el.innerText.toLowerCase().includes('contact')) {
                             // el.click(); // Optional: might trigger too many popups, but good for detailed extraction
                        }
                    });

                    // 3. Look for "Next" or "Load More" buttons
                    const selectors = [
                        'a#pnnext', // Google Next
                        'a.next', 'li.next a', '.pagination-next',
                        'button.load-more', '.js-load-more',
                        'a:contains("Next")', 'span:contains("Next")',
                        'button:contains("More")', 'span:contains("Show more")',
                        '.infinite-scroll-component__outer-container + button',
                        'a[aria-label="Next"]', 'li.active + li a'
                    ];

                    let clicked = false;
                    const buttons = Array.from(document.querySelectorAll('button, a, span, li'));
                    const targetText = /next|load more|show more|view more|more results|forward/i;
                    
                    const btn = buttons.find(b => {
                        const style = window.getComputedStyle(b);
                        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                        const text = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
                        return targetText.test(text);
                    });

                    if (btn && btn instanceof HTMLElement) {
                        try {
                            btn.click();
                            clicked = true;
                        } catch(e) {}
                    }

                    return { scrolled: true, clicked };
                })()
            `;
            await webviewRef.current.executeJavaScript(automationScript);

            // 2. Periodic Extraction
            await handleExtract();
        } catch (err) {
            console.error('Auto-pilot loop error:', err);
        }
    }, 8000); // Run every 8 seconds
  };

  const stopAutoPilot = () => {
    if (autoPilotInterval.current) {
        clearInterval(autoPilotInterval.current);
        autoPilotInterval.current = null;
    }
  };

  const handleExtract = async () => {
    if (!webviewRef.current) return;
    setIsExtracting(true);
    try {
      // Improved extraction script
      const script = `
        (() => {
          const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
          const content = document.documentElement.outerHTML + ' ' + document.body.innerText;
          const emails = new Set(content.match(emailRegex) || []);
          
          // Also check mailto links
          document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
            const email = a.href.replace('mailto:', '').split('?')[0];
            if (email) emails.add(email);
          });

          return {
            url: window.location.href,
            domain: window.location.hostname,
            emails: Array.from(emails)
          };
        })()
      `;
      
      const result = await webviewRef.current.executeJavaScript(script);
      
      if (result && result.emails.length > 0) {
        // ACTUALLY add emails to database
        if (window.electronAPI) {
          await window.electronAPI.addManualEmails({
            emails: result.emails,
            sourcePage: result.url,
            domain: result.domain
          });
        }
        
        setEvents((prev) => [...prev, {
          type: 'complete',
          message: `Update: Found ${result.emails.length} emails.`,
          timestamp: new Date().toISOString()
        }]);
        
        // Refresh list
        loadEmails();
      }
    } catch (err: any) {
      if (!isAutoPilot) {
          setEvents((prev) => [...prev, {
            type: 'error',
            message: 'Extraction failed: ' + err.message,
            timestamp: new Date().toISOString()
          }]);
      }
    }
    setIsExtracting(false);
  };

  return (
    <div className={`h-full flex flex-col transition-all duration-700 relative ${isBrowserActive ? 'p-0' : 'space-y-4'}`}>
      <div className={`transition-all duration-700 ${isBrowserActive ? 'absolute top-16 right-6 z-[100]' : 'flex justify-between items-start'}`}>
        <div className={isBrowserActive ? 'hidden' : 'block'}>
          <h1 className="text-2xl font-bold text-cyber-text flex items-center gap-2">
            <Globe className="text-cyber-accent" />
            Interactive Search & Login
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Search for leads, **login to your accounts**, and extract emails directly from any page.
          </p>
        </div>
        <div className={`flex flex-col items-end gap-2 ${isBrowserActive ? 'bg-black/80 px-4 py-3 rounded-2xl border border-white/20 backdrop-blur-xl shadow-2xl scale-110 shadow-glow-cyan/20' : ''}`}>
            <div className="flex gap-2">
                <button
                    onClick={() => setIsAutoPilot(!isAutoPilot)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border ${
                        isAutoPilot 
                        ? 'bg-cyber-accent/20 border-cyber-accent text-cyber-accent animate-pulse shadow-glow-cyan/50' 
                        : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/30'
                    }`}
                >
                    <div className={`w-2 h-2 rounded-full ${isAutoPilot ? 'bg-cyber-accent' : 'bg-gray-700'}`} />
                    {isAutoPilot ? 'AUTO-PILOT ON' : 'AUTO-PILOT OFF'}
                </button>
                <GlowButton 
                    onClick={handleExtract} 
                    disabled={isExtracting} 
                    variant="primary"
                    className={`${isBrowserActive ? 'px-6 py-2 text-xs' : 'px-8'} flex items-center gap-2 shadow-glow-cyan`}
                >
                    <Mail size={16} className={isExtracting ? 'animate-spin' : ''} />
                    {isExtracting ? 'Extracting...' : 'Extract leads Now'}
                </GlowButton>
            </div>
            {emails.length > 0 && (
                <span className="text-[10px] text-cyber-accent font-mono font-bold tracking-widest animate-pulse">
                    {emails.length} SECURED
                </span>
            )}
        </div>
      </div>

      <div className={`flex items-center gap-2 transition-all duration-700 ${isBrowserActive ? 'absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 px-4 py-2 rounded-full border border-white/20 backdrop-blur-lg scale-90' : 'overflow-x-auto pb-1 no-scrollbar'}`}>
          <span className={`text-[10px] font-bold text-gray-500 uppercase tracking-tighter whitespace-nowrap mr-2 ${isBrowserActive ? 'hidden' : ''}`}>Quick Login / Search:</span>
          {quickLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => {
                    setUrl(link.url);
                    setCurrentUrl(link.url);
                    setIsBrowserActive(true);
                    webviewRef.current?.loadURL(link.url);
                }}
                className={`px-3 py-1 bg-gray-900/50 border border-gray-800 rounded-full text-xs text-gray-400 hover:text-cyber-accent hover:border-cyber-accent/50 transition-all whitespace-nowrap ${isBrowserActive ? 'text-[10px] opacity-60 hover:opacity-100' : ''}`}
              >
                {link.name}
              </button>
          ))}
      </div>

      {/* Browser UI (Main View) */}
      <div className={`flex-1 flex flex-col transition-all duration-700 border border-gray-700/50 overflow-hidden shadow-2xl ${isBrowserActive ? 'rounded-none border-none relative z-0' : 'bg-cyber-card rounded-xl'}`}>
        {!isBrowserActive && (
            <div className="absolute inset-0 bg-cyber-bg/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 rounded-full bg-cyber-accent/10 border border-cyber-accent/20 flex items-center justify-center mb-6 animate-pulse">
                    <Globe className="text-cyber-accent w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold text-cyber-text mb-2">Interactive Browser Ready</h2>
                <p className="text-sm text-gray-500 max-w-md mb-8">
                    Enter a URL or search term below to start browsing. You can log in to any site and extract emails with one click.
                </p>
                <div className="w-full max-w-lg flex gap-2">
                    <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGo()}
                        className="flex-1 bg-cyber-bg border border-gray-700 rounded-xl px-4 py-3 text-sm text-cyber-text focus:outline-none focus:border-cyber-accent/50 shadow-2xl"
                        placeholder="Enter domain (e.g. linkedin.com) or search term..."
                    />
                    <GlowButton onClick={handleGo} variant="primary" className="px-6">Go Browser</GlowButton>
                </div>
            </div>
        )}

        {/* Toolbar (Floats when active) */}
        <div className={`transition-all duration-500 p-2.5 flex items-center gap-3 border-b border-gray-800 backdrop-blur-md ${isBrowserActive ? 'absolute top-2 left-1/2 -translate-x-1/2 w-[85%] lg:w-[60%] z-[100] bg-black/80 rounded-full border border-white/10 shadow-3xl' : 'bg-gray-900/80'}`}>
            <div className="flex items-center gap-1 pr-2 border-r border-gray-800">
                <button 
                    onClick={() => webviewRef.current?.canGoBack() && webviewRef.current.goBack()}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                >
                    <ChevronLeft size={18} />
                </button>
                <button 
                    onClick={() => webviewRef.current?.canGoForward() && webviewRef.current.goForward()}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                >
                    <ChevronRight size={18} />
                </button>
                <button 
                    onClick={() => webviewRef.current?.reload()}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                >
                    <RotateCw size={14} />
                </button>
            </div>
            
            <div className="flex-1 flex items-center bg-black/40 rounded-xl px-4 py-1.5 border border-gray-700/50 focus-within:border-cyber-accent/50 transition-all group">
                <Search size={14} className="text-gray-500 mr-2 group-focus-within:text-cyber-accent" />
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGo()}
                    className="flex-1 bg-transparent border-none text-xs text-cyber-text placeholder:text-gray-600 focus:outline-none font-mono"
                    placeholder="Search or enter URL..."
                />
            </div>
            
            <div className="flex items-center gap-2">
                <button 
                    onClick={handleGo}
                    className="bg-cyber-accent rounded-lg p-2 text-black hover:scale-105 active:scale-95 transition-all shadow-glow-cyan"
                >
                    <Globe size={16} />
                </button>
                
                {isBrowserActive && (
                     <button 
                        onClick={() => setIsBrowserActive(false)}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/40"
                        title="Close Browser Area"
                    >
                        <LayoutIcon size={16} />
                    </button>
                )}
            </div>
        </div>

        {/* Webview Area */}
        <div className="flex-1 relative bg-white">
            <webview 
                ref={webviewRef}
                src={currentUrl}
                className="absolute inset-0 w-full h-full"
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                allowpopups={true}
            />
        </div>
      </div>

      {/* Floating Bottom Panel (Hidden or minimized when active) */}
      <div className={`transition-all duration-700 ${isBrowserActive ? 'absolute bottom-2 left-2 z-50 w-72 h-40 opacity-40 hover:opacity-100 flex flex-col gap-2' : 'grid grid-cols-1 lg:grid-cols-2 gap-4 h-48 shrink-0'}`}>
        <LiveFeed events={events} maxHeight="100%" />
        {!isBrowserActive && (
            <div className="flex flex-col bg-cyber-card/30 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm">
                <div className="px-4 py-2 bg-gradient-to-r from-gray-900/80 to-transparent border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Mail size={14} className="text-cyber-accent" />
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Recent Findings</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <DataTable emails={emails.slice(0, 5)} />
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
