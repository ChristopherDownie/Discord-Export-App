// reportUtils.ts — Pure analytics computation for Discord export data

export interface Message {
    id: string;
    timestamp: number;
    author: string;
    content: string;
    replyAuthor: string;
    replyText: string;
    formattedTime: string;
    attachments: string[];
}

export interface ChannelData {
    channelName: string;
    messages: Message[];
    serverId?: string;
    channelId?: string;
}

// ─── Data Filtering & User Helpers ────────────────────────────────────────

export function isMod(username: string, customMods: string[] = [], ignoredMods: string[] = []): boolean {
    if (!username) return false;
    if (ignoredMods.includes(username)) return false;
    if (customMods.includes(username)) return true;
    const lower = username.toLowerCase();
    return lower.includes('luxalgo mod') || lower.includes('mod');
}

export function getUniqueUsers(data: ChannelData[]): string[] {
    const users = new Set<string>();
    for (const ch of data) {
        for (const msg of ch.messages) {
            if (msg.author) users.add(msg.author);
        }
    }
    return Array.from(users).sort((a, b) => a.localeCompare(b));
}

export function filterDataByUsers(data: ChannelData[], users: string[]): ChannelData[] {
    const userSet = new Set(users);
    return data.map(ch => ({
        channelName: ch.channelName,
        messages: ch.messages.filter(m => userSet.has(m.author))
    }));
}

export function filterDataByMods(data: ChannelData[], customMods: string[] = [], ignoredMods: string[] = []): ChannelData[] {
    return data.map(ch => ({
        channelName: ch.channelName,
        messages: ch.messages.filter(m => isMod(m.author, customMods, ignoredMods))
    }));
}

// ─── Overview Stats ───────────────────────────────────────────────────────

export interface OverviewStats {
    totalMessages: number;
    totalContributors: number;
    totalAttachments: number;
    dateStart: string;
    dateEnd: string;
    mostActiveChannel: { name: string; count: number };
    mostActiveUser: { name: string; count: number };
    totalChannels: number;
    avgMessagesPerDay: number;
}

export function computeOverviewStats(data: ChannelData[]): OverviewStats {
    let totalMessages = 0;
    let totalAttachments = 0;
    let minTs = Infinity;
    let maxTs = -Infinity;
    const userCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};

    for (const ch of data) {
        channelCounts[ch.channelName] = ch.messages.length;
        totalMessages += ch.messages.length;

        for (const msg of ch.messages) {
            totalAttachments += msg.attachments.length;
            if (msg.timestamp < minTs) minTs = msg.timestamp;
            if (msg.timestamp > maxTs) maxTs = msg.timestamp;
            userCounts[msg.author] = (userCounts[msg.author] || 0) + 1;
        }
    }

    const sortedUsers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]);
    const sortedChannels = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);

    const daySpan = Math.max(1, Math.ceil((maxTs - minTs) / (24 * 60 * 60 * 1000)));

    return {
        totalMessages,
        totalContributors: Object.keys(userCounts).length,
        totalAttachments,
        dateStart: minTs === Infinity ? '—' : new Date(minTs).toLocaleDateString(),
        dateEnd: maxTs === -Infinity ? '—' : new Date(maxTs).toLocaleDateString(),
        mostActiveChannel: sortedChannels[0]
            ? { name: sortedChannels[0][0], count: sortedChannels[0][1] }
            : { name: '—', count: 0 },
        mostActiveUser: sortedUsers[0]
            ? { name: sortedUsers[0][0], count: sortedUsers[0][1] }
            : { name: '—', count: 0 },
        totalChannels: data.length,
        avgMessagesPerDay: Math.round(totalMessages / daySpan),
    };
}

// ─── Activity Timeline (messages per day) ─────────────────────────────────

export type Timeframe = 'hourly' | 'daily' | 'weekly';

export interface TimelinePoint {
    date: string;           // Formatted based on timeframe
    total: number;
    byChannel: Record<string, number>;
}

