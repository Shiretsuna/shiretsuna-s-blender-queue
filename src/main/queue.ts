import { ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { RenderJob, QueueState, JobStatus, OutputFormat } from './types'
import { spawnBlender } from './blender'

type StateChangeCallback = (state: QueueState) => void

export type JobParamPatch = {
  name?: string
  frameStart?: number
  frameEnd?: number
  frameStep?: number
  outputPath?: string
  outputFormat?: OutputFormat
  samples?: number
  resolutionX?: number
  resolutionY?: number
  resolutionScale?: number
  threads?: number
}

const QUEUE_FILE = join(app.getPath('userData'), 'queue.json')

function saveQueueToDisk(jobs: RenderJob[]): void {
  try {
    // Reset running jobs to pending so they resume correctly on next launch
    const toSave = jobs.map((j): RenderJob =>
      j.status === 'running'
        ? { ...j, status: 'pending', resumeFromFrame: j.currentFrame ?? j.frameStart, progress: 0, etaMs: undefined }
        : j
    )
    writeFileSync(QUEUE_FILE, JSON.stringify(toSave, null, 2), 'utf8')
  } catch { /* non-fatal */ }
}

function loadQueueFromDisk(): RenderJob[] {
  try {
    if (!existsSync(QUEUE_FILE)) return []
    const raw = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

export class RenderQueue {
  private state: QueueState
  private activeProcesses = new Map<string, ChildProcess>()
  private onStateChange: StateChangeCallback
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(onStateChange: StateChangeCallback) {
    this.onStateChange = onStateChange
    this.state = {
      jobs: loadQueueFromDisk(),
      isRunning: false,
      blenderPath: 'blender',
      defaultOutputPath: '',
      defaultOutputEnabled: false,
      concurrentJobs: 1
    }
  }

  getState(): QueueState { return this.state }

  setBlenderPath(p: string): void {
    this.state = { ...this.state, blenderPath: p }
    this.emit()
  }

  setBlenderVersion(v: string | null): void {
    this.state = { ...this.state, blenderVersion: v ?? undefined }
    this.emit()
  }

  setDefaultOutput(path: string, enabled: boolean): void {
    this.state = { ...this.state, defaultOutputPath: path, defaultOutputEnabled: enabled }
    this.emit()
  }

  setConcurrentJobs(n: number): void {
    this.state = { ...this.state, concurrentJobs: Math.max(1, Math.min(8, n)) }
    this.emit()
    if (this.state.isRunning) this.tick()
  }

  addJob(params: Omit<RenderJob, 'id' | 'status' | 'progress' | 'log'>): RenderJob {
    const job: RenderJob = { ...params, id: randomUUID(), status: 'pending', progress: 0, log: [] }
    this.state = { ...this.state, jobs: [...this.state.jobs, job] }
    this.emit()
    if (this.state.isRunning) this.tick()
    return job
  }

  removeJob(id: string): void {
    if (this.state.jobs.find((j) => j.id === id)?.status === 'running') this.killProcess(id)
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
    // Kill all active processes, reset running jobs to pending with a resume point
    for (const job of this.state.jobs) {
      if (job.status !== 'running') continue
      this.killProcess(job.id)
      this.updateJob(job.id, {
        status: 'pending',
        resumeFromFrame: job.currentFrame ?? job.frameStart,
        progress: 0,
        etaMs: undefined
      })
    }
    this.state = { ...this.state, isRunning: false }
    this.emit()
  }

  cancelJob(id: string): void {
    if (!this.state.jobs.find((j) => j.id === id)) return
    if (this.state.jobs.find((j) => j.id === id)?.status === 'running') this.killProcess(id)
    this.updateJob(id, { status: 'cancelled', progress: 0, resumeFromFrame: undefined, etaMs: undefined })
    if (this.state.isRunning) this.tick()
  }

  retryJob(id: string): void {
    this.updateJob(id, {
      status: 'pending', progress: 0,
      error: undefined, log: [],
      lastFramePath: undefined, resumeFromFrame: undefined, etaMs: undefined
    })
    if (this.state.isRunning) this.tick()
  }

  updateJobParams(id: string, patch: Partial<JobParamPatch>): void {
    const job = this.state.jobs.find((j) => j.id === id)
    if (!job || job.status === 'running') return
    this.updateJob(id, patch)
  }

  private killProcess(id: string): void {
    const proc = this.activeProcesses.get(id)
    if (proc) { try { proc.kill() } catch { /* ignore */ } this.activeProcesses.delete(id) }
  }

  private tick(): void {
    if (!this.state.isRunning) return

    const runningCount = this.state.jobs.filter((j) => j.status === 'running').length
    const slots = this.state.concurrentJobs - runningCount

    if (slots <= 0) return

    const pending = this.state.jobs.filter((j) => j.status === 'pending')

    if (pending.length === 0 && runningCount === 0) {
      this.state = { ...this.state, isRunning: false }
      this.emit()
      return
    }

    pending.slice(0, slots).forEach((job) => this.runJob(job))
  }

  private runJob(job: RenderJob): void {
    const startFrame = job.resumeFromFrame ?? job.frameStart
    const grandTotal = Math.floor((job.frameEnd - job.frameStart) / job.frameStep) + 1
    const alreadyDone = Math.floor((startFrame - job.frameStart) / job.frameStep)
    const remaining = grandTotal - alreadyDone
    let renderedThisRun = 0

    this.updateJob(job.id, {
      status: 'running',
      progress: alreadyDone > 0 ? Math.round((alreadyDone / grandTotal) * 100) : 0,
      startedAt: Date.now(),
      log: job.resumeFromFrame ? job.log : [],
      resumeFromFrame: undefined,
      etaMs: undefined
    })

    const proc = spawnBlender(
      this.state.blenderPath,
      job,
      startFrame,
      (frame, line, savedPath) => {
        this.appendLog(job.id, line)

        if (savedPath) {
          this.updateJob(job.id, { lastFramePath: savedPath })
        } else {
          renderedThisRun++
          const totalRendered = alreadyDone + renderedThisRun
          const progress = Math.min(Math.round((totalRendered / grandTotal) * 100), 99)

          const currentJob = this.state.jobs.find((j) => j.id === job.id)
          const elapsed = Date.now() - (currentJob?.startedAt ?? Date.now())
          const avgPerFrame = renderedThisRun > 0 ? elapsed / renderedThisRun : 0
          const etaMs = avgPerFrame > 0 ? Math.round(avgPerFrame * (remaining - renderedThisRun)) : undefined

          this.updateJob(job.id, { currentFrame: frame, progress, etaMs })
        }
      },
      (exitCode, error) => {
        this.activeProcesses.delete(job.id)
        const completedAt = Date.now()
        const started = this.state.jobs.find((j) => j.id === job.id)?.startedAt ?? completedAt

        if (error) {
          this.updateJob(job.id, { status: 'failed', error, completedAt, durationMs: completedAt - started, etaMs: undefined })
        } else {
          this.updateJob(job.id, { status: 'completed', progress: 100, completedAt, durationMs: completedAt - started, etaMs: undefined })
        }
        this.tick()
      }
    )

    this.activeProcesses.set(job.id, proc)
  }

  private appendLog(id: string, line: string): void {
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) =>
        j.id === id ? { ...j, log: [...j.log.slice(-299), line] } : j
      )
    }
    this.onStateChange(this.state) // emit without persisting on every log line
  }

  private updateJob(id: string, patch: Partial<RenderJob>): void {
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j))
    }
    this.emit()
  }

  private emit(): void {
    this.onStateChange(this.state)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => saveQueueToDisk(this.state.jobs), 1000)
  }
}
