export type RenderEngine = 'CYCLES' | 'BLENDER_EEVEE' | 'BLENDER_EEVEE_NEXT'

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface RenderJob {
  id: string
  name: string
  blendFile: string
  outputPath?: string
  engine: RenderEngine
  frameStart: number
  frameEnd: number
  frameStep: number
  threads: number // 0 = auto
  samples?: number
  resolutionX?: number
  resolutionY?: number
  resolutionScale?: number
  status: JobStatus
  progress: number // 0–100
  currentFrame?: number
  startedAt?: number
  completedAt?: number
  durationMs?: number
  error?: string
  log: string[]
  thumbnail?: string    // base64 PNG data URL extracted from .blend file
  lastFramePath?: string // absolute path of the last successfully rendered frame
}

export interface BlendInfo {
  thumbnail: string | null
  sceneName?: string
  frameStart?: number
  frameEnd?: number
  frameStep?: number
  outputPath?: string
  engine?: string
  resolutionX?: number
  resolutionY?: number
  resolutionScale?: number
  samples?: number
}

export interface QueueState {
  jobs: RenderJob[]
  isRunning: boolean
  blenderPath: string
  defaultOutputPath: string
  defaultOutputEnabled: boolean
}
