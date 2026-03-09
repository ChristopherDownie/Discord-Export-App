// ReportView.tsx — Interactive Analytics Dashboard
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
    ArcElement,
    RadialLinearScale,
} from 'chart.js';
import { Bar, Line, Doughnut, PolarArea } from 'react-chartjs-2';
import {
    Users,
    Shield,
    MessageSquare,
    Clock,
    Hash,
    Reply,
    FileText,
    UserPlus,
    X,
    Copy,
    Check,
    PieChart,
    BarChart3,
    CalendarDays,
    Paperclip,
    TrendingUp,
    UserSearch,
    Sparkles,
    Loader2,
    Info
} from 'lucide-react';
import type { Timeframe, ChannelData } from './reportUtils';
import {
    isMod,
    getUniqueUsers,
    filterDataByUsers,
    filterDataByMods,
    computeOverviewStats,
    computeTimeline,
    computeChannelComparison,
    computeTopContributors,
    computeHourlyHeatmap,
    computeReplyStats,
    computeContentStats,
    computeModResponseTimes,
    computeWordCloud,
    computePeakHours,
    computeThreadDepth,
    computeQAStats,
    computeInteractionNetwork
} from './reportUtils';
import './ReportView.css';

function SearchableDropdown({ options, value, onChange, placeholder }: { options: { value: string, label: string }[], value: string, onChange: (val: string) => void, placeholder: string }) {
    const [open, setOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const filtered = options.filter(o => o.label.toLowerCase().includes(value.toLowerCase())).slice(0, 100);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) setOpen(true);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && filtered.length > 0) {
                const selected = focusedIndex >= 0 ? filtered[focusedIndex] : filtered[0];
                onChange(selected.value);
                setOpen(false);
                setFocusedIndex(-1);
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className="searchable-dropdown" ref={ref} style={{ position: 'relative', width: '100%', zIndex: open ? 50 : 1 }}>
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onFocus={() => { setOpen(true); setFocusedIndex(-1); }}
                onChange={(e) => { onChange(e.target.value); setOpen(true); setFocusedIndex(-1); }}
                onKeyDown={handleKeyDown}
            />
            {open && (
                <div className="sd-menu">
                    {filtered.length > 0 ? filtered.map((o, i) => (
                        <div key={o.value} className={`sd-item ${focusedIndex === i ? 'keyboard-focused' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
                            {o.label}
                        </div>
                    )) : (
                        value.length > 0 && <div className="sd-empty">No users found</div>
                    )}
                </div>
            )}
        </div>
    );
}

// Register Chart.js modules
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
    ArcElement,
    RadialLinearScale
);

// Global chart defaults
ChartJS.defaults.color = '#6b7280';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.04)';
ChartJS.defaults.font.family = "'Inter', sans-serif";

interface ReportViewProps {
    data: ChannelData[];
    geminiApiKey?: string;
    onClose: () => void;
}

// Palette for multi-channel stacking
const PALETTE = [
    '#7c6aef', '#56b4f9', '#43e5a0', '#f59e42', '#ef4444',
    '#ec4899', '#a78bfa', '#2dd4bf', '#fbbf24', '#6366f1',
    '#14b8a6', '#f97316', '#8b5cf6', '#10b981', '#e11d48',
];

const ALL_PRESET_PROMPTS = [
    "What are the most requested features mentioned here?",
    "Are users generally frustrated or happy? Give me a quick read on the sentiment.",
    "Generate a brief bulleted summary of everything that happened in this log.",
    "What are the biggest points of confusion or bugs being discussed?",
    "List the most active participants and what they are asking for.",
    "Is there any feedback about the recent update?",
    "Summarize the positive feedback versus the negative feedback.",
    "Extract any actionable items for the development team from this channel.",
    "What are the most common questions users are asking?"
];

// ─── Particle Background ──────────────────────────────────────────────────
const ParticleBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: Particle[] = [];
        const numParticles = 250; // Fill entire screen

        let mouseX = -1000;
        let mouseY = -1000;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        class Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;
            color: string;

            constructor() {
                this.x = Math.random() * window.innerWidth;
                this.y = Math.random() * window.innerHeight;
                // Faster base velocity
                this.vx = (Math.random() - 0.5) * 2.5;
                this.vy = (Math.random() - 0.5) * 2.5;
                this.size = Math.random() * 2 + 0.5;
                // LuxAlgo palette randomly assigned to particles
                const colors = ['#43e5a0', '#56b4f9', '#7c6aef'];
                this.color = colors[Math.floor(Math.random() * colors.length)];
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;

                // Mouse interaction - repel particles dynamically from mouse
                const dx = mouseX - this.x;
                const dy = mouseY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const interactionRadius = 160;

                if (dist < interactionRadius) {
                    // Push particle away
                    const force = (interactionRadius - dist) / interactionRadius;
                    this.x -= (dx / dist) * force * 5;
                    this.y -= (dy / dist) * force * 5;
                }
            }

            draw() {
                if (!ctx) return;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle());
        }

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const handleMouseLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);

        const animate = () => {
            if (!ctx || !canvas) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                // Draw connecting lines between close particles
                for (let j = i; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 90) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(67, 229, 160, ${0.15 - dist / 90 * 0.15})`; // Slight luxalgo cyan tint lines
                        ctx.lineWidth = 0.6;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseleave', handleMouseLeave);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return <canvas ref={canvasRef} id="particle-canvas" className="particle-canvas-bg" />;
};


export default function ReportView({ data: rawData, geminiApiKey, onClose }: ReportViewProps) {
    // Normalize user names on mount using NFKC Form (Compatibility Composition).
    // This forcibly flattens stylized Discord text characters (e.g. Mathematical Sans-Serif Bold 𝗠𝗶𝗰𝗸𝘆 -> Micky) 
    // into standard plaintext Latin strings so our SearchableDropdowns and `filterDataByMods` logic matches flawlessly.
    const data = useMemo(() => {
        return rawData.map(ch => ({
            ...ch,
            messages: ch.messages.map(m => ({
                ...m,
                author: m.author ? m.author.normalize('NFKC') : '',
                replyAuthor: m.replyAuthor ? m.replyAuthor.normalize('NFKC') : ''
            }))
        }));
    }, [rawData]);

    const [viewMode, setViewMode] = useState<'global' | 'mods' | 'users' | 'ai'>('global');
    const [user1, setUser1] = useState<string>('');
    const [user2, setUser2] = useState<string>('');
    const [spotlightStartDate, setSpotlightStartDate] = useState<string>('');
    const [spotlightEndDate, setSpotlightEndDate] = useState<string>('');

    // UI state
    const [timeframe, setTimeframe] = useState<Timeframe>('daily');
    const [timelineAggregated, setTimelineAggregated] = useState<boolean>(true);
    const [copiedUser, setCopiedUser] = useState<string | null>(null);
    const [modResponseFilter, setModResponseFilter] = useState<string>('All Mods');
    const [replyEngagementFilter, setReplyEngagementFilter] = useState<string>('All Mods');
    const [spotlightSortOrder, setSpotlightSortOrder] = useState<'desc' | 'asc'>('desc');
    const chartRef = useRef<any>(null);

    // Custom Mods state
    const [customMods, setCustomMods] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('customMods') || '[]'); } catch { return []; }
    });
    const [ignoredMods, setIgnoredMods] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('ignoredMods') || '[]'); } catch { return []; }
    });
    const [newModInput, setNewModInput] = useState<string>('');

    useEffect(() => {
        localStorage.setItem('customMods', JSON.stringify(customMods));
    }, [customMods]);

    useEffect(() => {
        localStorage.setItem('ignoredMods', JSON.stringify(ignoredMods));
    }, [ignoredMods]);

    const handleAddCustomMod = () => {
        const trimmed = newModInput.trim();
        if (trimmed && !customMods.includes(trimmed)) {
            setCustomMods([...customMods, trimmed]);
            if (ignoredMods.includes(trimmed)) setIgnoredMods(ignoredMods.filter(m => m !== trimmed));
        }
        setNewModInput('');
    };

    const handleRemoveMod = (mod: string) => {
        setCustomMods(customMods.filter(m => m !== mod));
        if (!ignoredMods.includes(mod)) setIgnoredMods([...ignoredMods, mod]);
    };

    const handleCopyUser = (author: string) => {
        navigator.clipboard.writeText(author);
        setCopiedUser(author);
        setTimeout(() => setCopiedUser(null), 2000);
    };

    // Filter raw data based on current view mode
    const activeData = useMemo(() => {
        if (viewMode === 'mods') return filterDataByMods(data, customMods, ignoredMods);
        if (viewMode === 'users') {
            const selected = [user1, user2].filter(Boolean);
            let result = data;
            if (selected.length > 0) result = filterDataByUsers(data, selected);

            // Apply Date Bounds
            if (spotlightStartDate || spotlightEndDate) {
                const s = spotlightStartDate ? new Date(spotlightStartDate).getTime() : 0;
                // Add 86399999ms (23h 59m 59s) to encompass the full end day
                const e = spotlightEndDate ? new Date(spotlightEndDate).getTime() + 86399999 : Infinity;
                result = result.map(ch => ({
                    ...ch,
                    messages: ch.messages.filter(m => m.timestamp >= s && m.timestamp <= e)
                }));
            }
            return result;
        }
        return data;
    }, [data, viewMode, user1, user2, customMods, ignoredMods, spotlightStartDate, spotlightEndDate]);

    const allUsers = useMemo(() => getUniqueUsers(data), [data]);
    const allUsersOptions = useMemo(() => allUsers.map(u => ({ value: u, label: `${u} ${isMod(u, customMods, ignoredMods) ? '(Mod)' : ''}` })), [allUsers, customMods, ignoredMods]);
    const activeModList = useMemo(() => allUsers.filter(u => isMod(u, customMods, ignoredMods)), [allUsers, customMods, ignoredMods]);

    const overview = useMemo(() => computeOverviewStats(activeData), [activeData]);
    const timeline = useMemo(() => computeTimeline(activeData, timeframe), [activeData, timeframe]);
    const channelComparison = useMemo(() => computeChannelComparison(activeData), [activeData]);
    const topContributors = useMemo(() => computeTopContributors(activeData), [activeData]);
    const heatmap = useMemo(() => computeHourlyHeatmap(activeData), [activeData]);
    const contentStats = useMemo(() => computeContentStats(activeData), [activeData]);
    const wordCloudData = useMemo(() => computeWordCloud(activeData), [activeData]);
    const peakHours = useMemo(() => computePeakHours(activeData), [activeData]);
    const threadDepth = useMemo(() => computeThreadDepth(activeData), [activeData]);
    const qaStats = useMemo(() => computeQAStats(activeData), [activeData]);
    const interactionNetwork = useMemo(() => computeInteractionNetwork(activeData), [activeData]);

    // Mod Analytics directly read from data but strictly filtered by mod engagement hooks over global timelines
    const replyStats = useMemo(() => {
        let filteredData = data;
        if (replyEngagementFilter !== 'All Mods') {
            filteredData = data.map(ch => ({ ...ch, messages: ch.messages.filter(m => m.author === replyEngagementFilter) }));
        }
        return computeReplyStats(filteredData, true, customMods, ignoredMods);
    }, [data, customMods, ignoredMods, replyEngagementFilter]);
    const modResponseTimes = useMemo(() => computeModResponseTimes(data, customMods, ignoredMods, activeModList), [data, customMods, ignoredMods, activeModList]);

    const channelNames = useMemo(() => activeData.map(d => d.channelName), [activeData]);

    // ─── AI Integration State ────────────────────────
    const [aiSelectedChannel, setAiSelectedChannel] = useState<string>('all_channels');
    const [aiPrompt, setAiPrompt] = useState<string>("Summarize the main topics, frequent feature requests, and the general sentiment of the users in this channel.");
    const [aiIsLoading, setAiIsLoading] = useState<boolean>(false);
    const [aiResult, setAiResult] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    const [activePrompts, setActivePrompts] = useState<string[]>(ALL_PRESET_PROMPTS.slice(0, 4));

    const handlePromptClick = (clickedPrompt: string) => {
        // Append to textarea 
        setAiPrompt(prev => prev ? prev + "\n" + clickedPrompt : clickedPrompt);

        // Cycle prompt
        const available = ALL_PRESET_PROMPTS.filter(p => !activePrompts.includes(p) && p !== clickedPrompt);
        const newPrompt = available[Math.floor(Math.random() * available.length)] || clickedPrompt;

        setActivePrompts(prev => prev.map(p => p === clickedPrompt ? newPrompt : p));
    };

    const cancelAI = () => {
        if (abortController) {
            abortController.abort();
            setAiIsLoading(false);
            setAiError("Analysis cancelled by the user.");
            setAbortController(null);
        }
    };

    const handleRunAI = async () => {
        if (!geminiApiKey) {
            setAiError("No Gemini API Key found. Please add it in the settings.");
            return;
        }

        setAiIsLoading(true);
        setAiError(null);
        setAiResult(null);

        const newController = new AbortController();
        setAbortController(newController);

        let condensedLog = "";
        let logTargetName = aiSelectedChannel;

        if (aiSelectedChannel === 'all_channels') {
            logTargetName = "All Server Channels";
            // Combine all active channels
            const combinedMsgs: { author: string, content: string, timestamp: number }[] = [];
            activeData.forEach(ch => {
                ch.messages.forEach(m => {
                    if (m.content && m.content.trim().length > 0) {
                        // Prepend channel name so the AI knows where it came from
                        combinedMsgs.push({
                            author: `#${ch.channelName} - ${m.author}`,
                            content: m.content,
                            timestamp: m.timestamp
                        });
                    }
                });
            });
            // Sort absolute chronologically
            combinedMsgs.sort((a, b) => a.timestamp - b.timestamp);

            condensedLog = combinedMsgs.map(m => `${m.author}: ${m.content}`).join('\n');

            if (condensedLog.length === 0) {
                setAiError(`No text messages found in any channel to analyze.`);
                setAiIsLoading(false);
                setAbortController(null);
                return;
            }

        } else {
            const channelData = data.find(c => c.channelName === aiSelectedChannel);
            if (!channelData || channelData.messages.length === 0) {
                setAiError(`No messages found in #${aiSelectedChannel} to analyze.`);
                setAiIsLoading(false);
                setAbortController(null);
                return;
            }
            // Condense the chat logs to save tokens
            // Sort to ensure chronological order for the AI to understand conversation flow
            const sortedMsgs = [...channelData.messages].sort((a, b) => a.timestamp - b.timestamp);

            // Format strictly as <Author>: <Message> to minimize token overhead
            // Skip media-only/empty text messages
            condensedLog = sortedMsgs
                .filter(m => m.content && m.content.trim().length > 0)
                .map(m => `${m.author}: ${m.content}`)
                .join('\n');
        }

        try {
            const payloadBox = {
                contents: [
                    {
                        parts: [
                            { text: `Here is the message log for ${logTargetName}:\n\n${condensedLog}\n\nBased on these logs, please answer the following request:\n${aiPrompt}\n\nCRITICAL INSTRUCTION: Do NOT mention your persona ("As an expert discord manager..."). Do NOT repeat these instructions. Do NOT include an introductory sentence or phrase. Provide ONLY the final answer.` }
                        ]
                    }
                ],
                // We're asking for strict analysis, so lower temperature is better.
                generationConfig: {
                    temperature: 0.2,
                }
            };

            // 1. Fetch available models for this API Key so we don't hardcode a 404ing model string
            let targetModel = 'models/gemini-2.0-flash';
            let usableModelNamesStr = '';

            try {
                // Use a 15-second timeout so the spinner doesn't hang forever
                const modelsFetchController = new AbortController();
                const modelsTimeout = setTimeout(() => modelsFetchController.abort(), 15000);
                // Also abort if the user clicks Cancel
                const onUserAbort = () => modelsFetchController.abort();
                newController.signal.addEventListener('abort', onUserAbort);

                const modelsResponse = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`,
                    { signal: modelsFetchController.signal }
                );
                clearTimeout(modelsTimeout);
                newController.signal.removeEventListener('abort', onUserAbort);

                if (modelsResponse.ok) {
                    const modelsJson = await modelsResponse.json();
                    const availableModels = modelsJson.models || [];
                    // Only consider models that support generateContent
                    const usableModels = availableModels.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'));
                    usableModelNamesStr = usableModels.map((m: any) => m.name.replace('models/', '')).join(', ');

                    // Priority list — updated to current Gemini model names
                    const preferredModels = [
                        'models/gemini-2.0-flash',
                        'models/gemini-2.0-flash-lite',
                        'models/gemini-2.5-pro',
                        'models/gemini-1.5-flash',
                        'models/gemini-1.5-pro',
                    ];

                    let foundPreferred = false;
                    for (const preferred of preferredModels) {
                        if (usableModels.some((m: any) => m.name === preferred)) {
                            targetModel = preferred;
                            foundPreferred = true;
                            break;
                        }
                    }

                    // Fallback to whichever model supports generation if preferred ones are missing
                    if (!foundPreferred && usableModels.length > 0) {
                        targetModel = usableModels[0].name;
                    }
                }
            } catch (modelListErr: any) {
                // If cancelled by user, re-throw so the outer catch handles it
                if (newController.signal.aborted) throw modelListErr;
                // Otherwise just use the default model (timeout, network blip, etc.)
                console.warn('Model list fetch failed, using default model:', modelListErr.message);
            }

            // 2. Execute against the chosen model
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadBox),
                signal: newController.signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                const baseMsg = errorData.error?.message || `API Error: ${response.status}`;
                throw new Error(usableModelNamesStr ? `${baseMsg}\n\nModels you have access to: ${usableModelNamesStr}` : baseMsg);
            }

            const json = await response.json();
            const textResponse = json.candidates?.[0]?.content?.parts?.[0]?.text;

            if (textResponse) {
                setAiResult(textResponse);
            } else {
                setAiError("The AI returned an empty or malformed response.");
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                return; // Error already set by cancel function
            }
            console.error("AI Insights Error:", e);
            setAiError(e.message || "An unknown error occurred while contacting the AI.");
        } finally {
            setAiIsLoading(false);
            setAbortController(null);
        }
    };

    // ─── Heatmap heat intensity ──────────────────────
    const heatmapMax = useMemo(() => {
        let max = 0;
        for (const row of heatmap) for (const v of row) if (v > max) max = v;
        return max || 1;
    }, [heatmap]);

    const heatColor = (val: number) => {
        const intensity = val / heatmapMax;
        if (intensity === 0) return 'rgba(255,255,255,0.03)';
        // Purple to cyan gradient
        const r = Math.round(124 * (1 - intensity) + 67 * intensity);
        const g = Math.round(106 * (1 - intensity) + 229 * intensity);
        const b = Math.round(239 * (1 - intensity) + 160 * intensity);
        return `rgba(${r},${g},${b},${0.15 + intensity * 0.85})`;
    };

    // ─── Timeline Chart Data ─────────────────────────
    const formatTimelineLabel = (dateStr: string) => {
        const d = new Date(dateStr);
        if (timeframe === 'hourly') {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true });
        } else if (timeframe === 'weekly') {
            return 'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const timelineChartData = useMemo(() => {
        const aggregateDataset = {
            label: 'Total Messages',
            data: timeline.map(t => t.total),
            borderColor: '#2dd4bf', // Teal border
            backgroundColor: (context: any) => {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) return 'rgba(45, 212, 191, 0.2)'; // Fallback teal

                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(45, 212, 191, 0.4)'); // Teal top
                gradient.addColorStop(1, 'rgba(45, 212, 191, 0.0)'); // Transparent bottom
                return gradient;
            },
            borderDash: !timelineAggregated ? [5, 5] : undefined,
            borderWidth: !timelineAggregated ? 3 : 2,
            fill: timelineAggregated,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
        };

        if (!timelineAggregated) {
            // Stacked area per channel + Aggregate line
            return {
                labels: timeline.map(t => formatTimelineLabel(t.date)),
                datasets: [
                    aggregateDataset,
                    ...channelNames.map((name, idx) => ({
                        label: '#' + name,
                        data: timeline.map(t => t.byChannel[name] || 0),
                        borderColor: PALETTE[idx % PALETTE.length],
                        backgroundColor: PALETTE[idx % PALETTE.length] + '20',
                        fill: false,
                        tension: 0.35,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                    }))
                ],
            };
        }
        // Aggregate line ONLY
        return {
            labels: timeline.map(t => formatTimelineLabel(t.date)),
            datasets: [aggregateDataset],
        };
    }, [timeline, channelNames, timelineAggregated]);

    // ─── Channel Comparison Chart ────────────────────
    const channelChartData = useMemo(() => ({
        labels: channelComparison.map(c => '#' + c.name),
        datasets: [
            {
                label: 'Messages',
                data: channelComparison.map(c => c.messageCount),
                backgroundColor: channelComparison.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
                borderColor: channelComparison.map((_, i) => PALETTE[i % PALETTE.length]),
                borderWidth: 1,
                borderRadius: 6,
            },
        ],
    }), [channelComparison]);

    // ─── Top Contributors Doughnut ───────────────────
    const contributorDoughnut = useMemo(() => ({
        labels: topContributors.slice(0, 8).map(c => c.author),
        datasets: [
            {
                data: topContributors.slice(0, 8).map(c => c.totalMessages),
                backgroundColor: topContributors.slice(0, 8).map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
                borderColor: 'rgba(0,0,0,0.3)',
                borderWidth: 2,
            },
        ],
    }), [topContributors]);

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // ─── Peak Hours Polar Chart Data ─────────────────
    const polarChartData = useMemo(() => ({
        labels: peakHours.map(h => h.label),
        datasets: [{
            data: peakHours.map(h => h.total),
            backgroundColor: peakHours.map((_, i) => {
                const hue = (i / 24) * 360;
                return `hsla(${hue}, 70%, 55%, 0.6)`;
            }),
            borderColor: peakHours.map((_, i) => {
                const hue = (i / 24) * 360;
                return `hsla(${hue}, 70%, 55%, 1)`;
            }),
            borderWidth: 1,
        }],
    }), [peakHours]);

    // ─── Thread Depth Bar Chart Data ─────────────────
    const threadDepthChartData = useMemo(() => ({
        labels: threadDepth.histogram.map(h => `Depth ${h.depth}`),
        datasets: [{
            label: 'Conversation Chains',
            data: threadDepth.histogram.map(h => h.count),
            backgroundColor: threadDepth.histogram.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
            borderColor: threadDepth.histogram.map((_, i) => PALETTE[i % PALETTE.length]),
            borderWidth: 1,
            borderRadius: 6,
        }],
    }), [threadDepth]);

    // ─── QA Stats Doughnut Data ──────────────────────
    const qaDoughnutData = useMemo(() => ({
        labels: ['Answered', 'Unanswered'],
        datasets: [{
            data: [qaStats.answeredQuestions, qaStats.unansweredQuestions],
            backgroundColor: ['#43e5a0CC', '#ef4444CC'],
            borderColor: ['#43e5a0', '#ef4444'],
            borderWidth: 2,
        }],
    }), [qaStats]);

    // ─── Word Cloud Canvas Component ─────────────────
    const WordCloudCanvas = useCallback(({ words }: { words: { text: string; value: number }[] }) => {
        const canvasRef = useRef<HTMLCanvasElement>(null);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas || words.length === 0) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, rect.width, rect.height);

            const maxVal = words[0]?.value || 1;
            const minVal = words[words.length - 1]?.value || 1;
            const minFont = 11;
            const maxFont = 42;

            // Intensity color: gray (low freq) → orange → red (high freq)
            const getIntensityColor = (value: number) => {
                const t = maxVal === minVal ? 1 : (value - minVal) / (maxVal - minVal);
                // Gray (#6b7280) → Orange (#f59e42) → Red (#ef4444)
                if (t < 0.5) {
                    const s = t * 2; // 0..1 within gray→orange
                    const r = Math.round(107 + s * (245 - 107));
                    const g = Math.round(114 + s * (158 - 114));
                    const b = Math.round(128 + s * (66 - 128));
                    return `rgb(${r},${g},${b})`;
                } else {
                    const s = (t - 0.5) * 2; // 0..1 within orange→red
                    const r = Math.round(245 + s * (239 - 245));
                    const g = Math.round(158 + s * (68 - 158));
                    const b = Math.round(66 + s * (68 - 66));
                    return `rgb(${r},${g},${b})`;
                }
            };

            // Place words using spiral placement
            const placed: { x: number; y: number; w: number; h: number }[] = [];
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const fontSize = minFont + ((word.value / maxVal) ** 0.5) * (maxFont - minFont);
                const fontSizeRounded = Math.round(fontSize * 10) / 10;
                const isBold = fontSizeRounded >= 24;
                ctx.font = `${isBold ? 'bold ' : ''}${fontSizeRounded}px Inter, sans-serif`;
                ctx.fillStyle = getIntensityColor(word.value);

                const metrics = ctx.measureText(word.text);
                // Measure the count label to include in total width
                const countStr = word.value.toLocaleString();
                const countFontSize = Math.max(8, fontSizeRounded * 0.45);
                ctx.font = `${countFontSize}px Inter, sans-serif`;
                const countW = ctx.measureText(countStr).width + 4;
                ctx.font = `${isBold ? 'bold ' : ''}${fontSizeRounded}px Inter, sans-serif`;

                const textW = metrics.width + countW + 8;
                const textH = fontSize + 4;

                // Spiral outward to find a non-overlapping position
                let px = 0, py = 0, foundSpot = false;
                for (let t = 0; t < 600; t++) {
                    const angle = t * 0.18;
                    const radius = 3 + t * 1.2;
                    px = centerX + Math.cos(angle) * radius - textW / 2;
                    py = centerY + Math.sin(angle) * radius + textH / 4;

                    // Bounds check
                    if (px < 2 || px + textW > rect.width - 2 || py - textH < 2 || py > rect.height - 2) continue;

                    // Overlap check
                    let overlaps = false;
                    for (const p of placed) {
                        if (px < p.x + p.w && px + textW > p.x && py - textH < p.y && py > p.y - p.h) {
                            overlaps = true;
                            break;
                        }
                    }
                    if (!overlaps) { foundSpot = true; break; }
                }
                if (!foundSpot) continue;

                // Draw the word
                ctx.font = `${isBold ? 'bold ' : ''}${fontSizeRounded}px Inter, sans-serif`;
                ctx.fillText(word.text, px, py);

                // Draw the count number beside the word (smaller, slightly transparent)
                ctx.font = `${countFontSize}px Inter, sans-serif`;
                ctx.globalAlpha = 0.55;
                ctx.fillText(countStr, px + metrics.width + 4, py);
                ctx.globalAlpha = 1.0;

                placed.push({ x: px, y: py, w: textW, h: textH });
            }
        }, [words]);

        return <canvas ref={canvasRef} style={{ width: '100%', height: '320px', display: 'block' }} />;
    }, []);

    // ─── Network Graph Canvas Component ──────────────
    const NetworkGraphCanvas = useCallback(({ network }: { network: { nodes: { id: string; messageCount: number }[]; links: { source: string; target: string; weight: number }[] } }) => {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const animFrameRef = useRef<number>(0);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas || network.nodes.length === 0) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            const W = rect.width;
            const H = rect.height;
            const colors = ['#7c6aef', '#56b4f9', '#43e5a0', '#f59e42', '#ec4899', '#2dd4bf', '#fbbf24', '#a78bfa', '#f97316', '#6366f1'];
            const maxMsgCount = Math.max(...network.nodes.map(n => n.messageCount), 1);
            const maxWeight = Math.max(...network.links.map(l => l.weight), 1);

            // Initialize node positions in a circle
            type SimNode = { id: string; x: number; y: number; vx: number; vy: number; radius: number; color: string; messageCount: number };
            const simNodes: SimNode[] = network.nodes.map((n, i) => {
                const angle = (i / network.nodes.length) * Math.PI * 2;
                const r = Math.min(W, H) * 0.3;
                return {
                    id: n.id,
                    x: W / 2 + Math.cos(angle) * r,
                    y: H / 2 + Math.sin(angle) * r,
                    vx: 0, vy: 0,
                    radius: 6 + (n.messageCount / maxMsgCount) * 18,
                    color: colors[i % colors.length],
                    messageCount: n.messageCount,
                };
            });

            const nodeMap = new Map(simNodes.map(n => [n.id, n]));

            // Mouse tracking for tooltip
            let mouseX = -1, mouseY = -1;
            let hoveredNode: SimNode | null = null;

            const handleMouseMove = (e: MouseEvent) => {
                const r = canvas.getBoundingClientRect();
                mouseX = e.clientX - r.left;
                mouseY = e.clientY - r.top;
                hoveredNode = null;
                for (const n of simNodes) {
                    const dx = n.x - mouseX, dy = n.y - mouseY;
                    if (Math.sqrt(dx * dx + dy * dy) < n.radius + 4) {
                        hoveredNode = n;
                        break;
                    }
                }
                canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
            };
            canvas.addEventListener('mousemove', handleMouseMove);

            let frame = 0;
            const simulate = () => {
                ctx.clearRect(0, 0, W, H);
                frame++;

                // Physics: repulsion between all nodes
                for (let i = 0; i < simNodes.length; i++) {
                    for (let j = i + 1; j < simNodes.length; j++) {
                        const a = simNodes[i], b = simNodes[j];
                        let dx = b.x - a.x, dy = b.y - a.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const force = 800 / (dist * dist);
                        const fx = (dx / dist) * force, fy = (dy / dist) * force;
                        a.vx -= fx; a.vy -= fy;
                        b.vx += fx; b.vy += fy;
                    }
                }

                // Attraction along links
                for (const link of network.links) {
                    const a = nodeMap.get(link.source);
                    const b = nodeMap.get(link.target);
                    if (!a || !b) continue;
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const strength = 0.005 * (link.weight / maxWeight);
                    const fx = dx * strength, fy = dy * strength;
                    a.vx += fx; a.vy += fy;
                    b.vx -= fx; b.vy -= fy;
                }

                // Gravity toward center
                for (const n of simNodes) {
                    n.vx += (W / 2 - n.x) * 0.001;
                    n.vy += (H / 2 - n.y) * 0.001;
                }

                // Apply velocity with damping
                const damping = frame < 100 ? 0.85 : 0.95;
                for (const n of simNodes) {
                    n.vx *= damping; n.vy *= damping;
                    n.x += n.vx; n.y += n.vy;
                    // Bounds
                    n.x = Math.max(n.radius + 4, Math.min(W - n.radius - 4, n.x));
                    n.y = Math.max(n.radius + 4, Math.min(H - n.radius - 4, n.y));
                }

                // Draw links
                for (const link of network.links) {
                    const a = nodeMap.get(link.source);
                    const b = nodeMap.get(link.target);
                    if (!a || !b) continue;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(124, 106, 239, ${0.1 + (link.weight / maxWeight) * 0.4})`;
                    ctx.lineWidth = 0.5 + (link.weight / maxWeight) * 3;
                    ctx.stroke();
                }

                // Draw nodes
                for (const n of simNodes) {
                    // Glow for hovered node
                    if (hoveredNode === n) {
                        ctx.beginPath();
                        ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
                        ctx.fillStyle = n.color + '30';
                        ctx.fill();
                    }

                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                    ctx.fillStyle = n.color;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Label
                    ctx.font = `${n.radius > 12 ? 11 : 9}px Inter, sans-serif`;
                    ctx.fillStyle = '#e5e7eb';
                    ctx.textAlign = 'center';
                    ctx.fillText(n.id.length > 14 ? n.id.slice(0, 12) + '…' : n.id, n.x, n.y + n.radius + 14);
                }

                // Tooltip
                if (hoveredNode) {
                    const n = hoveredNode;
                    const tooltipText = `${n.id} — ${n.messageCount} messages`;
                    ctx.font = 'bold 12px Inter, sans-serif';
                    const tw = ctx.measureText(tooltipText).width + 16;
                    const tx = Math.min(n.x - tw / 2, W - tw - 4);
                    const ty = n.y - n.radius - 28;
                    ctx.fillStyle = 'rgba(17, 17, 26, 0.92)';
                    ctx.beginPath();
                    ctx.roundRect(tx, ty, tw, 24, 6);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.textAlign = 'left';
                    ctx.fillText(tooltipText, tx + 8, ty + 16);
                }

                animFrameRef.current = requestAnimationFrame(simulate);
            };

            simulate();

            return () => {
                cancelAnimationFrame(animFrameRef.current);
                canvas.removeEventListener('mousemove', handleMouseMove);
            };
        }, [network]);

        return <canvas ref={canvasRef} style={{ width: '100%', height: '400px', display: 'block' }} />;
    }, []);

    return (
        <div className="report-overlay">
            <div className="report-dashboard">
                {/* Header Row 1: Title & Close */}
                <div className="report-header">
                    <div>
                        <h1>Channel Activity Report</h1>
                        <p className="report-subtitle">
                            {overview.dateStart} — {overview.dateEnd} · {overview.totalChannels} channel{overview.totalChannels !== 1 ? 's' : ''} analyzed
                        </p>
                    </div>
                    <button className="report-close-btn" onClick={onClose}>
                        <X size={16} /> Close Report
                    </button>
                </div>

                {/* Header Row 2: View Modes */}
                <div className="report-view-modes">
                    <button className={`view-mode-btn ${viewMode === 'global' ? 'active' : ''}`} onClick={() => setViewMode('global')}>
                        <BarChart3 size={14} /> Global Overview
                    </button>
                    <button className={`view-mode-btn ${viewMode === 'mods' ? 'active' : ''}`} onClick={() => setViewMode('mods')}>
                        <Shield size={14} /> Mod Activity Only
                    </button>
                    <button className={`view-mode-btn ${viewMode === 'users' ? 'active' : ''}`} onClick={() => setViewMode('users')}>
                        <UserSearch size={14} /> User Spotlight
                    </button>
                    <button className={`view-mode-btn ${viewMode === 'ai' ? 'active ai-glow-btn' : 'ai-glow-btn text-muted'}`} onClick={() => {
                        setViewMode('ai');
                        if (!aiSelectedChannel && channelNames.length > 0) setAiSelectedChannel('all_channels');
                    }}>
                        <Sparkles size={14} /> Gather Insight
                    </button>
                </div>

                {viewMode === 'users' ? (
                    <div className="user-spotlight-view">
                        <div className="user-selectors" style={{ marginBottom: '24px' }}>
                            <div className="user-select-group">
                                <label>User 1</label>
                                <SearchableDropdown
                                    options={allUsersOptions}
                                    value={user1}
                                    onChange={setUser1}
                                    placeholder="Select User 1..."
                                />
                            </div>
                            <div className="user-select-group">
                                <label>User 2 (Compare)</label>
                                <SearchableDropdown
                                    options={allUsersOptions}
                                    value={user2}
                                    onChange={setUser2}
                                    placeholder="Select User 2..."
                                />
                                {user2 && (
                                    <button className="clear-usr-btn" onClick={() => setUser2('')} title="Clear User 2"><X size={14} /></button>
                                )}
                            </div>
                            <div className="user-select-group" style={{ maxWidth: '140px' }}>
                                <label>Start Date</label>
                                <input type="date" value={spotlightStartDate} onChange={(e) => setSpotlightStartDate(e.target.value)} className="date-filter-ux" />
                            </div>
                            <div className="user-select-group" style={{ maxWidth: '140px' }}>
                                <label>End Date</label>
                                <input type="date" value={spotlightEndDate} onChange={(e) => setSpotlightEndDate(e.target.value)} className="date-filter-ux" />
                            </div>
                        </div>
                        {(!user1 && !user2) ? (
                            <div className="user-spotlight-empty">
                                <UserSearch size={32} opacity={0.3} style={{ margin: '0 auto 12px' }} />
                                Select a user above to view their messages and analytics.
                            </div>
                        ) : (
                            <div className="user-spotlight-content">
                                {/* Comparison Stats if both selected */}
                                {user1 && user2 && (
                                    <div className="user-comparison-stats">
                                        <div className="ucs-user">
                                            <h3>{user1}</h3>
                                            <div className="ucs-stat">{activeData.flatMap(c => c.messages).filter(m => m.author === user1).length} msgs</div>
                                        </div>
                                        <div className="ucs-vs">VS</div>
                                        <div className="ucs-user">
                                            <h3>{user2}</h3>
                                            <div className="ucs-stat">{activeData.flatMap(c => c.messages).filter(m => m.author === user2).length} msgs</div>
                                        </div>
                                    </div>
                                )}

                                {/* Message Log Frame */}
                                <div className="user-message-log-container">
                                    <div className="report-section-title" style={{ justifyContent: 'space-between', display: 'flex' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MessageSquare size={16} /> Selected User Messages</div>
                                        <select
                                            value={spotlightSortOrder}
                                            onChange={(e) => setSpotlightSortOrder(e.target.value as any)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '12px' }}
                                        >
                                            <option value="desc">Newest First</option>
                                            <option value="asc">Oldest First</option>
                                        </select>
                                    </div>
                                    <div className="user-message-log">
                                        {activeData.flatMap(c => c.messages).sort((a, b) => spotlightSortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp).map(msg => (
                                            <div key={msg.id} className="uml-msg-row">
                                                <div className="uml-msg-meta">
                                                    <span className="uml-author">{msg.author}</span>
                                                    <span className="uml-channel">#{activeData.find(c => c.messages.includes(msg))?.channelName}</span>
                                                    <span className="uml-time">{new Date(msg.timestamp).toLocaleString()}</span>
                                                </div>
                                                <div className="uml-msg-content">{msg.content}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : viewMode === 'ai' ? (
                    <div className="ai-insights-view">
                        <ParticleBackground />

                        <div className="di-split-layout">
                            {/* LEFT SIDE BUBBLES */}
                            <div className="di-side-panel">
                                {geminiApiKey && activePrompts.slice(0, 2).map((preset, idx) => (
                                    <div
                                        key={preset}
                                        className={`di-floating-bubble di-bubble-${idx + 1}`}
                                        onClick={() => handlePromptClick(preset)}
                                    >
                                        <div className="di-bubble-content">{preset}</div>
                                        <div className="di-bubble-hint">+ Add Prompt</div>
                                    </div>
                                ))}
                            </div>

                            {/* CENTER DIALOG */}
                            <div className="deep-insight-overlay-container">
                                <div className="deep-insight-dialog">
                                    {!geminiApiKey ? (
                                        <div className="di-empty-state">
                                            <div className="di-glow-icon">
                                                <Sparkles size={40} color="#43e5a0" />
                                            </div>
                                            <h3>Gather Insight</h3>
                                            <p>
                                                To use the Engine, provide your Google Gemini API Key in the application settings.
                                                Close this report and click the gear icon in the left sidebar to add your key securely.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="di-content-wrapper">
                                            <div className="di-header">
                                                <div className="di-title">
                                                    <Sparkles size={20} className="di-sparkle" />
                                                    <h2>Gather Insight</h2>
                                                </div>
                                            </div>

                                            {/* Input Form Area */}
                                            <div className="di-form-area">
                                                <div className="di-form-row">
                                                    <div className="di-input-group di-channel-select">
                                                        <label>Target Scope</label>
                                                        <select
                                                            value={aiSelectedChannel}
                                                            onChange={(e) => setAiSelectedChannel(e.target.value)}
                                                            disabled={aiIsLoading}
                                                        >
                                                            <option value="all_channels">All Channels (Combined)</option>
                                                            {channelNames.map(name => (
                                                                <option key={name} value={name}>#{name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="di-form-row">
                                                    <div className="di-input-group di-prompt-input">
                                                        <label>Custom Instruction Prompt</label>
                                                        <textarea
                                                            value={aiPrompt}
                                                            onChange={(e) => setAiPrompt(e.target.value)}
                                                            disabled={aiIsLoading}
                                                            rows={3}
                                                            placeholder="What would you like to know about these logs? (Or click a floating suggestion bubble)"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="di-action-row">
                                                    {aiIsLoading && (
                                                        <button
                                                            className="di-analyze-btn secondary"
                                                            onClick={cancelAI}
                                                        >
                                                            <X size={18} /> Cancel
                                                        </button>
                                                    )}
                                                    <button
                                                        className={`di-analyze-btn ${aiIsLoading ? 'loading' : ''}`}
                                                        onClick={handleRunAI}
                                                        disabled={aiIsLoading || !aiSelectedChannel}
                                                    >
                                                        {aiIsLoading ? (
                                                            <><Loader2 size={18} className="spin" /> Analyzing Logs...</>
                                                        ) : (
                                                            <><Sparkles size={18} /> Gather Insight</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Loading Map Overlay (if waiting but want to block content explicitly) */}
                                            {aiIsLoading && !aiResult && (
                                                <div className="di-loading-state">
                                                    <Loader2 size={40} className="spin" color="#43e5a0" />
                                                    <p>Gathering Intelligence from <strong>{aiSelectedChannel === 'all_channels' ? 'All Channels' : `#${aiSelectedChannel}`}</strong></p>
                                                    <div className="di-pulse-bar" />
                                                </div>
                                            )}

                                            {/* Results Area */}
                                            <div className={`di-results-area ${(aiResult || aiError) && !aiIsLoading ? 'visible' : ''}`}>
                                                {aiError && (
                                                    <div className="di-error-box">
                                                        <X size={18} />
                                                        <div>
                                                            <strong>Analysis Failed</strong>
                                                            <div className="di-error-text">{aiError}</div>
                                                        </div>
                                                    </div>
                                                )}

                                                {aiResult && (
                                                    <div className="di-result-panel">
                                                        <div className="di-result-header">
                                                            <h3>Analysis Results for {aiSelectedChannel === 'all_channels' ? 'All Channels' : `#${aiSelectedChannel}`}</h3>
                                                        </div>
                                                        <div className="di-markdown-content" dangerouslySetInnerHTML={{
                                                            __html: aiResult
                                                                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                                                .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
                                                                .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
                                                                .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
                                                                .replace(/^- (.*?)$/gm, '<li>$1</li>')
                                                        }} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT SIDE BUBBLES */}
                            <div className="di-side-panel">
                                {geminiApiKey && activePrompts.slice(2, 4).map((preset, idx) => (
                                    <div
                                        key={preset}
                                        className={`di-floating-bubble di-bubble-${idx + 3}`}
                                        onClick={() => handlePromptClick(preset)}
                                    >
                                        <div className="di-bubble-content">{preset}</div>
                                        <div className="di-bubble-hint">+ Add Prompt</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ─── Summary Cards ─── */}
                        <div className="report-cards">
                            <div className="report-card">
                                <div className="report-card-label"><MessageSquare size={13} /> Total Messages</div>
                                <div className="report-card-value highlight">{overview.totalMessages.toLocaleString()}</div>
                            </div>
                            <div className="report-card">
                                <div className="report-card-label"><Users size={13} /> Contributors</div>
                                <div className="report-card-value">{overview.totalContributors}</div>
                            </div>
                            <div className="report-card">
                                <div className="report-card-label"><Paperclip size={13} /> Attachments</div>
                                <div className="report-card-value">{overview.totalAttachments.toLocaleString()}</div>
                            </div>
                            <div className="report-card">
                                <div className="report-card-label"><TrendingUp size={13} /> Avg / Day</div>
                                <div className="report-card-value">{overview.avgMessagesPerDay}</div>
                            </div>
                            <div className="report-card">
                                <div className="report-card-label"><Hash size={13} /> Busiest Channel</div>
                                <div className="report-card-value" style={{ fontSize: '18px' }}>#{overview.mostActiveChannel.name}</div>
                                <div className="report-card-detail">{overview.mostActiveChannel.count} messages</div>
                            </div>
                            <div className="report-card">
                                <div className="report-card-label"><Users size={13} /> Top Contributor</div>
                                <div className="report-card-value" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {overview.mostActiveUser.name}
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(overview.mostActiveUser.name);
                                            setCopiedUser(overview.mostActiveUser.name);
                                            setTimeout(() => setCopiedUser(null), 2000);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: copiedUser ? '#43e5a0' : '#9ca3af', cursor: 'pointer', padding: 0 }}
                                        title="Copy Username"
                                    >
                                        {copiedUser ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <div className="report-card-detail">{overview.mostActiveUser.count} messages</div>
                            </div>
                        </div>

                        {viewMode === 'mods' && (
                            <div className="custom-mod-editor">
                                <h3><Shield size={14} /> Custom Moderators</h3>
                                <p>Add Discord usernames manually to track them as Mods across the dashboard.</p>
                                <div className="cme-input-row" style={{ alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <SearchableDropdown
                                            options={allUsersOptions}
                                            value={newModInput}
                                            onChange={setNewModInput}
                                            placeholder="Exact Discord Username..."
                                        />
                                    </div>
                                    <button onClick={handleAddCustomMod} style={{ height: '39px' }}><UserPlus size={14} /> Add User</button>
                                </div>
                                {activeModList.length > 0 && (
                                    <div className="cme-list">
                                        {activeModList.map(m => (
                                            <div key={m} className={`cme-tag ${customMods.includes(m) ? 'custom' : 'auto'}`}>
                                                {m}
                                                <button onClick={() => handleRemoveMod(m)} title="Ignore Mod"><X size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── Activity Timeline ─── */}
                        <div className="report-section">
                            <div className="report-section-title" style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CalendarDays size={18} /> Activity Timeline
                                    <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Shows message volume over time. Switch between hourly, daily, or weekly views and compare activity across channels.</span></span>
                                </div>
                                <div className="timeframe-toggle-container">
                                    {!timelineAggregated && (
                                        <div className="timeframe-toggle">
                                            <button onClick={() => {
                                                if (chartRef.current) {
                                                    chartRef.current.data.datasets.forEach((_: any, idx: number) => {
                                                        if (idx > 0) chartRef.current.setDatasetVisibility(idx, true);
                                                    });
                                                    chartRef.current.update();
                                                }
                                            }}>Show All</button>
                                            <button onClick={() => {
                                                if (chartRef.current) {
                                                    chartRef.current.data.datasets.forEach((_: any, idx: number) => {
                                                        if (idx > 0) chartRef.current.setDatasetVisibility(idx, false);
                                                    });
                                                    chartRef.current.update();
                                                }
                                            }}>Hide All</button>
                                        </div>
                                    )}
                                    <div className="timeframe-toggle">
                                        <button className={timelineAggregated ? 'active' : ''} onClick={() => setTimelineAggregated(true)}>Aggregated</button>
                                        <button className={!timelineAggregated ? 'active' : ''} onClick={() => setTimelineAggregated(false)}>By Channel</button>
                                    </div>
                                    <div className="timeframe-toggle">
                                        <button className={timeframe === 'hourly' ? 'active' : ''} onClick={() => setTimeframe('hourly')}>Hourly</button>
                                        <button className={timeframe === 'daily' ? 'active' : ''} onClick={() => setTimeframe('daily')}>Daily</button>
                                        <button className={timeframe === 'weekly' ? 'active' : ''} onClick={() => setTimeframe('weekly')}>Weekly</button>
                                    </div>
                                </div>
                            </div>
                            <div className="report-chart-card">
                                <Line
                                    ref={chartRef}
                                    data={timelineChartData}
                                    options={{
                                        responsive: true,
                                        interaction: { mode: 'index', intersect: false },
                                        plugins: {
                                            legend: { display: !timelineAggregated, labels: { boxWidth: 12, padding: 16 }, position: 'bottom' },
                                            tooltip: { backgroundColor: 'rgba(17,17,26,0.95)', padding: 12, cornerRadius: 8, titleFont: { weight: 'bold' } },
                                        },
                                        scales: {
                                            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } },
                                            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
                                        },
                                    }}
                                    height={80}
                                />
                            </div>
                        </div>

                        {/* ─── Channel Comparison + Top Contributors ─── */}
                        <div className="report-two-col">
                            <div className="report-section">
                                <div className="report-section-title"><BarChart3 size={18} /> Channel Comparison <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Compare message volume across all exported channels. Taller bars indicate more active channels.</span></span></div>
                                <div className="report-chart-card">
                                    <Bar
                                        data={channelChartData}
                                        options={{
                                            indexAxis: 'y',
                                            responsive: true,
                                            plugins: {
                                                legend: { display: false },
                                                tooltip: { backgroundColor: 'rgba(17,17,26,0.95)', padding: 12, cornerRadius: 8 },
                                            },
                                            scales: {
                                                x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { precision: 0 } },
                                                y: { grid: { display: false }, ticks: { font: { size: 12 } } },
                                            },
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="report-section">
                                <div className="report-section-title"><Users size={18} /> Top Contributors <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">The most active users by total message count. Click a user in the doughnut chart to view their profile in User Spotlight.</span></span></div>
                                <div className="report-chart-card">
                                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                                        <div style={{ flex: '0 0 160px' }}>
                                            <Doughnut
                                                data={contributorDoughnut}
                                                options={{
                                                    responsive: true,
                                                    cutout: '68%',
                                                    onClick: (_, elements) => {
                                                        if (elements.length > 0) {
                                                            const idx = elements[0].index;
                                                            const clickedUser = contributorDoughnut.labels[idx];
                                                            if (clickedUser) {
                                                                setUser1(clickedUser);
                                                                setViewMode('users');
                                                            }
                                                        }
                                                    },
                                                    plugins: {
                                                        legend: { display: false },
                                                        tooltip: { backgroundColor: 'rgba(17,17,26,0.95)', padding: 12, cornerRadius: 8 },
                                                    },
                                                }}
                                            />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {topContributors.slice(0, 8).map((c, i) => (
                                                <div
                                                    key={c.author}
                                                    className={`rank-bar-container clickable-rank ${copiedUser === c.author ? 'copied' : ''}`}
                                                    onClick={() => handleCopyUser(c.author)}
                                                    title="Click to copy username"
                                                >
                                                    <div className="rank-bar-header">
                                                        <span className="rank-bar-name">
                                                            {c.author}
                                                            {copiedUser === c.author && <Check size={12} style={{ marginLeft: '4px', color: '#43e5a0' }} />}
                                                        </span>
                                                        <span className="rank-bar-count">{c.totalMessages}</span>
                                                    </div>
                                                    <div className="rank-bar-track">
                                                        <div
                                                            className="rank-bar-fill"
                                                            style={{
                                                                width: `${(c.totalMessages / (topContributors[0]?.totalMessages || 1)) * 100}%`,
                                                                background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}, ${PALETTE[i % PALETTE.length]}88)`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Hourly Heatmap + Peak Hours Polar ─── */}
                        <div className="report-two-col">
                            <div className="report-section">
                                <div className="report-section-title"><Clock size={18} /> Activity Heatmap <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">A day-of-week × hour-of-day grid showing when the server is busiest. Brighter cells mean more messages at that time.</span></span></div>
                                <div className="report-chart-card">
                                    <div className="heatmap-grid">
                                        {/* Hour labels row */}
                                        <div />
                                        {Array.from({ length: 24 }, (_, h) => (
                                            <div key={`h${h}`} className="heatmap-hour-label">{h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</div>
                                        ))}
                                        {/* Data rows */}
                                        {DAY_NAMES.map((day, di) => (
                                            <>
                                                <div key={`l${di}`} className="heatmap-label">{day}</div>
                                                {heatmap[di].map((val: number, hi: number) => (
                                                    <div
                                                        key={`c${di}-${hi}`}
                                                        className="heatmap-cell"
                                                        style={{ backgroundColor: heatColor(val) }}
                                                        title={`${day} ${hi}:00 — ${val} messages`}
                                                    />
                                                ))}
                                            </>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="report-section">
                                <div className="report-section-title"><TrendingUp size={18} /> When Is the Server Most Alive? <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">A radial chart showing total messages per hour of the day. Larger slices indicate peak activity hours — great for scheduling announcements.</span></span></div>
                                <div className="report-chart-card">
                                    <PolarArea
                                        data={polarChartData}
                                        options={{
                                            responsive: true,
                                            plugins: {
                                                legend: { display: false },
                                                tooltip: {
                                                    backgroundColor: 'rgba(17,17,26,0.95)',
                                                    padding: 12,
                                                    cornerRadius: 8,
                                                    callbacks: {
                                                        label: (ctx: any) => `${ctx.label}: ${ctx.raw.toLocaleString()} messages`
                                                    }
                                                },
                                            },
                                            scales: {
                                                r: {
                                                    grid: { color: 'rgba(255,255,255,0.06)' },
                                                    ticks: { display: false },
                                                },
                                            },
                                        }}
                                    />
                                    <div style={{ textAlign: 'center', fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                                        Peak: {peakHours.reduce((max, h) => h.total > max.total ? h : max, peakHours[0])?.label || '—'} ({peakHours.reduce((max, h) => h.total > max.total ? h : max, peakHours[0])?.total.toLocaleString()} msgs)
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Thread Depth + Questions vs Answers ─── */}
                        {viewMode === 'global' && (
                            <div className="report-two-col">
                                <div className="report-section">
                                    <div className="report-section-title"><MessageSquare size={18} /> Conversation Thread Depth <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Measures how deep reply chains go. Higher depth means more back-and-forth engagement. Reply Rate shows what % of messages are replies.</span></span></div>
                                    <div className="report-chart-card">
                                        <div className="stat-pill-row">
                                            <div className="stat-pill"><strong>{threadDepth.replyPercentage}%</strong> Reply Rate</div>
                                            <div className="stat-pill"><strong>{threadDepth.avgDepth}</strong> Avg Depth</div>
                                            <div className="stat-pill"><strong>{threadDepth.maxDepth}</strong> Max Depth</div>
                                            <div className="stat-pill"><strong>{threadDepth.totalReplies.toLocaleString()}</strong> Total Replies</div>
                                        </div>
                                        {threadDepth.histogram.length > 0 ? (
                                            <Bar
                                                data={threadDepthChartData}
                                                options={{
                                                    responsive: true,
                                                    plugins: {
                                                        legend: { display: false },
                                                        tooltip: { backgroundColor: 'rgba(17,17,26,0.95)', padding: 12, cornerRadius: 8 },
                                                    },
                                                    scales: {
                                                        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                                                        y: { beginAtZero: true, ticks: { precision: 0 } },
                                                    },
                                                }}
                                                height={80}
                                            />
                                        ) : (
                                            <div style={{ opacity: 0.5, fontSize: '13px', textAlign: 'center', marginTop: '30px' }}>No reply chains detected.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="report-section">
                                    <div className="report-section-title"><Reply size={18} /> Questions vs Answers <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Detects messages with '?' as questions and checks if someone responded within the next 10 messages. Shows answer rate and top askers/answerers.</span></span></div>
                                    <div className="report-chart-card">
                                        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                                            <div style={{ flex: '0 0 140px' }}>
                                                <Doughnut
                                                    data={qaDoughnutData}
                                                    options={{
                                                        responsive: true,
                                                        cutout: '68%',
                                                        plugins: {
                                                            legend: { display: false },
                                                            tooltip: { backgroundColor: 'rgba(17,17,26,0.95)', padding: 12, cornerRadius: 8 },
                                                        },
                                                    }}
                                                />
                                                <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', marginTop: '8px', color: '#43e5a0' }}>
                                                    {qaStats.answerRate}%
                                                </div>
                                                <div style={{ textAlign: 'center', fontSize: '11px', color: '#6b7280' }}>Answer Rate</div>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div className="stat-pill-row" style={{ marginBottom: '12px' }}>
                                                    <div className="stat-pill"><strong>{qaStats.totalQuestions}</strong> Questions</div>
                                                    <div className="stat-pill" style={{ color: '#43e5a0' }}><strong>{qaStats.answeredQuestions}</strong> Answered</div>
                                                    <div className="stat-pill" style={{ color: '#ef4444' }}><strong>{qaStats.unansweredQuestions}</strong> Unanswered</div>
                                                </div>
                                                {qaStats.topAskers.length > 0 && (
                                                    <>
                                                        <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Top Askers</p>
                                                        {qaStats.topAskers.map((u, i) => (
                                                            <div key={i} className="rank-bar-container">
                                                                <div className="rank-bar-header">
                                                                    <span className="rank-bar-name">{u.name}</span>
                                                                    <span className="rank-bar-count">{u.count}</span>
                                                                </div>
                                                                <div className="rank-bar-track">
                                                                    <div className="rank-bar-fill" style={{ width: `${(u.count / (qaStats.topAskers[0]?.count || 1)) * 100}%`, background: 'linear-gradient(90deg, #f59e42, #f59e4288)' }} />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                                {qaStats.topAnswerers.length > 0 && (
                                                    <>
                                                        <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', marginTop: '12px' }}>Top Answerers</p>
                                                        {qaStats.topAnswerers.slice(0, 3).map((u, i) => (
                                                            <div key={i} className="rank-bar-container">
                                                                <div className="rank-bar-header">
                                                                    <span className="rank-bar-name">{u.name}</span>
                                                                    <span className="rank-bar-count">{u.count}</span>
                                                                </div>
                                                                <div className="rank-bar-track">
                                                                    <div className="rank-bar-fill" style={{ width: `${(u.count / (qaStats.topAnswerers[0]?.count || 1)) * 100}%`, background: 'linear-gradient(90deg, #43e5a0, #43e5a088)' }} />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── Word Cloud ─── */}
                        {viewMode === 'global' && wordCloudData.length > 0 && (
                            <div className="report-section">
                                <div className="report-section-title"><FileText size={18} /> Word Cloud <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Most frequently used words across all messages. Redder and larger words appear more often. Gray words are less common. Numbers show exact count.</span></span></div>
                                <div className="report-chart-card word-cloud-container">
                                    <WordCloudCanvas words={wordCloudData} />
                                </div>
                            </div>
                        )}

                        {/* ─── User Interaction Network ─── */}
                        {viewMode === 'global' && interactionNetwork.nodes.length > 0 && interactionNetwork.links.length > 0 && (
                            <div className="report-section">
                                <div className="report-section-title"><Users size={18} /> User Interaction Network <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">A force-directed graph showing who replies to whom. Larger nodes = more messages. Thicker lines = more frequent interactions between users.</span></span></div>
                                <div className="report-chart-card network-graph-container">
                                    <NetworkGraphCanvas network={interactionNetwork} />
                                    <div style={{ textAlign: 'center', fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                                        {interactionNetwork.nodes.length} users · {interactionNetwork.links.length} connections · Node size = message count · Edge thickness = reply frequency
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── Global Bottom Row ─── */}
                        {viewMode === 'global' && (
                            <div className="report-two-col">
                                <div className="report-section">
                                    <div className="report-section-title"><PieChart size={18} /> Content Breakdown <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Categorizes all messages into text-only, messages with links, and messages with attachments (images, files, etc.).</span></span></div>
                                    <div className="report-chart-card">
                                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                            <div style={{ flex: '0 0 160px' }}>
                                                <Doughnut
                                                    data={{
                                                        labels: ['Text Only', 'Includes Links', 'Has Attachments'],
                                                        datasets: [{
                                                            data: [contentStats.breakdown.text, contentStats.breakdown.links, contentStats.breakdown.attachments],
                                                            backgroundColor: ['#7c6aef', '#43e5a0', '#56b4f9'],
                                                            borderWidth: 0,
                                                        }]
                                                    }}
                                                    options={{
                                                        responsive: true,
                                                        cutout: '70%',
                                                        plugins: {
                                                            legend: { display: false },
                                                            tooltip: { backgroundColor: 'rgba(17,17,26,0.95)', padding: 12, cornerRadius: 8 }
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div className="stat-pill-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                                    <div className="stat-pill" style={{ justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#7c6aef' }}>● Text Only</span>
                                                        <strong>{contentStats.breakdown.text.toLocaleString()}</strong>
                                                    </div>
                                                    <div className="stat-pill" style={{ justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#43e5a0' }}>● Links</span>
                                                        <strong>{contentStats.breakdown.links.toLocaleString()}</strong>
                                                    </div>
                                                    <div className="stat-pill" style={{ justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#56b4f9' }}>● Attachments</span>
                                                        <strong>{contentStats.breakdown.attachments.toLocaleString()}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="report-section">
                                    <div className="report-section-title"><FileText size={18} /> Deep Content Stats <span className="section-info-tooltip"><Info size={14} /><span className="section-info-text">Average message length per channel — longer messages often indicate more thoughtful discussion or detailed support answers.</span></span></div>
                                    <div className="report-chart-card">
                                        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Avg. Message Length by Channel</p>
                                        {contentStats.avgLengthPerChannel.map((ch, i) => (
                                            <div key={i} className="rank-bar-container">
                                                <div className="rank-bar-header">
                                                    <span className="rank-bar-name">#{ch.name}</span>
                                                    <span className="rank-bar-count">{ch.avgLength} chars</span>
                                                </div>
                                                <div className="rank-bar-track">
                                                    <div
                                                        className="rank-bar-fill"
                                                        style={{
                                                            width: `${(ch.avgLength / (contentStats.avgLengthPerChannel[0]?.avgLength || 1)) * 100}%`,
                                                            background: 'linear-gradient(90deg, #f59e42, #f59e4288)',
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── Mod Analytics ─── */}
                        {viewMode === 'mods' && (
                            <div className="report-two-col">
                                <div className="report-section">
                                    <div className="report-section-title" style={{ justifyContent: 'space-between', display: 'flex' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Reply size={18} /> Mod Reply Engagement
                                        </div>
                                        <select
                                            value={replyEngagementFilter}
                                            onChange={(e) => setReplyEngagementFilter(e.target.value)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '12px' }}
                                        >
                                            <option value="All Mods">All Mods</option>
                                            {activeModList.map((m: any) => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div className="report-chart-card">
                                        <div className="stat-pill-row">
                                            <div className="stat-pill"><strong>{replyStats.totalReplies}</strong> Mod Replies</div>
                                            <div className="stat-pill"><strong>{replyStats.replyRate}%</strong> Mod Reply Rate</div>
                                        </div>

                                        {replyStats.mostRepliedTo.length > 0 && (
                                            <>
                                                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', marginTop: '20px' }}>Most Replied-To Users</p>
                                                {replyStats.mostRepliedTo.slice(0, 5).map((u, i) => (
                                                    <div key={i} className="rank-bar-container">
                                                        <div className="rank-bar-header">
                                                            <span className="rank-bar-name">{u.name}</span>
                                                            <span className="rank-bar-count">{u.count}</span>
                                                        </div>
                                                        <div className="rank-bar-track">
                                                            <div
                                                                className="rank-bar-fill"
                                                                style={{
                                                                    width: `${(u.count / (replyStats.mostRepliedTo[0]?.count || 1)) * 100}%`,
                                                                    background: 'linear-gradient(90deg, #43e5a0, #43e5a088)',
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="report-section">
                                    <div className="report-section-title" style={{ justifyContent: 'space-between', display: 'flex' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Clock size={18} /> Avg. Response Time
                                        </div>
                                        <select
                                            value={modResponseFilter}
                                            onChange={(e) => setModResponseFilter(e.target.value)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '12px' }}
                                        >
                                            <option value="All Mods">All Mods</option>
                                            {modResponseTimes.map((m: any) => <option key={m.modName} value={m.modName}>{m.modName}</option>)}
                                        </select>
                                    </div>
                                    <div className="report-chart-card">
                                        {modResponseTimes
                                            .filter((m: any) => modResponseFilter === 'All Mods' ? m.replyCount > 0 : m.modName === modResponseFilter)
                                            .map((mod: any, _: number, arr: any[]) => {
                                                const maxMs = Math.max(...arr.map(a => a.avgResponseMs), 1);
                                                const formatTime = (ms: number) => {
                                                    if (ms === 0) return "0s";
                                                    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
                                                    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
                                                    return `${(ms / 3600000).toFixed(1)}h`;
                                                };
                                                return (
                                                    <div key={mod.modName} className="rank-bar-container">
                                                        <div className="rank-bar-header">
                                                            <span className="rank-bar-name">{mod.modName} <span style={{ opacity: 0.5, fontSize: '10px', marginLeft: '6px' }}>({mod.replyCount} tracked)</span></span>
                                                            <span className="rank-bar-count" style={{ color: '#56b4f9' }}>{mod.replyCount === 0 ? "N/A" : formatTime(mod.avgResponseMs)}</span>
                                                        </div>
                                                        <div className="rank-bar-track">
                                                            <div
                                                                className="rank-bar-fill"
                                                                style={{
                                                                    width: mod.replyCount === 0 ? '0%' : `${Math.max(2, (mod.avgResponseMs / maxMs) * 100)}%`,
                                                                    background: 'linear-gradient(90deg, #56b4f9, #56b4f988)',
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        {modResponseTimes.filter(m => m.replyCount > 0).length === 0 && modResponseFilter === 'All Mods' && (
                                            <div style={{ opacity: 0.5, fontSize: '13px', textAlign: 'center', marginTop: '30px' }}>No response times recorded.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
