import { contextBridge, ipcRenderer } from 'electron'
import { QueueState, RenderJob, BlendInfo } from '../main/types'

type AddJobParams = Omit<RenderJob, 'id' | 'status' | 'progress' | 'log'>

const api = {
  getState: (): Promise<QueueState> => ipcRenderer.invoke('queue:get-state'),
  addJob: (params: AddJobParams): Promise<RenderJob> => ipcRenderer.invoke('queue:add-job', params),
  removeJob: (id: string): Promise<void> => ipcRenderer.invoke('queue:remove-job', id),
  reorderJobs: (ids: string[]): Promise<void> => ipcRenderer.invoke('queue:reorder', ids),
  startQueue: (): Promise<void> => ipcRenderer.invoke('queue:start'),
  pauseQueue: (): Promise<void> => ipcRenderer.invoke('queue:pause'),
  cancelJob: (id: string): Promise<void> => ipcRenderer.invoke('queue:cancel-job', id),
  retryJob: (id: string): Promise<void> => ipcRenderer.invoke('queue:retry-job', id),
  setBlenderPath: (path: string): Promise<void> => ipcRenderer.invoke('queue:set-blender-path', path),

  openBlendDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-blend'),
  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-folder'),
  openBlenderExeDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-blender-exe'),

  detectBlender: (): Promise<string | null> => ipcRenderer.invoke('blender:detect'),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('shell:open-path', path),
  readBlendInfo: (filePath: string): Promise<BlendInfo> => ipcRenderer.invoke('blend:read-info', filePath),
  updateJobParams: (id: string, patch: Partial<RenderJob>): Promise<void> => ipcRenderer.invoke('queue:update-job-params', id, patch),
  readFramePreview: (filePath: string): Promise<string | null> => ipcRenderer.invoke('render:frame-preview', filePath),

  onStateUpdate: (cb: (state: QueueState) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: QueueState): void => cb(state)
    ipcRenderer.on('queue:state', handler)
    return () => ipcRenderer.removeListener('queue:state', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
