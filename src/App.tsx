import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Calendar, HardDrive, MessageSquare, Activity, Search, Hash, CheckCircle, AlertCircle, FolderDown, LogOut, XCircle, FolderOpen, Smartphone, BarChart3, Eye, Trash2, Clock, Settings, Sparkles } from 'lucide-react'; import ReportView from './ReportView';
import type { ChannelData } from './reportUtils';

interface Channel {
  id: string;
  name: string;
  selected: boolean;
}

interface ExportStatus {
  currentChannel: string;
  totalChannels: number;
  completedChannels: number;
  phase: 'idle' | 'navigating' | 'scrolling' | 'extracting' | 'saving' | 'completed' | 'error';
  progress: number;
  message?: string;
  exportDir?: string;
}

interface SavedReportSummary {
  id: string;
  serverName: string;
  createdAt: string;
  dateRange: { start: string; end: string };
  channelCount: number;
  totalMessages: number;
}

function App() {
  const [datePreset, setDatePreset] = useState('1_week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<'html' | 'csv'>('html');
  const [isScanning, setIsScanning] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

  // App Loading State
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  useEffect(() => {
    // 3.2 seconds total duration. We set isAppLoading false first to trigger fade out,
    // then completely remove it from the DOM after the transition is done.
    const loadingTimer = setTimeout(() => {
      setIsAppLoading(false);
      setTimeout(() => setShowLoadingScreen(false), 500); // Wait for 0.5s CSS fade transition
    }, 2700);

    return () => clearTimeout(loadingTimer);
  }, []);

  // Load Settings
  useEffect(() => {
    if (!(window as any).electronAPI) return;
    const loadSettings = async () => {
      try {
        const res = await (window as any).electronAPI.invoke('load-settings');
        if (res?.success && res.settings) {
          if (res.settings.geminiApiKey) setGeminiApiKey(res.settings.geminiApiKey);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, []);

  const [status, setStatus] = useState<ExportStatus>({
    currentChannel: '',
    totalChannels: 0,
    completedChannels: 0,
    phase: 'idle',
    progress: 0
  });

  const webviewRef = useRef<HTMLWebViewElement>(null);
  const cancelExportRef = useRef<boolean>(false);
  const [exportData, setExportData] = useState<ChannelData[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReportSummary[]>([]);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);

  const loadSavedReports = useCallback(async () => {
    if (!(window as any).electronAPI) return;
    try {
      const result = await (window as any).electronAPI.invoke('list-reports');
      if (result?.success) setSavedReports(result.reports || []);
    } catch (e) {
      console.error('Failed to load saved reports', e);
    }
  }, []);

  useEffect(() => {
    loadSavedReports();
  }, [loadSavedReports]);

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to log out and clear all Discord session data?")) return;
    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.invoke('clear-session');
        if (webviewRef.current) {
          (webviewRef.current as any).reload();
        }
      }
    } catch (e) {
      console.error("Failed to clear session", e);
    }
  };

  const openExportFolder = async (dir: string) => {
    if ((window as any).electronAPI) {
      await (window as any).electronAPI.invoke('open-folder', dir);
    }
  };

  const getScanScript = () => {
    return [
      '(async () => {',
      '  try {',
      '    const currentPath = window.location.pathname;',
      '    const parts = currentPath.split("/");',
      '    if (parts.length < 3 || parts[1] !== "channels") return { error: "Not in a server. Please open a server first." };',
      '    const serverId = parts[2];',
      '    if (serverId === "@me") return { error: "DMs are not supported. Please open a server." };',
      '    let scrollContainer = null;',
      '    const nav = document.querySelector("nav[aria-label=\\"Channels\\"]");',
      '    if (nav) {',
      '      const scrollers = nav.querySelectorAll("[class*=\\"scroller\\"]");',
      '      for (const s of scrollers) {',
      '        if (s.scrollHeight > s.clientHeight) { scrollContainer = s; break; }',
      '      }',
      '      if (!scrollContainer && scrollers.length > 0) scrollContainer = scrollers[0];',
      '    }',
      '    if (!scrollContainer) {',
      '      const allScrollers = document.querySelectorAll("[class*=\\"scroller\\"]");',
      '      for (const s of allScrollers) {',
      '        if (s.querySelector("a[href^=\\"/channels/" + serverId + "/\\"]")) {',
      '          scrollContainer = s; break;',
      '        }',
      '      }',
      '    }',
      '    const result = [];',
      '    const seen = new Set();',
      '    const extractVisible = () => {',
      '      const links = document.querySelectorAll("a[href^=\\"/channels/" + serverId + "/\\"]");',
      '      links.forEach(a => {',
      '        const href = a.getAttribute("href");',
      '        if (!href) return;',
      '        const hrefParts = href.split("/");',
      '        const id = hrefParts[hrefParts.length - 1];',
      '        if (!id || seen.has(id)) return;',
      '        seen.add(id);',
      '        let name = "";',
      '        const ariaLabel = a.getAttribute("aria-label");',
      '        if (ariaLabel) { name = ariaLabel.replace(/ \\(.*\\)$/, ""); }',
      '        if (!name) { name = a.innerText.trim(); }',
      '        if (!name && a.textContent) { name = a.textContent.trim(); }',
      '        name = name.replace(/^#\\s*/, "").trim();',
      '        if (name) { result.push({ id: id, name: name, selected: true }); }',
      '      });',
      '    };',
      '    if (scrollContainer) {',
      '      scrollContainer.scrollTop = 0;',
      '      await new Promise(r => setTimeout(r, 500));',
      '      extractVisible();',
      '      let prevTop = -1;',
      '      let stuck = 0;',
      '      while (stuck < 3) {',
      '        prevTop = scrollContainer.scrollTop;',
      '        scrollContainer.scrollTop += 600;',
      '        await new Promise(r => setTimeout(r, 400));',
      '        extractVisible();',
      '        if (scrollContainer.scrollTop === prevTop) { stuck++; } else { stuck = 0; }',
      '      }',
      '    } else {',
      '      extractVisible();',
      '    }',
      '    return { channels: result };',
      '  } catch(e) {',
      '    return { error: e.message || "Unknown error" };',
      '  }',
      '})();',
    ].join('\n');
  };

  const getExtractionChunkScript = (startTime: number, endTime: number) => {
    return [
      '(async () => {',
      '  try {',
      '    const startTimestamp = ' + startTime + ';',
      '    const endTimestamp = ' + endTime + ';',
      '    const DISCORD_EPOCH = 1420070400000;',
      '',
      '    window.__exporterState = window.__exporterState || {',
      '      messages: [],',
      '      seenIds: new Set(),',
      '      reachedStart: false,',
      '      stuckCount: 0,',
      '      oldestTimestampReached: endTimestamp',
      '    };',
      '    const state = window.__exporterState;',
      '',
      '    if (state.reachedStart || state.stuckCount >= 15) {',
      '      const finalMsgs = state.messages;',
      '      window.__exporterState = null;',
      '      return { isDone: true, messages: finalMsgs };',
      '    }',
      '',
      '    // Find the OUTER scrollable container (the one with overflow)',
      '    let outerScroller = null;',
      '    const chatArea = document.querySelector("[class*=\\"chatContent\\"]") || document.querySelector("main");',
      '    if (chatArea) {',
      '      const candidates = chatArea.querySelectorAll("[class*=\\"scroller\\"]");',
      '      for (const el of candidates) {',
      '        const style = window.getComputedStyle(el);',
      '        if ((style.overflowY === "scroll" || style.overflowY === "auto") && el.scrollHeight > el.clientHeight) {',
      '          outerScroller = el;',
      '          break;',
      '        }',
      '      }',
      '    }',
      '    if (!outerScroller) {',
      '      // Fallback: try parent of scrollerInner',
      '      const inner = document.querySelector("[class*=\\"scrollerInner\\"]");',
      '      if (inner && inner.parentElement) outerScroller = inner.parentElement;',
      '    }',
      '    if (!outerScroller) return { error: "Could not find message scroller." };',
      '',
      '    function parseSnowflakeTimestamp(snowflakeStr) {',
      '      try {',
      '        const n = BigInt(snowflakeStr);',
      '        return Number((n >> 22n) + 1420070400000n);',
      '      } catch(e) { return 0; }',
      '    }',
      '',
      '    const extract = () => {',
      '      const nodes = document.querySelectorAll("[id^=\\"chat-messages-\\"]");',
      '      for (const node of nodes) {',
      '        const fullId = node.id.replace("chat-messages-", "");',
      '        if (state.seenIds.has(fullId)) continue;',
      '',
      '        const idParts = fullId.split("-");',
      '        const msgIdStr = idParts[idParts.length - 1];',
      '        const timestamp = parseSnowflakeTimestamp(msgIdStr);',
      '        if (timestamp === 0) continue;',
      '',
      '        if (timestamp < startTimestamp) { state.reachedStart = true; continue; }',
      '        if (timestamp > endTimestamp) continue;',
      '',
      '        if (timestamp < state.oldestTimestampReached) state.oldestTimestampReached = timestamp;',
      '        state.seenIds.add(fullId);',
      '',
      '        // 1. Extract reply info FIRST (it appears before the main content in DOM)',
      '        let replyText = "";',
      '        let replyAuthor = "";',
      '        const replyNode = node.querySelector("[class*=\\"repliedMessage\\"]");',
      '        if (replyNode) {',
      '           const rAuth = replyNode.querySelector("[class*=\\"username\\"], span");',
      '           if (rAuth) replyAuthor = rAuth.innerText || rAuth.textContent || "";',
      '           const rContent = replyNode.querySelector("[class*=\\"repliedTextContent\\"], [class*=\\"repliedTextPreview\\"], [class*=\\"messageContent\\"]");',
      '           if (rContent) replyText = rContent.innerText || rContent.textContent || "";',
      '        }',
      '',
      '        // 2. Get author from the CONTENTS section, skipping the reply area',
      '        //    Discord structure: repliedMessage (reply ref) -> contents (actual msg)',
      '        let author = "Unknown";',
      '        const contentsSection = node.querySelector("[class*=\\"contents\\"]");',
      '        if (contentsSection) {',
      '          const authorNode = contentsSection.querySelector("[class*=\\"username\\"]");',
      '          if (authorNode) author = authorNode.innerText || authorNode.textContent || "Unknown";',
      '        } else {',
      '          // Fallback: find all username elements and pick the last one (main message author)',
      '          const allUsernames = node.querySelectorAll("[class*=\\"username\\"]");',
      '          if (allUsernames.length > 0) {',
      '            const lastUsername = allUsernames[allUsernames.length - 1];',
      '            // Make sure it is not inside a reply',
      '            if (!lastUsername.closest("[class*=\\"repliedMessage\\"]")) author = lastUsername.innerText || lastUsername.textContent || "Unknown";',
      '            else if (allUsernames.length > 1) author = allUsernames[allUsernames.length - 1].innerText || allUsernames[allUsernames.length - 1].textContent || "Unknown";',
      '          }',
      '        }',
      '',
      '        // 3. Get message content - SKIP any content nodes inside the reply reference',
      '        let contentNode = null;',
      '        const allContentNodes = node.querySelectorAll("[id^=\\"message-content-\\"]");',
      '        for (const cn of allContentNodes) {',
      '          if (!cn.closest("[class*=\\"repliedMessage\\"]")) { contentNode = cn; break; }',
      '        }',
      '        const timestampNode = node.querySelector("[class*=\\"contents\\"] time") || node.querySelector("time");',
      '',
      '        // 4. Get attachments',
      '        const attachments = [];',
      '        node.querySelectorAll("a").forEach(a => {',
      '          if (a.href && (a.href.includes("cdn.discordapp.com/attachments/") || a.href.includes("media.discordapp.net"))) {',
      '            if (!a.closest("[class*=\\"repliedMessage\\"]")) attachments.push(a.href);',
      '          }',
      '        });',
      '        node.querySelectorAll("img").forEach(img => {',
      '          if (img.src && (img.src.includes("cdn.discordapp.com/attachments/") || img.src.includes("media.discordapp.net"))) {',
      '            if (!img.closest("[class*=\\"repliedMessage\\"]") && !attachments.includes(img.src)) attachments.push(img.src);',
      '          }',
      '        });',
      '',
      '        state.messages.push({',
      '          id: fullId,',
      '          timestamp,',
      '          author,',
      '          content: contentNode ? (contentNode.innerText || contentNode.textContent || "") : "",',
      '          replyAuthor,',
      '          replyText,',
      '          formattedTime: timestampNode ? timestampNode.getAttribute("datetime") : new Date(timestamp).toISOString(),',
      '          attachments',
      '        });',
      '      }',
      '    };',
      '',
      '    // Extract current visible messages',
      '    extract();',
      '',
      '    // Scroll up incrementally: 8 scroll steps per chunk for better coverage',
      '    const scrollStep = outerScroller.clientHeight * 0.6;',
      '    for (let i = 0; i < 8; i++) {',
      '      if (state.reachedStart) break;',
      '      const prevScrollTop = outerScroller.scrollTop;',
      '      outerScroller.scrollTop = Math.max(0, outerScroller.scrollTop - scrollStep);',
      '',
      '      await new Promise(r => setTimeout(r, 1000));',
      '      extract();',
      '',
      '      // Check if we actually moved',
      '      if (Math.abs(outerScroller.scrollTop - prevScrollTop) < 2) {',
      '        // Might be at the top; wait for Discord to load more history',
      '        await new Promise(r => setTimeout(r, 2000));',
      '        extract();',
      '        if (Math.abs(outerScroller.scrollTop - prevScrollTop) < 2 && outerScroller.scrollTop <= 100) {',
      '          state.stuckCount++;',
      '        }',
      '      } else {',
      '        state.stuckCount = 0;',
      '      }',
      '    }',
      '',
      '    return {',
      '      isDone: false,',
      '      oldestTimestamp: state.oldestTimestampReached,',
      '      messagesExtracted: state.messages.length',
      '    };',
      '  } catch(e) {',
      '    return { error: e.message || "Unknown error during extraction" };',
      '  }',
      '})();',
    ].join('\n');
  };

  const handleScanChannels = async () => {
    setIsScanning(true);
    if (!webviewRef.current) return;
    try {
      const response = await (webviewRef.current as any).executeJavaScript(getScanScript());
      if (response?.error) alert(response.error);
      else if (response?.channels) setChannels(response.channels);
    } catch (err: any) {
      alert("Error scanning: " + err.message);
    }
    setIsScanning(false);
  };

  const toggleChannel = (id: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, selected: !ch.selected } : ch
    ));
  };

  const toggleAllChannels = (selectAll: boolean) => {
    setChannels(prev => prev.map(ch => ({ ...ch, selected: selectAll })));
  };

  const handleExport = async () => {
    const selected = channels.filter(c => c.selected);
    if (selected.length === 0) return;

    let startTs: number;
    let endTs: number = endDate ? new Date(endDate).getTime() : Date.now();

    if (datePreset === 'custom') {
      if (!startDate) {
        alert("Please select a Start Date for the custom range.");
        return;
      }
      startTs = new Date(startDate).getTime();
    } else {
      const msPerDay = 24 * 60 * 60 * 1000;
      let days = 7;
      if (datePreset === '1_day') days = 1;
      else if (datePreset === '1_month') days = 30;
      else if (datePreset === '3_months') days = 90;
      startTs = endTs - (days * msPerDay);
    }

    // Check if electronAPI is available
    if (!(window as any).electronAPI) {
      alert("Export requires the Electron desktop wrapper. The IPC bridge is not available. Please restart the app with 'npm run dev'.");
      return;
    }

    let dir: string | null = null;
    try {
      dir = await (window as any).electronAPI.invoke('select-directory');
    } catch (err: any) {
      alert("Failed to open directory picker: " + err.message);
      return;
    }
    if (!dir) return; // User cancelled

    setStatus({
      currentChannel: '',
      totalChannels: selected.length,
      completedChannels: 0,
      phase: 'navigating',
      progress: 0,
      exportDir: dir
    });

    cancelExportRef.current = false;
    const collectedData: ChannelData[] = [];

    try {
      for (let i = 0; i < selected.length; i++) {
        const channel = selected[i];
        setStatus(prev => ({ ...prev, currentChannel: channel.name, phase: 'navigating', progress: (i / selected.length) * 100 }));

        // Navigate to channel
        const webview = webviewRef.current as any;
        const currentUrl = await webview.getURL();
        const serverId = currentUrl.split('/')[4];
        await webview.loadURL('https://discord.com/channels/' + serverId + '/' + channel.id);
        await new Promise(r => setTimeout(r, 3000));

        setStatus(prev => ({ ...prev, phase: 'scrolling' }));

        // Reset webview state just in case
        await webview.executeJavaScript('window.__exporterState = null;');

        let msgs = [];
        const timeRange = endTs - startTs;

        while (true) {
          if (cancelExportRef.current) throw new Error('Export cancelled by user.');

          const response = await webview.executeJavaScript(getExtractionChunkScript(startTs, endTs));

          if (response?.error) {
            throw new Error('In channel ' + channel.name + ': ' + response.error);
          }

          if (response.isDone) {
            msgs = response.messages || [];
            break;
          }

          // Update Progress
          let chanProgress = 0;
          if (timeRange > 0) {
            chanProgress = (endTs - response.oldestTimestamp) / timeRange;
            if (chanProgress > 1) chanProgress = 1;
            if (chanProgress < 0) chanProgress = 0;
          }
          const globalProgress = ((i + chanProgress) / selected.length) * 100;

          setStatus(prev => ({
            ...prev,
            progress: globalProgress,
            message: 'Found ' + response.messagesExtracted + ' messages so far...'
          }));
        }

        msgs = msgs.sort((a: any, b: any) => a.timestamp - b.timestamp);
        setStatus(prev => ({ ...prev, phase: 'saving', message: 'Saving ' + msgs.length + ' messages from #' + channel.name + '...' }));

        if (cancelExportRef.current) throw new Error('Export cancelled by user.');

        const channelDir = dir + '/' + channel.name + '_' + channel.id;
        const imagesDir = channelDir + '/images';

        for (const msg of msgs) {
          for (let j = 0; j < msg.attachments.length; j++) {
            const url = msg.attachments[j];
            const ext = url.split('.').pop()?.split('?')[0] || 'png';
            const fileName = msg.id + '_' + j + '.' + ext;
            const dest = imagesDir + '/' + fileName;
            await (window as any).electronAPI.invoke('download-image', { url, destPath: dest });
            msg.attachments[j] = 'images/' + fileName;
          }
        }

        let content = '';
        if (exportFormat === 'html') {
          content = generateHTML(channel.name, msgs);
        } else {
          content = generateCSV(msgs);
        }

        const fileName = 'export_' + channel.name + '.' + exportFormat;
        await (window as any).electronAPI.invoke('save-file', {
          filePath: channelDir + '/' + fileName,
          content
        });

        // Store parsed messages for the report
        collectedData.push({ channelName: channel.name, messages: msgs });

        setStatus(prev => ({ ...prev, completedChannels: i + 1, progress: ((i + 1) / selected.length) * 100 }));
      }
      setExportData(collectedData);

      // Auto-save the report
      if ((window as any).electronAPI && collectedData.length > 0) {
        const webview = webviewRef.current as any;
        let serverName = 'Unknown Server';
        try {
          const url = await webview.getURL();
          serverName = url.split('/')[4] || 'Unknown Server';
        } catch { /* ignore */ }

        const reportId = Date.now() + '_' + serverName;
        const totalMsgs = collectedData.reduce((s, ch) => s + ch.messages.length, 0);
        const report = {
          id: reportId,
          serverName,
          createdAt: new Date().toISOString(),
          dateRange: {
            start: new Date(startTs).toLocaleDateString(),
            end: new Date(endTs).toLocaleDateString(),
          },
          channelCount: collectedData.length,
          totalMessages: totalMsgs,
          data: collectedData,
        };
        await (window as any).electronAPI.invoke('save-report', report);
        loadSavedReports();
      }

      setStatus(prev => ({ ...prev, phase: 'completed', currentChannel: '', progress: 100 }));
    } catch (err: any) {
      setStatus(prev => ({ ...prev, phase: 'error', message: err.message }));
    }
  };

  const generateHTML = (name: string, msgs: any[]) => {
    const rows = msgs.map((m, i) => `
      <div class="message">
        <span class="num">#${i + 1}</span>
        <span class="author">${m.author}</span>
        <span class="time">${new Date(m.timestamp).toLocaleString()}</span>
        ${m.replyText ? `<div class="reply"><div class="reply-spine"></div><strong>${m.replyAuthor}:</strong> ${m.replyText}</div>` : ''}
        <div class="content">${m.content}</div>
        ${m.attachments.map((a: string) => `<img src="${a}" />`).join('')}
      </div>
    `).join('');

    return `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; background: #313338; color: #dbdee1; padding: 20px; }
            .message { margin-bottom: 20px; border-bottom: 1px solid #4e5058; padding-bottom: 10px; }
            .num { color: #80848e; font-size: 0.8em; margin-right: 10px; }
            .author { font-weight: bold; color: #f2f3f5; }
            .time { color: #949ba4; font-size: 0.8em; margin-left: 10px; }
            .content { margin-top: 5px; white-space: pre-wrap; }
            .reply { color: #b5bac1; font-size: 0.9em; margin-bottom: 6px; display: flex; align-items: center; margin-top: 4px; }
            .reply strong { margin-right: 6px; }
            .reply-spine { width: 20px; height: 12px; border-left: 2px solid #4e5058; border-top: 2px solid #4e5058; border-top-left-radius: 6px; margin-right: 8px; margin-top: 8px; align-self: flex-start;}
            img { max-width: 400px; display: block; margin-top: 10px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>Export: ${name}</h1>
          ${rows}
        </body>
      </html>
    `;
  };

  const generateCSV = (msgs: any[]) => {
    const header = "ID,Timestamp,Author,Content,Reply Author,Reply Content,Attachments\n";
    const body = msgs.map(m =>
      `"${m.id}","${m.formattedTime}","${m.author}","${(m.content || '').replace(/"/g, '""')}","${m.replyAuthor}","${(m.replyText || '').replace(/"/g, '""')}","${m.attachments.join(';')}"`
    ).join('\n');
    return header + body;
  };

  return (
    <div className="app-container">
      {/* Loading Screen Overlay */}
      {showLoadingScreen && (
        <div className={`app-loading-screen ${!isAppLoading ? 'fade-out' : ''}`}>
          <div className="loading-logo-container">
            <img src="https://res.cloudinary.com/dr2p5fkiy/image/upload/v1772641910/LuxAlgo_Symbol_ARTWORK_RGB_White_zxshu3.png" alt="LuxAlgo Logo" className="loading-logo" />
            <div className="loading-glow"></div>
          </div>
        </div>
      )}

      {/* Animated Apple Mesh Gradient Background (behind everything) */}
      <div className="hero-background"></div>

      {/* Titlebar for moving the frameless window */}
      <div className="draggable-titlebar"></div>

      <aside className="sidebar glass-panel">
        <h1>
          <MessageSquare size={28} color="var(--accent-primary)" />
          Discord Exporter
        </h1>
        <p style={{ marginBottom: '16px' }}>Securely grab chats direct from Discord Web.</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button className="btn-secondary" style={{ flex: 1, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }} onClick={handleLogout}>
            <LogOut size={16} /> Log Out
          </button>
          <button className="btn-secondary" style={{ width: '40px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }} onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={18} />
          </button>
        </div>

        <h2>1. Select Channels</h2>
        <button className="btn-secondary" onClick={handleScanChannels} disabled={isScanning || status.phase !== 'idle'}>
          {isScanning ? <Activity size={16} className="pulse" /> : <Search size={16} />}
          {isScanning ? 'Scanning...' : 'Scan Current Server'}
        </button>

        {channels.length > 0 && (
          <div style={{ marginTop: '8px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>
            <span>{channels.filter(c => c.selected).length} of {channels.length} selected</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => toggleAllChannels(true)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '12px' }}
              >All</button>
              <button
                onClick={() => toggleAllChannels(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px' }}
              >None</button>
            </div>
          </div>
        )}

        {channels.length > 0 && (
          <div className="channel-list">
            {channels.map(channel => (
              <div key={channel.id} className="channel-item" onClick={() => toggleChannel(channel.id)}>
                <input type="checkbox" checked={channel.selected} readOnly />
                <Hash size={14} />
                <span>{channel.name}</span>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ marginTop: '24px' }}>2. Extraction Range</h2>
        <div className="form-group">
          <label><Calendar size={16} /> Date Range</label>
          <select value={datePreset} onChange={e => setDatePreset(e.target.value)} disabled={status.phase !== 'idle'}>
            <option value="1_day">Past 1 Day</option>
            <option value="1_week">Past 1 Week</option>
            <option value="1_month">Past 1 Month</option>
            <option value="3_months">Past 3 Months</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {datePreset === 'custom' && (
          <>
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={status.phase !== 'idle'} />
            </div>
            <div className="form-group">
              <label>End Date (Optional)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={status.phase !== 'idle'} />
            </div>
          </>
        )}

        <h2 style={{ marginTop: '24px' }}>3. Output Options</h2>
        <div className="form-group">
          <label><HardDrive size={16} /> Format</label>
          <select value={exportFormat} onChange={e => setExportFormat(e.target.value as any)} disabled={status.phase !== 'idle'}>
            <option value="html">Beautiful HTML (With Images)</option>
            <option value="csv">Standard CSV File</option>
          </select>
        </div>

        {status.phase !== 'idle' && (
          <div className={`status-pill active ${status.phase === 'completed' ? 'success' : status.phase === 'error' ? 'error' : ''}`}>
            {status.phase === 'completed' ? <CheckCircle size={14} /> : status.phase === 'error' ? <AlertCircle size={14} /> : <Activity size={14} className="pulse" />}
            {status.phase === 'navigating' && `Navigating to ${status.currentChannel}...`}
            {status.phase === 'extracting' && `Extracting ${status.currentChannel}...`}
            {status.phase === 'saving' && status.message}
            {status.phase === 'completed' && 'Export Complete!'}
            {status.phase === 'error' && status.message}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleExport}
          disabled={(datePreset === 'custom' && !startDate) || channels.filter(c => c.selected).length === 0 || (status.phase !== 'idle' && status.phase !== 'completed' && status.phase !== 'error')}
        >
          <Download size={18} />
          {status.phase === 'idle' || status.phase === 'completed' || status.phase === 'error' ? 'Start Multi-Export' : 'Exporting...'}
        </button>

        {/* ─── Past Reports Section ─── */}
        <div className="past-reports-section">
          <div className="past-reports-header">
            <Clock size={14} /> Past Reports
          </div>
          {savedReports.length === 0 ? (
            <div className="past-reports-empty">No saved reports yet.<br />Export channels to generate one.</div>
          ) : (
            <div className="past-reports-list">
              {savedReports.map(report => (
                <div key={report.id} className="past-report-item">
                  <div className="past-report-name">{report.serverName}</div>
                  <div className="past-report-meta">
                    {new Date(report.createdAt).toLocaleDateString()} · {report.channelCount} ch · {report.totalMessages.toLocaleString()} msgs
                  </div>
                  <div className="past-report-actions">
                    <button
                      className="past-report-btn view-btn"
                      disabled={loadingReportId === report.id}
                      onClick={async () => {
                        setLoadingReportId(report.id);
                        try {
                          const result = await (window as any).electronAPI.invoke('load-report', report.id);
                          if (result?.success && result.report?.data) {
                            setExportData(result.report.data);
                            setShowReport(true);
                          }
                        } catch (e) { console.error(e); }
                        setLoadingReportId(null);
                      }}
                    >
                      <Eye size={12} /> {loadingReportId === report.id ? 'Loading...' : 'View'}
                    </button>
                    <button
                      className="past-report-btn"
                      onClick={async () => {
                        const dir = await (window as any).electronAPI.invoke('select-directory');
                        if (!dir) return;
                        const result = await (window as any).electronAPI.invoke('load-report', report.id);
                        if (!result?.success || !result.report?.data) return;
                        const data: ChannelData[] = result.report.data;
                        for (const ch of data) {
                          const sorted = ch.messages.sort((a: any, b: any) => a.timestamp - b.timestamp);
                          const content = exportFormat === 'html' ? generateHTML(ch.channelName, sorted) : generateCSV(sorted);
                          const channelDir = dir + '/' + ch.channelName;
                          const fileName = 'export_' + ch.channelName + '.' + exportFormat;
                          await (window as any).electronAPI.invoke('save-file', { filePath: channelDir + '/' + fileName, content });
                        }
                        await (window as any).electronAPI.invoke('open-folder', dir);
                      }}
                    >
                      <Download size={12} /> Re-Export
                    </button>
                    <button
                      className="past-report-btn delete-btn"
                      onClick={async () => {
                        if (!window.confirm('Delete this report?')) return;
                        await (window as any).electronAPI.invoke('delete-report', report.id);
                        loadSavedReports();
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="webview-container">
        <webview ref={webviewRef} src="https://discord.com/app" style={{ width: '100%', height: '100vh' }} allowpopups={true} />
      </main>

      {/* Progress Overlay */}
      {status.phase !== 'idle' && (
        <div className="export-overlay">
          <div className="export-overlay-content glass-panel">
            {status.phase === 'completed' ? (
              <>
                <CheckCircle size={48} color="#43b581" />
                <h2 style={{ color: '#43b581', marginTop: '16px', textTransform: 'none', letterSpacing: 'normal' }}>Export Complete!</h2>
                <p>{status.completedChannels} channel{status.completedChannels !== 1 ? 's' : ''} exported successfully.</p>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'center', alignItems: 'stretch' }}>
                  {status.exportDir && (
                    <button className="btn-secondary" style={{ margin: 0, padding: '12px 24px', fontSize: '14px', flex: 1 }} onClick={() => openExportFolder(status.exportDir!)}>
                      <FolderOpen size={16} /> View Exports
                    </button>
                  )}
                  {exportData.length > 0 && (
                    <button className="btn-secondary" style={{ margin: 0, padding: '12px 24px', fontSize: '14px', flex: 1, background: 'rgba(124, 106, 239, 0.15)', color: '#c4b8ff', borderColor: 'rgba(124, 106, 239, 0.3)' }} onClick={() => setShowReport(true)}>
                      <BarChart3 size={16} /> View Report
                    </button>
                  )}
                  <button className="btn-primary" style={{ margin: 0, padding: '12px 24px', fontSize: '14px', flex: 1 }} onClick={() => setStatus(prev => ({ ...prev, phase: 'idle', progress: 0 }))}>
                    Done
                  </button>
                </div>
              </>
            ) : status.phase === 'error' ? (
              <>
                <AlertCircle size={48} color="#f04747" />
                <h2 style={{ color: '#f04747', marginTop: '16px', textTransform: 'none', letterSpacing: 'normal' }}>
                  {status.message === 'Export cancelled by user.' ? 'Export Cancelled' : 'Export Failed'}
                </h2>
                <p style={{ maxWidth: '400px', textAlign: 'center' }}>
                  {status.message !== 'Export cancelled by user.' ? status.message : ''}
                </p>
                <button className="btn-primary" style={{ marginTop: '24px', width: '200px' }} onClick={() => setStatus(prev => ({ ...prev, phase: 'idle', progress: 0 }))}>
                  Dismiss
                </button>
              </>
            ) : (
              <>
                {/* File Transfer Animation */}
                <div className="device-transfer-scene">
                  {/* Source: Phone */}
                  <div className="dt-icon-wrapper dt-source">
                    <Smartphone size={28} strokeWidth={1.5} />
                  </div>

                  {/* Travelling Document */}
                  <div className="dt-document"></div>

                  {/* Destination: Folder */}
                  <div className="dt-icon-wrapper dt-dest">
                    <FolderDown size={28} strokeWidth={1.5} />
                  </div>
                </div>

                <h2 style={{ marginTop: '0', textTransform: 'none', letterSpacing: 'normal' }}>Exporting...</h2>
                <p style={{ marginBottom: '4px' }}>
                  {status.phase === 'navigating' && 'Navigating to #' + status.currentChannel + '...'}
                  {status.phase === 'extracting' && 'Extracting messages from #' + status.currentChannel + '...'}
                  {status.phase === 'saving' && status.message}
                  {status.phase === 'scrolling' && 'Scrolling through #' + status.currentChannel + '...'}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                  Channel {status.completedChannels + 1} of {status.totalChannels}
                </p>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: status.progress + '%' }} />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>{Math.round(status.progress)}%</p>

                <button className="btn-secondary" style={{ marginTop: '24px', background: 'rgba(240, 71, 71, 0.1)', color: '#f04747', borderColor: 'transparent' }} onClick={() => { cancelExportRef.current = true; }}>
                  <XCircle size={16} /> Cancel Export
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="export-overlay">
          <div className="export-overlay-content glass-panel" style={{ textAlign: 'left', minWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Settings size={20} color="var(--text-secondary)" /> Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="var(--accent-primary)" /> Gemini API Key
              </label>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px', lineHeight: '1.4' }}>
                Enter your free Google Gemini API key to enable AI-powered insights and summaries on your exported reports.
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', marginLeft: '4px', textDecoration: 'none' }}>Get a free key here.</a>
              </p>
              <input
                type="password"
                value={geminiApiKey}
                onChange={e => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowSettings(false)}
                style={{ margin: 0, padding: '8px 16px', fontSize: '14px' }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  try {
                    await (window as any).electronAPI.invoke('save-settings', { geminiApiKey });
                    setShowSettings(false);
                  } catch (e) {
                    console.error("Error saving settings", e);
                    alert("Failed to save settings");
                  }
                }}
                style={{ margin: 0, padding: '8px 16px', fontSize: '14px' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Report Overlay */}
      {showReport && exportData.length > 0 && (
        <ReportView
          data={exportData}
          geminiApiKey={geminiApiKey}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

export default App;
