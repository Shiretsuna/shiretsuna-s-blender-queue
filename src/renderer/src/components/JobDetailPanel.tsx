import { useEffect, useRef, useState } from 'react'
import { RenderJob, JobStatus } from '../../../main/types'
import styles from './JobDetailPanel.module.css'

interface Props {
  job?: RenderJob
  onClose: () => void
}

const STATUS_COLOR: Record<JobStatus, string> = {
  pending:   'var(--info)',
  running:   'var(--warning)',
  completed: 'var(--success)',
  failed:    'var(--error)',
  cancelled: 'var(--text-muted)'
}

const STATUS_LABEL: Record<JobStatus, string> = {
  pending:   'Pending',
  running:   'Rendering…',
  completed: 'Completed',
  failed:    'Failed',
  cancelled: 'Cancelled'
}

export function JobDetailPanel({ job, onClose }: Props): JSX.Element {
  if (!job) return <EmptyState />

  return <JobDetail job={job} onClose={onClose} />
}

// --- Empty state when no job is selected ---

function EmptyState(): JSX.Element {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>▤</span>
      <p className={styles.emptyTitle}>No job selected</p>
      <p className={styles.emptyHint}>Click a job in the queue or drag a .blend file to get started.</p>
    </div>
  )
}

// --- Full detail view ---

function JobDetail({ job, onClose }: { job: RenderJob; onClose: () => void }): JSX.Element {
  const logRef = useRef<HTMLDivElement>(null)
  const [framePreview, setFramePreview] = useState<string | null>(null)
  const [editStart, setEditStart] = useState(String(job.frameStart))
  const [editEnd, setEditEnd] = useState(String(job.frameEnd))
  const [editStep, setEditStep] = useState(String(job.frameStep))
  const canEdit = job.status !== 'running'

  // Sync edit fields when a different job is selected
  useEffect(() => {
    setEditStart(String(job.frameStart))
    setEditEnd(String(job.frameEnd))
    setEditStep(String(job.frameStep))
  }, [job.id])

  // Load frame preview thumbnail whenever lastFramePath changes
  useEffect(() => {
    if (!job.lastFramePath) return
    window.api.readFramePreview(job.lastFramePath).then(setFramePreview)
  }, [job.lastFramePath])

  // Auto-scroll log to bottom
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (near) el.scrollTop = el.scrollHeight
  }, [job.log.length])

  const saveFrameRange = (): void => {
    const start = parseInt(editStart)
    const end = parseInt(editEnd)
    const step = Math.max(1, parseInt(editStep) || 1)
    if (isNaN(start) || isNaN(end)) return
    window.api.updateJobParams(job.id, { frameStart: start, frameEnd: end, frameStep: step })
  }

  const totalFrames = Math.floor((job.frameEnd - job.frameStart) / job.frameStep) + 1

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: STATUS_COLOR[job.status] }} />
        <div className={styles.headerMeta}>
          <span className={styles.jobName}>{job.name}</span>
          <span className={styles.statusLabel} style={{ color: STATUS_COLOR[job.status] }}>
            {STATUS_LABEL[job.status]}
          </span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Deselect">✕</button>
      </div>

      <div className={styles.body}>
        {/* Frame preview — last rendered frame */}
        {framePreview && (
          <div className={styles.previewSection}>
            <div className={styles.sectionLabel}>Last Rendered Frame</div>
            <div className={styles.previewWrap}>
              <img src={framePreview} alt="Last rendered frame" className={styles.previewImg} />
              {job.currentFrame != null && (
                <span className={styles.previewFrameBadge}>Frame {job.currentFrame}</span>
              )}
            </div>
          </div>
        )}

        {/* Scene thumbnail (from .blend file) */}
        {!framePreview && job.thumbnail && (
          <div className={styles.previewSection}>
            <div className={styles.sectionLabel}>Scene Preview</div>
            <div className={styles.previewWrap}>
              <img src={job.thumbnail} alt="Scene preview" className={styles.previewImg} />
            </div>
          </div>
        )}

        {/* Progress */}
        {job.status === 'running' && (
          <div className={styles.progressSection}>
            <div className={styles.progressRow}>
              <span>Frame {job.currentFrame ?? '—'}</span>
              <span>{job.progress}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {job.status === 'failed' && job.error && (
          <div className={styles.errorBox}>{job.error}</div>
        )}

        {/* Frame range — editable */}
        <div className={styles.sectionLabel}>Frame Range</div>
        <div className={styles.frameRow}>
          <div className={styles.frameField}>
            <label>Start</label>
            <input
              type="number"
              value={editStart}
              disabled={!canEdit}
              onChange={(e) => setEditStart(e.target.value)}
              onBlur={saveFrameRange}
            />
          </div>
          <span className={styles.frameSep}>→</span>
          <div className={styles.frameField}>
            <label>End</label>
            <input
              type="number"
              value={editEnd}
              disabled={!canEdit}
              onChange={(e) => setEditEnd(e.target.value)}
              onBlur={saveFrameRange}
            />
          </div>
          <div className={styles.frameField}>
            <label>Step</label>
            <input
              type="number"
              min={1}
              value={editStep}
              disabled={!canEdit}
              onChange={(e) => setEditStep(e.target.value)}
              onBlur={saveFrameRange}
            />
          </div>
          <span className={styles.frameCount}>{totalFrames} fr.</span>
        </div>
        {!canEdit && (
          <p className={styles.editHint}>Pause or wait for the job to finish to edit frame range.</p>
        )}

        {/* Job params */}
        <div className={styles.sectionLabel}>Parameters</div>
        <div className={styles.params}>
          <Param label="Engine" value={job.engine} />
          <Param label="Threads" value={job.threads === 0 ? 'Auto' : String(job.threads)} />
          {job.samples != null && <Param label="Samples" value={String(job.samples)} />}
          {job.resolutionX != null && (
            <Param label="Resolution" value={`${job.resolutionX} × ${job.resolutionY ?? '?'} @ ${job.resolutionScale ?? 100}%`} />
          )}
          {job.durationMs != null && <Param label="Duration" value={formatDuration(job.durationMs)} />}
        </div>

        {/* Paths */}
        <div className={styles.sectionLabel}>Paths</div>
        <div className={styles.params}>
          <Param label="File" value={job.blendFile} mono truncate />
          {job.outputPath && <Param label="Output" value={job.outputPath} mono truncate />}
        </div>
        <button className={styles.openFolderBtn} onClick={() => {
          const parentDir = (p: string) => p.replace(/\\/g, '/').replace(/\/[^/]+$/, '')
          const target = job.lastFramePath ? parentDir(job.lastFramePath) : parentDir(job.blendFile)
          window.api.openPath(target)
        }}>
          Open Output Folder ↗
        </button>

        {/* Log */}
        <div className={styles.sectionLabel}>Log</div>
        <div className={styles.log} ref={logRef}>
          {job.log.length === 0
            ? <span className={styles.logEmpty}>No output yet.</span>
            : job.log.map((line, i) => <div key={i} className={styles.logLine}>{line}</div>)
          }
        </div>
      </div>
    </div>
  )
}

function Param({ label, value, mono, truncate }: {
  label: string; value: string; mono?: boolean; truncate?: boolean
}): JSX.Element {
  return (
    <div className={styles.param}>
      <span className={styles.paramLabel}>{label}</span>
      <span
        className={`${styles.paramValue} ${mono ? styles.mono : ''} ${truncate ? styles.truncate : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
