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
