export type RenderEngine = 'CYCLES' | 'BLENDER_EEVEE' | 'BLENDER_EEVEE_NEXT'
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type OutputFormat = 'PNG' | 'JPEG' | 'OPEN_EXR' | 'OPEN_EXR_MULTILAYER' | 'TIFF' | 'WEBP'

export interface RenderJob {
  id: string
  name: string
  blendFile: string
  outputPath?: string
  outputFormat?: OutputFormat
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
  etaMs?: number
  error?: string
  log: string[]
  thumbnail?: string     // base64 PNG data URL
  lastFramePath?: string // absolute path of last saved frame
  resumeFromFrame?: number // set when paused mid-render
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
  blenderVersion?: string
  defaultOutputPath: string
  defaultOutputEnabled: boolean
  concurrentJobs: number
}