export function computeTimeline(data: ChannelData[], timeframe: Timeframe = 'daily'): TimelinePoint[] {
    const timeMap: Record<string, Record<string, number>> = {};

    for (const ch of data) {
        for (const msg of ch.messages) {
            const dateObj = new Date(msg.timestamp);
            let key = '';

            if (timeframe === 'hourly') {
                // Keep year, month, day, and hour for sorting
                const iso = dateObj.toISOString();
                key = iso.slice(0, 13) + ':00:00Z';
            } else if (timeframe === 'weekly') {
                // Round down to previous Sunday
                const tempDate = new Date(dateObj.getTime());
                tempDate.setUTCHours(0, 0, 0, 0);
                tempDate.setUTCDate(tempDate.getUTCDate() - tempDate.getUTCDay());
                key = tempDate.toISOString().slice(0, 10);
            } else {
                // daily default
                key = dateObj.toISOString().slice(0, 10);
            }

            if (!timeMap[key]) timeMap[key] = {};
            timeMap[key][ch.channelName] = (timeMap[key][ch.channelName] || 0) + 1;
        }
    }

    const keys = Object.keys(timeMap).sort();
    return keys.map(k => {
        const byChannel = timeMap[k];
        const total = Object.values(byChannel).reduce((s, v) => s + v, 0);
        return { date: k, total, byChannel };
    });
}

// ─── Channel Comparison ───────────────────────────────────────────────────

export interface ChannelStat {
    name: string;
    messageCount: number;
    contributorCount: number;
    attachmentCount: number;
}

export function computeChannelComparison(data: ChannelData[]): ChannelStat[] {
    return data
        .map(ch => {
            const authors = new Set<string>();
            let attachments = 0;
            for (const msg of ch.messages) {
                authors.add(msg.author);
                attachments += msg.attachments.length;
            }
            return {
                name: ch.channelName,
                messageCount: ch.messages.length,
                contributorCount: authors.size,
                attachmentCount: attachments,
            };
        })
        .sort((a, b) => b.messageCount - a.messageCount);
}

// ─── Top Contributors ────────────────────────────────────────────────────

export interface ContributorStat {
    author: string;
    totalMessages: number;
    byChannel: Record<string, number>;
}

export function computeTopContributors(
    data: ChannelData[],
    limit = 15
): ContributorStat[] {
    const userMap: Record<string, Record<string, number>> = {};

    for (const ch of data) {
        for (const msg of ch.messages) {
            if (!userMap[msg.author]) userMap[msg.author] = {};
            userMap[msg.author][ch.channelName] =
                (userMap[msg.author][ch.channelName] || 0) + 1;
        }
    }

    return Object.entries(userMap)
        .map(([author, byChannel]) => ({
            author,
            totalMessages: Object.values(byChannel).reduce((s, v) => s + v, 0),
            byChannel,
        }))
        .sort((a, b) => b.totalMessages - a.totalMessages)
        .slice(0, limit);
}

// ─── Hourly Heatmap ──────────────────────────────────────────────────────

// Returns 7 rows (Sun=0 → Sat=6) × 24 columns (hour 0–23)
export type HeatmapData = number[][];

export function computeHourlyHeatmap(data: ChannelData[]): HeatmapData {
    const grid: number[][] = Array.from({ length: 7 }, () =>
        Array(24).fill(0)
    );

    for (const ch of data) {
        for (const msg of ch.messages) {
            const d = new Date(msg.timestamp);
            grid[d.getDay()][d.getHours()]++;
        }
    }
    return grid;
}

// ─── Reply Stats ──────────────────────────────────────────────────────────

export interface ReplyPair {
    from: string;
    to: string;
    count: number;
}

export interface ReplyStats {
    totalReplies: number;
    replyRate: number;       // 0–100 %
    topPairs: ReplyPair[];
    mostRepliedTo: { name: string; count: number }[];
}

