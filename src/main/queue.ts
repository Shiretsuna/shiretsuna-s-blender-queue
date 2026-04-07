import { ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { RenderJob, QueueState } from './types'
import { spawnBlender } from './blender'

type StateChangeCallback = (state: QueueState) => void

export type JobParamPatch = Pick<RenderJob,
  'name' | 'frameStart' | 'frameEnd' | 'frameStep' |
  'samples' | 'resolutionX' | 'resolutionY' | 'resolutionScale' | 'threads'
>

export class RenderQueue {
  private state: QueueState = {
    jobs: [],
    isRunning: false,
    blenderPath: 'blender'
  }
  private activeProcess: ChildProcess | null = null
  private onStateChange: StateChangeCallback

  constructor(onStateChange: StateChangeCallback) {
    this.onStateChange = onStateChange
  }

  getState(): QueueState { return this.state }

  setBlenderPath(p: string): void {
    this.state = { ...this.state, blenderPath: p }
    this.emit()
  }

  addJob(params: Omit<RenderJob, 'id' | 'status' | 'progress' | 'log'>): RenderJob {
    const job: RenderJob = { ...params, id: randomUUID(), status: 'pending', progress: 0, log: [] }
    this.state = { ...this.state, jobs: [...this.state.jobs, job] }
    this.emit()
    if (this.state.isRunning) this.tick()
    return job
  }

  removeJob(id: string): void {
    if (this.state.jobs.find((j) => j.id === id)?.status === 'running') this.cancelCurrent()
    this.state = { ...this.state, jobs: this.state.jobs.filter((j) => j.id !== id) }
    this.emit()
    if (this.state.isRunning) this.tick()
  }

  reorderJobs(ids: string[]): void {
    const map = new Map(this.state.jobs.map((j) => [j.id, j]))
    this.state = { ...this.state, jobs: ids.map((id) => map.get(id)).filter(Boolean) as RenderJob[] }
    this.emit()
  }

  startQueue(): void {
    if (this.state.isRunning) return
    this.state = { ...this.state, isRunning: true }
    this.emit()
    this.tick()
  }

  pauseQueue(): void {
    this.state = { ...this.state, isRunning: false }
    this.emit()
  }

  cancelJob(id: string): void {
    if (!this.state.jobs.find((j) => j.id === id)) return
    if (this.state.jobs.find((j) => j.id === id)?.status === 'running') this.cancelCurrent()
    this.updateJob(id, { status: 'cancelled', progress: 0 })
    if (this.state.isRunning) this.tick()
  }

  retryJob(id: string): void {
    this.updateJob(id, { status: 'pending', progress: 0, error: undefined, log: [], lastFramePath: undefined })
    if (this.state.isRunning) this.tick()
  }

  /** Patch editable params on a non-running job */
  updateJobParams(id: string, patch: Partial<JobParamPatch>): void {
    const job = this.state.jobs.find((j) => j.id === id)
    if (!job || job.status === 'running') return
    this.updateJob(id, patch)
  }

  private cancelCurrent(): void {
    this.activeProcess?.kill()
    this.activeProcess = null
  }

  private tick(): void {
    if (!this.state.isRunning) return
    if (this.state.jobs.find((j) => j.status === 'running')) return

    const next = this.state.jobs.find((j) => j.status === 'pending')
    if (!next) {
      this.state = { ...this.state, isRunning: false }
      this.emit()
      return
    }
    this.runJob(next)
  }

  private runJob(job: RenderJob): void {
    const totalFrames = Math.floor((job.frameEnd - job.frameStart) / job.frameStep) + 1
    let renderedFrames = 0

    this.updateJob(job.id, { status: 'running', progress: 0, startedAt: Date.now(), log: [] })

    this.activeProcess = spawnBlender(
      this.state.blenderPath,
      job,
      (frame, line, savedPath) => {
        this.appendLog(job.id, line)

        if (savedPath) {
          // Frame file was written — store path for preview, don't count toward progress
          this.updateJob(job.id, { lastFramePath: savedPath })
        } else {
          // Fra: line — frame started, count toward progress
          renderedFrames++
          const progress = Math.min(Math.round((renderedFrames / totalFrames) * 100), 99)
          this.updateJob(job.id, { currentFrame: frame, progress })
        }
      },
      (exitCode, error) => {
        this.activeProcess = null
        const completedAt = Date.now()
        const started = this.state.jobs.find((j) => j.id === job.id)?.startedAt ?? completedAt

        if (error) {
          this.updateJob(job.id, { status: 'failed', error, completedAt, durationMs: completedAt - started })
        } else {
          this.updateJob(job.id, { status: 'completed', progress: 100, completedAt, durationMs: completedAt - started })
        }
        this.tick()
      }
    )
  }

  private appendLog(id: string, line: string): void {
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) =>
        j.id === id ? { ...j, log: [...j.log.slice(-199), line] } : j
      )
    }
    this.emit()
  }

  private updateJob(id: string, patch: Partial<RenderJob>): void {
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j))
    }
    this.emit()
  }

  private emit(): void { this.onStateChange(this.state) }
}
