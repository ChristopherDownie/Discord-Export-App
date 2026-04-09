import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VITE_DEV_SERVER_URL = 'http://localhost:5173';
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        titleBarStyle: 'hidden',
        backgroundColor: '#0b0e14',
        webPreferences: {
            preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            sandbox: false, // Required for preload to use require()
        },
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// IPC Handlers
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Choose Export Destination'
    });
    if (result.canceled)
        return null;
    return result.filePaths[0] || null;
});
ipcMain.handle('save-file', async (_event, { filePath, content }) => {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('open-folder', async (_event, folderPath) => {
    try {
        const error = await shell.openPath(folderPath);
        if (error)
            return { success: false, error };
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('open-external', async (_event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('clear-session', async () => {
    try {
        await session.defaultSession.clearStorageData();
        const discordSession = session.fromPartition('persist:discord');
        if (discordSession) {
            await discordSession.clearStorageData();
        }
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
function downloadFile(url, destPath) {
    return new Promise((resolve) => {
        try {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            const proto = url.startsWith('https') ? https : http;
            const makeRequest = (requestUrl) => {
                proto.get(requestUrl, (response) => {
                    // Handle redirects
                    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        makeRequest(response.headers.location);
                        return;
                    }
                    const writer = fs.createWriteStream(destPath);
                    response.pipe(writer);
                    writer.on('finish', () => resolve({ success: true }));
                    writer.on('error', (err) => resolve({ success: false, error: err.message }));
                }).on('error', (err) => {
                    resolve({ success: false, error: err.message });
                });
            };
            makeRequest(url);
        }
        catch (err) {
            resolve({ success: false, error: err.message });
        }
    });
}
ipcMain.handle('download-image', async (_event, { url, destPath }) => {
    return downloadFile(url, destPath);
});
// ─── Settings Persistence ──────────────────────────────────────────────────
const getSettingsPath = () => {
    return path.join(app.getPath('userData'), 'settings.json');
};
ipcMain.handle('load-settings', async () => {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const raw = fs.readFileSync(settingsPath, 'utf-8');
            return { success: true, settings: JSON.parse(raw) };
        }
        return { success: true, settings: {} };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('save-settings', async (_event, settings) => {
    try {
        const settingsPath = getSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
// ─── Report Persistence ──────────────────────────────────────────────────
const getReportsDir = () => {
    const dir = path.join(app.getPath('userData'), 'reports');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
};
ipcMain.handle('save-report', async (_event, report) => {
    try {
        const dir = getReportsDir();
        const filename = report.id + '.json';
        fs.writeFileSync(path.join(dir, filename), JSON.stringify(report), 'utf-8');
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('list-reports', async () => {
    try {
        const dir = getReportsDir();
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        const summaries = [];
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
                const report = JSON.parse(raw);
                summaries.push({
                    id: report.id,
                    serverName: report.serverName || 'Unknown Server',
                    createdAt: report.createdAt,
                    dateRange: report.dateRange,
                    channelCount: report.channelCount || 0,
                    totalMessages: report.totalMessages || 0,
                });
            }
            catch {
                // Skip corrupted files
            }
        }
        // Sort newest first
        summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { success: true, reports: summaries };
    }
    catch (e) {
        return { success: false, error: e.message, reports: [] };
    }
});
ipcMain.handle('load-report', async (_event, reportId) => {
    try {
        const filePath = path.join(getReportsDir(), reportId + '.json');
        const raw = fs.readFileSync(filePath, 'utf-8');
        return { success: true, report: JSON.parse(raw) };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('save-insight', async (_event, { reportId, insight }) => {
    try {
        const filePath = path.join(getReportsDir(), reportId + '.json');
        if (!fs.existsSync(filePath))
            return { success: false, error: 'Report not found' };
        const raw = fs.readFileSync(filePath, 'utf-8');
        const report = JSON.parse(raw);
        if (!report.insights)
            report.insights = [];
        // Add unique ID and timestamp to insight if not present
        const newInsight = {
            ...insight,
            id: insight.id || Date.now().toString(),
            timestamp: insight.timestamp || new Date().toISOString()
        };
        report.insights.push(newInsight);
        fs.writeFileSync(filePath, JSON.stringify(report), 'utf-8');
        return { success: true, insights: report.insights };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('delete-report', async (_event, reportId) => {
    try {
        const filePath = path.join(getReportsDir(), reportId + '.json');
        fs.unlinkSync(filePath);
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
});
