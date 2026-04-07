import { RenderJob, JobStatus } from '../../../main/types'
import styles from './JobCard.module.css'

interface Props {
  job: RenderJob
  index: number
  selected: boolean
  isDragging: boolean
  isDragOver: boolean
  onSelect: () => void
  onRemove: () => void
  onCancel: () => void
  onRetry: () => void
  onOpenFolder: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Pending',
  running: 'Rendering',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

export function JobCard({
  job, index, selected, isDragging, isDragOver,
  onSelect, onRemove, onCancel, onRetry, onOpenFolder,
  onDragStart, onDragOver, onDrop, onDragEnd
}: Props): JSX.Element {
  const totalFrames = Math.floor((job.frameEnd - job.frameStart) / job.frameStep) + 1
  const duration = job.durationMs != null ? formatDuration(job.durationMs) : null

  return (
    <div
      className={[
        styles.card,
        styles[job.status],
        selected ? styles.selected : '',
        isDragging ? styles.dragging : '',
        isDragOver ? styles.dragOver : ''
      ].join(' ')}
      onClick={onSelect}
      onDragOver={onDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      {/* Drag handle */}
      <div
        className={styles.dragHandle}
        draggable
        onDragStart={(e) => { e.stopPropagation(); onDragStart() }}
        onDragEnd={onDragEnd}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
      >
        ⠿
      </div>

      {job.thumbnail && (
        <img src={job.thumbnail} alt="" className={styles.thumb} />
      )}

      <div className={styles.content}>
        <div className={styles.header}>
          <span className={styles.index}>#{index + 1}</span>
          <span className={styles.name}>{job.name}</span>
          <span className={`${styles.badge} ${styles[job.status]}`}>
            {job.status === 'running' && <span className={styles.pulseDot} />}
            {STATUS_LABEL[job.status]}
          </span>

          <div className={styles.btns} onClick={(e) => e.stopPropagation()}>
            {(job.status === 'failed' || job.status === 'cancelled') && (
              <button className={styles.btnRetry} onClick={onRetry} title="Retry">↺</button>
            )}
            {(job.status === 'running' || job.status === 'pending') && (
              <button className={styles.btnCancel} onClick={onCancel} title="Cancel">✕</button>
            )}
            {job.status !== 'running' && (
              <button className={styles.btnFolder} onClick={onOpenFolder} title="Open output folder">↗</button>
            )}
            {job.status !== 'running' && (
              <button className={styles.btnRemove} onClick={onRemove} title="Remove">🗑</button>
            )}
          </div>
        </div>

        <div className={styles.meta}>
          <span className={styles.file} title={job.blendFile}>{shortPath(job.blendFile)}</span>
          <span className={styles.sep}>·</span>
          <span>{job.engine}</span>
          <span className={styles.sep}>·</span>
          <span>F{job.frameStart}–{job.frameEnd} ({totalFrames} fr.)</span>
          {duration && <><span className={styles.sep}>·</span><span>{duration}</span></>}
          {job.resumeFromFrame != null && (
            <span className={styles.resumeBadge} title={`Will resume from frame ${job.resumeFromFrame}`}>↩ resume</span>
          )}
        </div>

        {job.status === 'running' && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${job.progress}%` }} />
            </div>
            <span className={styles.progressLabel}>
              {job.currentFrame != null ? `Fr.${job.currentFrame}` : ''} {job.progress}%
              {job.etaMs != null && job.etaMs > 0 && <span className={styles.eta}> ~{formatDuration(job.etaMs)}</span>}
            </span>
          </div>
        )}

        {job.status === 'failed' && job.error && (
          <div className={styles.error}>{job.error}</div>
        )}
      </div>
    </div>
  )
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m ${rem}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
