import { useEffect, useState, useCallback, useRef } from 'react'
import { QueueState, RenderJob, BlendInfo, RenderEngine, OutputFormat } from '../../main/types'
import { JobList } from './components/JobList'
import { AddJobPanel } from './components/AddJobPanel'
import { JobDetailPanel } from './components/JobDetailPanel'
import { Toolbar } from './components/Toolbar'
import { SettingsModal } from './components/SettingsModal'
import { BottomBar } from './components/BottomBar'
import { SetupModal } from './components/SetupModal'
import styles from './styles/App.module.css'

declare global {
  interface Window { api: import('../../preload/index').API }
}

const VALID_ENGINES: RenderEngine[] = ['CYCLES', 'BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT']
function toEngine(raw?: string): RenderEngine {
  return raw && VALID_ENGINES.includes(raw as RenderEngine) ? raw as RenderEngine : 'CYCLES'
}
function sanitizeOutputPath(p: string): string {
  return p.replace(/^\/\//, '').replace(/\\/g, '/')
}

export default function App(): JSX.Element {
  const [state, setState] = useState<QueueState | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [addPanelData, setAddPanelData] = useState<(BlendInfo & { filePath?: string }) | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isReadingBlend, setIsReadingBlend] = useState(false)
  const [detailWidth, setDetailWidth] = useState(360)
  const dragCounter = useRef(0)
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)
  const prevStateRef = useRef<QueueState | null>(null)

  useEffect(() => {
    window.api.getState().then((s) => {
      setState(s)
      if (!s.blenderPath) setShowSetup(true)
    })
    const unsub = window.api.onStateUpdate(setState)
    return unsub
  }, [])

  // Notifications
  useEffect(() => {
    if (!state || !prevStateRef.current) { prevStateRef.current = state; return }
    const prev = prevStateRef.current

    state.jobs.forEach((job) => {
      const prevJob = prev.jobs.find((j) => j.id === job.id)
      if (job.status === 'failed' && prevJob?.status !== 'failed') {
        new Notification(`Render failed: ${job.name}`, { body: job.error || 'An error occurred' })
      }
    })

    if (prev.isRunning && !state.isRunning && state.jobs.length > 0) {
      const failed = state.jobs.filter((j) => j.status === 'failed').length
      const done = state.jobs.filter((j) => j.status === 'completed').length
      if (done + failed === state.jobs.length) {
        new Notification("Queue complete", {
          body: failed > 0
            ? `${done} rendered, ${failed} failed`
            : `All ${done} files rendered successfully!`
        })
      }
    }

    prevStateRef.current = state
  }, [state])

  // Resizable panel
  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = detailWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [detailWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const delta = resizeStartX.current - e.clientX
      setDetailWidth(Math.min(620, Math.max(240, resizeStartW.current + delta)))
    }
    const onUp = () => {
      if (!isResizing.current) return
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const openAddPanel = useCallback((data: (BlendInfo & { filePath?: string }) | null = null) => {
    setAddPanelData(data)
    setShowAddPanel(true)
  }, [])

  // Add multiple files automatically (no panel)
  const addFilesDirectly = useCallback(async (filePaths: string[]) => {
    if (!state) return
    for (const filePath of filePaths) {
      const name = filePath.replace(/\\/g, '/').split('/').pop()?.replace('.blend', '') || 'Render'
      try {
        const info = await window.api.readBlendInfo(filePath)
        await window.api.addJob({
          name: info.sceneName || name,
          blendFile: filePath,
          outputPath: state.defaultOutputEnabled && state.defaultOutputPath
            ? `${state.defaultOutputPath.replace(/\\/g, '/')}/${name}/frame_####`
            : (info.outputPath ? sanitizeOutputPath(info.outputPath) : undefined),
          engine: toEngine(info.engine),
          frameStart: info.frameStart ?? 1,
          frameEnd: info.frameEnd ?? 250,
          frameStep: info.frameStep ?? 1,
          threads: 0,
          samples: info.samples,
          resolutionX: info.resolutionX,
          resolutionY: info.resolutionY,
          resolutionScale: info.resolutionScale,
          thumbnail: info.thumbnail ?? undefined
        })
      } catch {
        await window.api.addJob({ name, blendFile: filePath, engine: 'CYCLES', frameStart: 1, frameEnd: 250, frameStep: 1, threads: 0 })
      }
    }
  }, [state])

  // Drag & drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.items.length > 0) setIsDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragOver(false)
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)

    const filePaths = Array.from(e.dataTransfer.files)
      .filter((f) => f.name.toLowerCase().endsWith('.blend'))
      .map((f) => (f as unknown as { path: string }).path)
      .filter(Boolean)

    if (filePaths.length === 0) return

    setIsReadingBlend(true)
    try {
      if (filePaths.length === 1) {
        const info = await window.api.readBlendInfo(filePaths[0]).catch(() => ({ thumbnail: null }))
        openAddPanel({ ...info, filePath: filePaths[0] })
      } else {
        await addFilesDirectly(filePaths)
      }
    } finally {
      setIsReadingBlend(false)
    }
  }, [openAddPanel, addFilesDirectly])

  // Toolbar add button — opens file picker (multi-select)
  const handleAddClick = useCallback(async () => {
    const paths = await window.api.openBlendDialog()
    if (!paths || paths.length === 0) return

    if (paths.length === 1) {
      setIsReadingBlend(true)
      try {
        const info = await window.api.readBlendInfo(paths[0]).catch(() => ({ thumbnail: null }))
        openAddPanel({ ...info, filePath: paths[0] })
      } finally {
        setIsReadingBlend(false)
      }
    } else {
      setIsReadingBlend(true)
      try { await addFilesDirectly(paths) }
      finally { setIsReadingBlend(false) }
    }
  }, [openAddPanel, addFilesDirectly])

  const runningJob = state?.jobs.find((j) => j.status === 'running')
  const effectiveJobId = runningJob ? runningJob.id : selectedJobId
  const selectedJob: RenderJob | undefined = state?.jobs.find((j) => j.id === effectiveJobId)

  const handleSelectJob = useCallback((id: string) => {
    setSelectedJobId((prev) => (prev === id ? null : id))
  }, [])

  if (!state) return <div className={styles.loading}>Loading...</div>

  const parentDir = (p: string) => p.replace(/\\/g, '/').replace(/\/[^/]+$/, '')

  return (
    <div
      className={styles.layout}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toolbar
        state={state}
        onStart={() => window.api.startQueue()}
        onPause={() => window.api.pauseQueue()}
        onAddJob={handleAddClick}
        onSettings={() => setShowSettings(true)}
      />

      <div className={styles.main}>
        <div className={styles.queuePanel}>
          <JobList
            jobs={state.jobs}
            selectedJobId={selectedJobId}
            onSelect={handleSelectJob}
            onRemove={(id) => window.api.removeJob(id)}
            onCancel={(id) => window.api.cancelJob(id)}
            onRetry={(id) => window.api.retryJob(id)}
            onOpenFolder={(id) => {
              const job = state.jobs.find((j) => j.id === id)
              if (!job) return
              const target = job.lastFramePath ? parentDir(job.lastFramePath) : parentDir(job.blendFile)
              window.api.openPath(target)
            }}
            onReorder={(ids) => window.api.reorderJobs(ids)}
          />
        </div>

        <div className={styles.resizer} onMouseDown={handleResizerMouseDown} />

        <div className={styles.detailPanel} style={{ width: detailWidth }}>
          <JobDetailPanel job={selectedJob} onClose={() => setSelectedJobId(null)} />
        </div>
      </div>

      <BottomBar state={state} />

      {isDragOver && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragBox}>
            <span className={styles.dragIcon}>⬇</span>
            <span>Drop .blend file{state.jobs.length > 0 ? 's' : ''} to add</span>
          </div>
        </div>
      )}

      {isReadingBlend && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragBox}>
            <span className={styles.spinner} />
            <span>Reading scene info...</span>
          </div>
        </div>
      )}

      {showAddPanel && (
        <AddJobPanel
          initialData={addPanelData}
          defaultOutputPath={state.defaultOutputPath}
          defaultOutputEnabled={state.defaultOutputEnabled}
          onAdd={async (params) => {
            await window.api.addJob(params)
            setShowAddPanel(false)
            setAddPanelData(null)
          }}
          onClose={() => { setShowAddPanel(false); setAddPanelData(null) }}
        />
      )}

      {showSetup && <SetupModal onDone={() => setShowSetup(false)} />}

      {showSettings && (
        <SettingsModal
          state={state}
          onSetBlenderPath={async (path) => { await window.api.setBlenderPath(path) }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
