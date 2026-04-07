import { QueueState } from '../../../main/types'
import styles from './Toolbar.module.css'

interface Props {
  state: QueueState
  onStart: () => void
  onPause: () => void
  onAddJob: () => void
  onSettings: () => void
}

export function Toolbar({ state, onStart, onPause, onAddJob, onSettings }: Props): JSX.Element {
  const { isRunning, jobs } = state
  const pending = jobs.filter((j) => j.status === 'pending').length
  const running = jobs.filter((j) => j.status === 'running').length
  const completed = jobs.filter((j) => j.status === 'completed').length
  const failed = jobs.filter((j) => j.status === 'failed').length

  return (
    <div className={styles.toolbar}>
      <div className={styles.brand}>
        <span className={styles.logo}>&#9650;</span>
        <span className={styles.title}>Shiretsuna&apos;s Blender Queue</span>
        {state.blenderVersion && (
          <span className={styles.version}>Blender {state.blenderVersion}</span>
        )}
      </div>

      <div className={styles.stats}>
        {pending > 0 && <Chip label={`${pending} pending`} color="info" />}
        {running > 0 && <Chip label={`${running} running`} color="warning" />}
        {completed > 0 && <Chip label={`${completed} done`} color="success" />}
        {failed > 0 && <Chip label={`${failed} failed`} color="error" />}
      </div>

      <div className={styles.actions}>
        <button className={styles.btnAdd} onClick={onAddJob}>
          + Add Blend File
        </button>

        {isRunning ? (
          <button className={styles.btnPause} onClick={onPause}>
            ⏸ Pause
          </button>
        ) : (
          <button
            className={styles.btnStart}
            onClick={onStart}
            disabled={pending === 0 && running === 0}
          >
            ▶ Start Queue
          </button>
        )}

        <button className={styles.btnSettings} onClick={onSettings} title="Settings">
          ⚙
        </button>
      </div>
    </div>
  )
}

function Chip({ label, color }: { label: string; color: 'info' | 'warning' | 'success' | 'error' }): JSX.Element {
  return <span className={`${styles.chip} ${styles[color]}`}>{label}</span>
}
