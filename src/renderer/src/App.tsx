import { useEffect, useState, useCallback, useRef } from 'react'
import { QueueState, RenderJob, BlendInfo } from '../../main/types'
import { JobList } from './components/JobList'
import { AddJobPanel } from './components/AddJobPanel'
import { JobDetailPanel } from './components/JobDetailPanel'
import { Toolbar } from './components/Toolbar'
import { SettingsModal } from './components/SettingsModal'
import { BottomBar } from './components/BottomBar'
import { SetupModal } from './components/SetupModal'
import styles from './styles/App.module.css'

declare global {
  interface Window {
    api: import('../../preload/index').API
  }
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
  const dragCounter = useRef(0)

  useEffect(() => {
    window.api.getState().then((s) => {
      setState(s)
      // Show setup if no Blender path has been configured yet
      if (!s.blenderPath) setShowSetup(true)
    })
    const unsub = window.api.onStateUpdate(setState)
    return unsub
  }, [])

  const openAddPanel = useCallback((data: BlendInfo | null = null) => {
    setAddPanelData(data)
    setShowAddPanel(true)
  }, [])

  // --- Drag & Drop ---
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    const hasBlend = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file' && (item.type === '' || item.type.includes('blend'))
    )
    if (hasBlend || e.dataTransfer.items.length > 0) setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.blend')
    )
    if (files.length === 0) return

    // Use the first dropped .blend file
    const file = files[0]
    // Electron exposes the real path on File objects
    const filePath = (file as unknown as { path: string }).path
    if (!filePath) return

    setIsReadingBlend(true)
    try {
      const info = await window.api.readBlendInfo(filePath)
      openAddPanel({ ...info, filePath })
    } catch {
      openAddPanel({ thumbnail: null, filePath })
    } finally {
      setIsReadingBlend(false)
    }
  }, [openAddPanel])

  // Auto-select the running job; fall back to last selected
  const runningJob = state?.jobs.find((j) => j.status === 'running')
  const effectiveJobId = runningJob ? runningJob.id : selectedJobId
  const selectedJob: RenderJob | undefined = state?.jobs.find((j) => j.id === effectiveJobId)

  const handleSelectJob = useCallback((id: string) => {
    setSelectedJobId((prev) => (prev === id ? null : id))
  }, [])

  if (!state) {
    return <div className={styles.loading}>Loading...</div>
  }

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
        onAddJob={() => openAddPanel(null)}
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
          />
        </div>

        <div className={styles.detailPanel}>
          <JobDetailPanel
            job={selectedJob}
            onClose={() => setSelectedJobId(null)}
          />
        </div>
      </div>

      <BottomBar state={state} />

      {/* Drag overlay */}
      {isDragOver && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragBox}>
            <span className={styles.dragIcon}>⬇</span>
            <span>Drop .blend file to add to queue</span>
          </div>
        </div>
      )}

      {/* Reading blend file overlay */}
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
          onAdd={async (params) => {
            await window.api.addJob(params)
            setShowAddPanel(false)
            setAddPanelData(null)
          }}
          onClose={() => {
            setShowAddPanel(false)
            setAddPanelData(null)
          }}
        />
      )}

      {showSetup && (
        <SetupModal onDone={() => setShowSetup(false)} />
      )}

      {showSettings && (
        <SettingsModal
          state={state}
          onSetBlenderPath={async (path) => {
            await window.api.setBlenderPath(path)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
