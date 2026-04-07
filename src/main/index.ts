import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { RenderQueue } from './queue'
import { getDefaultBlenderPaths } from './blender'
import { readBlendInfo } from './blend-reader'
import { store } from './store'
import { QueueState } from './types'

let mainWindow: BrowserWindow | null = null

// Initialise queue with persisted Blender path
const queue = new RenderQueue((state: QueueState) => {
  mainWindow?.webContents.send('queue:state', state)
})
if (store.blenderPath) queue.setBlenderPath(store.blenderPath)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Fox Blender Queue',
    backgroundColor: '#1a1a2e',
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

// --- IPC Handlers ---

ipcMain.handle('queue:get-state', () => queue.getState())

ipcMain.handle('queue:add-job', (_e, params) => queue.addJob(params))
ipcMain.handle('queue:remove-job', (_e, id: string) => queue.removeJob(id))
ipcMain.handle('queue:reorder', (_e, ids: string[]) => queue.reorderJobs(ids))
ipcMain.handle('queue:start', () => queue.startQueue())
ipcMain.handle('queue:pause', () => queue.pauseQueue())
ipcMain.handle('queue:cancel-job', (_e, id: string) => queue.cancelJob(id))
ipcMain.handle('queue:retry-job', (_e, id: string) => queue.retryJob(id))
ipcMain.handle('queue:update-job-params', (_e, id: string, patch) => queue.updateJobParams(id, patch))

// Load the last rendered frame as a resized thumbnail (480px wide max)
ipcMain.handle('render:frame-preview', (_e, filePath: string): string | null => {
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return null
    return `data:image/png;base64,${img.resize({ width: 480 }).toPNG().toString('base64')}`
  } catch { return null }
})

ipcMain.handle('queue:set-blender-path', (_e, path: string) => {
  queue.setBlenderPath(path)
  store.blenderPath = path  // persist to disk
})

ipcMain.handle('dialog:open-blend', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select .blend file',
    filters: [{ name: 'Blender Files', extensions: ['blend'] }],
    properties: ['openFile']
  })
  return result.canceled ? null : result.filePaths[0]
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

ipcMain.handle('blender:detect', () => {
  const paths = getDefaultBlenderPaths()
  return paths.find((p) => {
    try { return existsSync(p) } catch { return false }
  }) ?? null
})

ipcMain.handle('shell:open-path', (_e, path: string) => shell.openPath(path))

ipcMain.handle('blend:read-info', (_e, filePath: string) =>
  readBlendInfo(filePath, queue.getState().blenderPath)
)
