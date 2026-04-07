import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync } from 'fs'
import { RenderQueue } from './queue'
import { getDefaultBlenderPaths, getBlenderVersion } from './blender'
import { readBlendInfo } from './blend-reader'
import { store } from './store'
import { QueueState } from './types'

let mainWindow: BrowserWindow | null = null

const queue = new RenderQueue((state: QueueState) => {
  mainWindow?.webContents.send('queue:state', state)
})

// Restore persisted settings into queue state
if (store.blenderPath) queue.setBlenderPath(store.blenderPath)
queue.setDefaultOutput(store.defaultOutputPath, store.defaultOutputEnabled)
queue.setConcurrentJobs(store.concurrentJobs)

// Detect Blender version asynchronously on startup
if (store.blenderPath) {
  getBlenderVersion(store.blenderPath).then((v) => queue.setBlenderVersion(v))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Shiretsuna's Blender Queue",
    backgroundColor: '#0b0b15',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Queue IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('queue:get-state', () => queue.getState())
ipcMain.handle('queue:add-job', (_e, params) => queue.addJob(params))
ipcMain.handle('queue:remove-job', (_e, id: string) => queue.removeJob(id))
ipcMain.handle('queue:reorder', (_e, ids: string[]) => queue.reorderJobs(ids))
ipcMain.handle('queue:start', () => queue.startQueue())
ipcMain.handle('queue:pause', () => queue.pauseQueue())
ipcMain.handle('queue:cancel-job', (_e, id: string) => queue.cancelJob(id))
ipcMain.handle('queue:retry-job', (_e, id: string) => queue.retryJob(id))
ipcMain.handle('queue:update-job-params', (_e, id: string, patch) => queue.updateJobParams(id, patch))

ipcMain.handle('queue:set-blender-path', async (_e, path: string) => {
  queue.setBlenderPath(path)
  store.blenderPath = path
  // Re-detect version whenever path changes
  const v = await getBlenderVersion(path)
  queue.setBlenderVersion(v)
})

ipcMain.handle('queue:set-default-output', (_e, path: string, enabled: boolean) => {
  queue.setDefaultOutput(path, enabled)
  store.defaultOutputPath = path
  store.defaultOutputEnabled = enabled
})

ipcMain.handle('queue:set-concurrent-jobs', (_e, n: number) => {
  queue.setConcurrentJobs(n)
  store.concurrentJobs = n
})

// ─── Frame preview ────────────────────────────────────────────────────────────

ipcMain.handle('render:frame-preview', (_e, filePath: string): string | null => {
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return null
    return `data:image/png;base64,${img.resize({ width: 480 }).toPNG().toString('base64')}`
  } catch { return null }
})

// ─── Dialogs ─────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-blend', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select .blend file',
    filters: [{ name: 'Blender Files', extensions: ['blend'] }],
    properties: ['openFile', 'multiSelections']
  })
  return result.canceled ? null : result.filePaths
})

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select output folder',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:open-blender-exe', async () => {
  const filters =
    process.platform === 'win32'
      ? [{ name: 'Executables', extensions: ['exe'] }]
      : [{ name: 'All Files', extensions: ['*'] }]
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Blender executable',
    filters,
    properties: ['openFile']
  })
  return result.canceled ? null : result.filePaths[0]
})

// ─── Blender detection ───────────────────────────────────────────────────────

ipcMain.handle('blender:detect', () => {
  const paths = getDefaultBlenderPaths()
  return paths.find((p) => { try { return existsSync(p) } catch { return false } }) ?? null
})

// ─── Shell / filesystem ──────────────────────────────────────────────────────

ipcMain.handle('shell:open-path', (_e, path: string) => shell.openPath(path))

ipcMain.handle('blend:read-info', (_e, filePath: string) =>
  readBlendInfo(filePath, queue.getState().blenderPath)
)

ipcMain.handle('queue:export-log', async (_e, jobId: string) => {
  const job = queue.getState().jobs.find((j) => j.id === jobId)
  if (!job) return

  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Render Log',
    defaultPath: `${job.name.replace(/[^\w\s-]/g, '')}-render-log.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  })
  if (result.canceled || !result.filePath) return

  const lines = [
    `Job:      ${job.name}`,
    `File:     ${job.blendFile}`,
    `Engine:   ${job.engine}`,
    `Frames:   ${job.frameStart}–${job.frameEnd} step ${job.frameStep}`,
    `Status:   ${job.status}`,
    `Duration: ${job.durationMs != null ? (job.durationMs / 1000).toFixed(1) + 's' : 'N/A'}`,
    job.error ? `Error:    ${job.error}` : null,
    '',
    '─'.repeat(60),
    '',
    ...job.log
  ].filter((l) => l !== null).join('\n')

  writeFileSync(result.filePath, lines, 'utf8')
})
