import { useEffect, useRef, useState } from 'react'
import { RenderJob, JobStatus, OutputFormat } from '../../../main/types'
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
  const [editOutput, setEditOutput] = useState(job.outputPath ?? '')
  const [editFormat, setEditFormat] = useState<OutputFormat | ''>(job.outputFormat ?? '')
  const canEdit = job.status !== 'running'

  // Sync edit fields when a different job is selected
  useEffect(() => {
    setEditStart(String(job.frameStart))
    setEditEnd(String(job.frameEnd))
    setEditStep(String(job.frameStep))
    setEditOutput(job.outputPath ?? '')
    setEditFormat(job.outputFormat ?? '')
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

  const saveOutputPath = (): void => {
    window.api.updateJobParams(job.id, { outputPath: editOutput.trim() || undefined })
  }

  const pickOutputFolder = async (): Promise<void> => {
    const path = await window.api.openFolderDialog()
    if (!path) return
    const val = path.replace(/\\/g, '/') + '/frame_####'
    setEditOutput(val)
    window.api.updateJobParams(job.id, { outputPath: val })
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
              <span>
                {job.progress}%
                {job.etaMs != null && job.etaMs > 0 && (
                  <span className={styles.eta}> · ~{formatDuration(job.etaMs)} left</span>
                )}
              </span>
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

        <div className={styles.formatRow}>
          <label style={{ marginBottom: 0, alignSelf: 'center' }}>Format</label>
          <select
            value={editFormat}
            disabled={!canEdit}
            onChange={(e) => {
              const v = e.target.value as OutputFormat | ''
              setEditFormat(v)
              window.api.updateJobParams(job.id, { outputFormat: v || undefined })
            }}
            style={{ flex: 1 }}
          >
            <option value="">From .blend file</option>
            <option value="PNG">PNG</option>
            <option value="JPEG">JPEG</option>
            <option value="OPEN_EXR">OpenEXR</option>
            <option value="OPEN_EXR_MULTILAYER">OpenEXR Multilayer</option>
            <option value="TIFF">TIFF</option>
            <option value="WEBP">WebP</option>
          </select>
        </div>

        {/* Paths */}
        <div className={styles.sectionLabel}>Paths</div>
        <div className={styles.params}>
          <Param label="File" value={job.blendFile} mono truncate />
        </div>

        <div className={styles.outputRow}>
          <input
            className={styles.outputInput}
            value={editOutput}
            disabled={!canEdit}
            onChange={(e) => setEditOutput(e.target.value)}
            onBlur={saveOutputPath}
            placeholder="From .blend file (leave empty for scene default)"
          />
          {canEdit && (
            <button className={styles.outputPickBtn} onClick={pickOutputFolder} title="Browse">…</button>
          )}
        </div>

        <button className={styles.openFolderBtn} onClick={() => {
          const parentDir = (p: string) => p.replace(/\\/g, '/').replace(/\/[^/]+$/, '')
          const target = job.lastFramePath ? parentDir(job.lastFramePath) : parentDir(job.blendFile)
          window.api.openPath(target)
        }}>
          Open Output Folder ↗
        </button>

        {/* Log */}
        <div className={styles.logHeader}>
          <span className={styles.sectionLabel} style={{ border: 'none', marginTop: 0 }}>Log</span>
          {job.log.length > 0 && (
            <button className={styles.exportBtn} onClick={() => window.api.exportLog(job.id)} title="Export log to file">
              Export ↓
            </button>
          )}
        </div>
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