export function computeReplyStats(data: ChannelData[], restrictToMods: boolean = false, customMods: string[] = [], ignoredMods: string[] = []): ReplyStats {
    let totalMsgs = 0;
    let totalReplies = 0;
    const pairMap: Record<string, number> = {};
    const repliedToMap: Record<string, number> = {};

    for (const ch of data) {
        for (const msg of ch.messages) {
            // Apply mod filter logic to the reply network if requested
            if (restrictToMods) {
                const fromMod = isMod(msg.author, customMods, ignoredMods);
                const toMod = msg.replyAuthor ? isMod(msg.replyAuthor, customMods, ignoredMods) : false;
                // Skip if neither sender nor receiver is a mod
                if (!fromMod && !toMod) continue;
            }

            totalMsgs++;
            if (msg.replyAuthor && msg.replyAuthor.trim()) {
                totalReplies++;
                const key = `${msg.author} → ${msg.replyAuthor}`;
                pairMap[key] = (pairMap[key] || 0) + 1;
                repliedToMap[msg.replyAuthor] =
                    (repliedToMap[msg.replyAuthor] || 0) + 1;
            }
        }
    }

    const topPairs = Object.entries(pairMap)
        .map(([key, count]) => {
            const [from, to] = key.split(' → ');
            return { from, to, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const mostRepliedTo = Object.entries(repliedToMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalReplies,
        replyRate: totalMsgs > 0 ? Math.round((totalReplies / totalMsgs) * 100) : 0,
        topPairs,
        mostRepliedTo,
    };
}

// ─── Content Stats ────────────────────────────────────────────────────────

export interface ContentStats {
    avgLengthPerChannel: { name: string; avgLength: number }[];
    attachmentsPerChannel: { name: string; count: number }[];
    longestMessages: { author: string; channel: string; length: number; preview: string }[];
    breakdown: { text: number; links: number; attachments: number };
}

export function computeContentStats(data: ChannelData[]): ContentStats {
    const avgLengthPerChannel = data.map(ch => {
        const totalLen = ch.messages.reduce((s, m) => s + (m.content?.length || 0), 0);
        return {
            name: ch.channelName,
            avgLength: ch.messages.length > 0 ? Math.round(totalLen / ch.messages.length) : 0,
        };
    }).sort((a, b) => b.avgLength - a.avgLength);

    const attachmentsPerChannel = data.map(ch => ({
        name: ch.channelName,
        count: ch.messages.reduce((s, m) => s + m.attachments.length, 0),
    })).sort((a, b) => b.count - a.count);

    const allMsgs: { author: string; channel: string; length: number; preview: string }[] = [];
    const breakdown = { text: 0, links: 0, attachments: 0 };

    for (const ch of data) {
        for (const msg of ch.messages) {
            const copy = msg.content || '';
            const len = copy.length;

            if (msg.attachments.length > 0) breakdown.attachments++;
            else if (copy.match(/https?:\/\//)) breakdown.links++;
            else breakdown.text++;

            if (len > 500) {
                allMsgs.push({
                    author: msg.author,
                    channel: ch.channelName,
                    length: len,
                    preview: copy.substring(0, 100).replace(/\n/g, ' ')
                });
            }
        }
    }
    const longestMessages = allMsgs
        .sort((a, b) => b.length - a.length)
        .slice(0, 5);

    return { avgLengthPerChannel, attachmentsPerChannel, longestMessages, breakdown };
}

// ─── Mod Response Times ───────────────────────────────────────────────────

export interface ModResponseStat {
    modName: string;
    avgResponseMs: number;
    replyCount: number;
}

export function computeModResponseTimes(data: ChannelData[], customMods: string[] = [], ignoredMods: string[] = [], allMods: string[] = []): ModResponseStat[] {
    const responseTimes: Record<string, number[]> = {};
    for (const m of allMods) responseTimes[m] = [];

    for (const ch of data) {
        const sorted = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);

        for (let i = 0; i < sorted.length; i++) {
            const msg = sorted[i];
            if (isMod(msg.author, customMods, ignoredMods) && msg.replyAuthor && !isMod(msg.replyAuthor, customMods, ignoredMods)) {
                let j = i - 1;
                while (j >= 0) {
                    if (sorted[j].author === msg.replyAuthor) {
                        const delta = msg.timestamp - sorted[j].timestamp;
                        if (delta >= 0 && delta <= 86400000 * 7) {
                            if (!responseTimes[msg.author]) responseTimes[msg.author] = [];
                            responseTimes[msg.author].push(delta);
                        }
                        break;
                    }
                    j--;
                }
            }
        }
    }

    return Object.entries(responseTimes).map(([modName, times]) => {
        const sum = times.reduce((a, b) => a + b, 0);
        return { modName, avgResponseMs: times.length > 0 ? sum / times.length : 0, replyCount: times.length };
    }).sort((a, b) => b.replyCount - a.replyCount);
}

// ─── Word Cloud ───────────────────────────────────────────────────────────

export interface WordCloudItem {
    text: string;
    value: number;
}

const STOP_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with',
    'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out',
    'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
    'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
    'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
    'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
    'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was',
    'were', 'been', 'has', 'had', 'did', 'does', 'am', 'being', 'got', 'im', 'dont', 'thats',
    'ive', 'youre', 'hes', 'shes', 'theyre', 'weve', 'cant', 'wont', 'didnt', 'isnt', 'arent',
    'wasnt', 'werent', 'shouldnt', 'couldnt', 'wouldnt', 'yeah', 'yes', 'no', 'ok', 'okay',
    'really', 'very', 'much', 'more', 'here', 'just', 'lol', 'lmao', 'haha', 'oh', 'ah', 'um',
    'like', 'gonna', 'wanna', 'gotta', 'pretty', 'thing', 'things', 'stuff', 'lot', 'still',
    'though', 'right', 'well', 'too', 'actually', 'basically', 'literally', 'maybe',
]);

export function computeWordCloud(data: ChannelData[], limit = 80): WordCloudItem[] {
    const wordCounts: Record<string, number> = {};

    for (const ch of data) {
        for (const msg of ch.messages) {
            if (!msg.content) continue;
            // Remove URLs, mentions, emoji codes, and special chars
            const cleaned = msg.content
                .replace(/https?:\/\/\S+/g, '')
                .replace(/<[@#!&]\d+>/g, '')
                .replace(/<a?:\w+:\d+>/g, '')
                .replace(/[^a-zA-Z\s]/g, '')
                .toLowerCase();

            const words = cleaned.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
            for (const word of words) {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            }
        }
    }

    return Object.entries(wordCounts)
        .map(([text, value]) => ({ text, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

// ─── Peak Hours (for Polar Chart) ─────────────────────────────────────────

export interface PeakHourStat {
    hour: number;
    total: number;
    label: string;
}

export function computePeakHours(data: ChannelData[]): PeakHourStat[] {
    const hourCounts = Array(24).fill(0);

    for (const ch of data) {
        for (const msg of ch.messages) {
            const h = new Date(msg.timestamp).getHours();
            hourCounts[h]++;
        }
    }

    return hourCounts.map((total, hour) => ({
        hour,
        total,
        label: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
    }));
}

// ─── Conversation Thread Depth ────────────────────────────────────────────

export interface ThreadDepthStats {
    histogram: { depth: number; count: number }[];
    avgDepth: number;
    maxDepth: number;
    replyPercentage: number;
    totalReplies: number;
}

export function computeThreadDepth(data: ChannelData[]): ThreadDepthStats {
    let totalMessages = 0;
    let totalReplies = 0;
    const depthCounts: Record<number, number> = {};

    for (const ch of data) {
        const sorted = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);
        totalMessages += sorted.length;

        // Track active reply chains: author -> current chain depth
        let currentChainDepth = 0;
        let lastWasReply = false;

        for (const msg of sorted) {
            if (msg.replyAuthor && msg.replyAuthor.trim()) {
                totalReplies++;
                if (lastWasReply) {
                    currentChainDepth++;
                } else {
                    currentChainDepth = 1;
                }
                lastWasReply = true;
            } else {
                if (lastWasReply && currentChainDepth > 0) {
                    // End of a chain, record it
                    depthCounts[currentChainDepth] = (depthCounts[currentChainDepth] || 0) + 1;
                }
                currentChainDepth = 0;
                lastWasReply = false;
            }
        }
        // Flush last chain
        if (lastWasReply && currentChainDepth > 0) {
            depthCounts[currentChainDepth] = (depthCounts[currentChainDepth] || 0) + 1;
        }
    }

    const histogram = Object.entries(depthCounts)
        .map(([d, count]) => ({ depth: Number(d), count }))
        .sort((a, b) => a.depth - b.depth);

    const maxDepth = histogram.length > 0 ? histogram[histogram.length - 1].depth : 0;
    const totalChains = histogram.reduce((s, h) => s + h.count, 0);
    const weightedSum = histogram.reduce((s, h) => s + h.depth * h.count, 0);
    const avgDepth = totalChains > 0 ? weightedSum / totalChains : 0;

    return {
        histogram,
        avgDepth: Math.round(avgDepth * 10) / 10,
        maxDepth,
        replyPercentage: totalMessages > 0 ? Math.round((totalReplies / totalMessages) * 100) : 0,
        totalReplies,
    };
}

// ─── Questions vs. Answers Stats ──────────────────────────────────────────

export interface QAStats {
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: number;
    answerRate: number;
    topAskers: { name: string; count: number }[];
    topAnswerers: { name: string; count: number }[];
}

export function computeQAStats(data: ChannelData[]): QAStats {
    let totalQuestions = 0;
    let answeredQuestions = 0;
    const askerCounts: Record<string, number> = {};
    const answererCounts: Record<string, number> = {};

    for (const ch of data) {
        const sorted = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);

        for (let i = 0; i < sorted.length; i++) {
            const msg = sorted[i];
            const content = (msg.content || '').trim();

            // Detect questions: contains '?' and is not just '?' alone
            if (content.includes('?') && content.length > 1) {
                totalQuestions++;
                askerCounts[msg.author] = (askerCounts[msg.author] || 0) + 1;

                // Look ahead up to 10 messages for a response
                let found = false;
                for (let j = i + 1; j < Math.min(i + 11, sorted.length); j++) {
                    const response = sorted[j];
                    // A response is from a different author, not a question itself
                    if (response.author !== msg.author) {
                        const rContent = (response.content || '').trim();
                        if (rContent.length > 0 && !rContent.endsWith('?')) {
                            answeredQuestions++;
                            answererCounts[response.author] = (answererCounts[response.author] || 0) + 1;
                            found = true;
                            break;
                        }
                    }
                }
                // If the question was replied to directly, also count as answered
                if (!found) {
                    for (let j = i + 1; j < Math.min(i + 11, sorted.length); j++) {
                        if (sorted[j].replyAuthor === msg.author) {
                            answeredQuestions++;
                            answererCounts[sorted[j].author] = (answererCounts[sorted[j].author] || 0) + 1;
                            break;
                        }
                    }
                }
            }
        }
    }

    const topAskers = Object.entries(askerCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const topAnswerers = Object.entries(answererCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        totalQuestions,
        answeredQuestions,
        unansweredQuestions: totalQuestions - answeredQuestions,
        answerRate: totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0,
        topAskers,
        topAnswerers,
    };
}

// ─── User Interaction Network ─────────────────────────────────────────────

export interface NetworkNode {
    id: string;
    messageCount: number;
}

export interface NetworkLink {
    source: string;
    target: string;
    weight: number;
}

export interface InteractionNetwork {
    nodes: NetworkNode[];
    links: NetworkLink[];
}

export function computeInteractionNetwork(data: ChannelData[], nodeLimit = 20): InteractionNetwork {
    // Count messages per user
    const userMsgCounts: Record<string, number> = {};
    const pairCounts: Record<string, number> = {};

    for (const ch of data) {
        for (const msg of ch.messages) {
            userMsgCounts[msg.author] = (userMsgCounts[msg.author] || 0) + 1;

            if (msg.replyAuthor && msg.replyAuthor.trim() && msg.author !== msg.replyAuthor) {
                // Normalize edge direction (alphabetical) so A->B and B->A share the same edge
                const [a, b] = [msg.author, msg.replyAuthor].sort();
                const key = `${a}|||${b}`;
                pairCounts[key] = (pairCounts[key] || 0) + 1;
            }
        }
    }

    // Pick top N users by message count
    const topUsers = Object.entries(userMsgCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, nodeLimit);

    const topUserSet = new Set(topUsers.map(([name]) => name));

    const nodes: NetworkNode[] = topUsers.map(([id, messageCount]) => ({ id, messageCount }));

    const links: NetworkLink[] = Object.entries(pairCounts)
        .filter(([key]) => {
            const [a, b] = key.split('|||');
            return topUserSet.has(a) && topUserSet.has(b);
        })
        .map(([key, weight]) => {
            const [source, target] = key.split('|||');
            return { source, target, weight };
        })
        .filter(l => l.weight >= 2) // Remove very weak connections
        .sort((a, b) => b.weight - a.weight);

    return { nodes, links };
}
