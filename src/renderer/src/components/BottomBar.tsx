import { QueueState } from '../../../main/types'
import styles from './BottomBar.module.css'

interface Props {
  state: QueueState
}

export function BottomBar({ state }: Props): JSX.Element {
  const { jobs } = state
  const total = jobs.length
  const completed = jobs.filter((j) => j.status === 'completed').length
  const failed = jobs.filter((j) => j.status === 'failed').length
  const running = jobs.find((j) => j.status === 'running')

  // Overall progress: each completed job = 100 pts, running job = its progress
  const totalPts = total * 100
  const donePts = completed * 100 + (running?.progress ?? 0)
  const overallPct = total === 0 ? 0 : Math.round((donePts / totalPts) * 100)

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {total === 0 ? (
          <span className={styles.idle}>Queue empty</span>
        ) : (
          <>
            <span className={styles.stat}>{completed}/{total} done</span>
            {failed > 0 && <span className={styles.failed}>{failed} failed</span>}
            {running && (
              <span className={styles.currentJob}>
                Rendering: <em>{running.name}</em>
                {running.currentFrame != null && ` — frame ${running.currentFrame}`}
                {running.etaMs != null && running.etaMs > 0 && (
                  <span className={styles.eta}> · ~{formatDuration(running.etaMs)} left</span>
                )}
              </span>
            )}
          </>
        )}
      </div>

      <div className={styles.right}>
        {total > 0 && (
          <>
            <span className={styles.pct}>{overallPct}%</span>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${overallPct}%` }} />
              {running && (
                <div
                  className={styles.runningFill}
                  style={{
                    left: `${(completed / total) * 100}%`,
                    width: `${(running.progress / 100) * (1 / total) * 100}%`
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
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
