import { spawn, ChildProcess } from 'child_process'
import { RenderJob } from './types'

// "Fra:10 Mem:..." — fires at the start of each frame render
const FRAME_RE = /^Fra:(\d+)\s/m
// "Saved: '/path/to/frame_0001.png'" — fires when a frame file is written
const SAVED_RE = /Saved:\s*'(.+?)'\s/

// savedPath is set only on the Saved: line, undefined on Fra: lines
export type ProgressCallback = (frame: number, line: string, savedPath?: string) => void
export type DoneCallback = (exitCode: number | null, error?: string) => void

export function spawnBlender(
  blenderPath: string,
  job: RenderJob,
  onProgress: ProgressCallback,
  onDone: DoneCallback
): ChildProcess {
  const args = buildArgs(job)
  const proc = spawn(blenderPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  const handleLine = (line: string): void => {
    const frameMatch = FRAME_RE.exec(line)
    if (frameMatch) {
      // Frame started — report progress tick (no savedPath)
      onProgress(parseInt(frameMatch[1], 10), line, undefined)
      return
    }
    const savedMatch = SAVED_RE.exec(line)
    if (savedMatch) {
      // Frame file written — report saved path (no progress tick)
      onProgress(job.currentFrame ?? job.frameStart, line, savedMatch[1])
    }
  }

  let stdoutBuf = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString()
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop() ?? ''
    lines.forEach(handleLine)
  })

  let stderrBuf = ''
  let lastError = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString()
    const lines = stderrBuf.split('\n')
    stderrBuf = lines.pop() ?? ''
    lines.forEach((line) => { if (line.trim()) lastError = line })
  })

  proc.on('error', (err) => onDone(null, err.message))

  proc.on('close', (code) => {
    onDone(code, code !== 0 ? lastError || `Blender exited with code ${code}` : undefined)
  })

  return proc
}

function buildArgs(job: RenderJob): string[] {
  const args: string[] = [
    '-b', job.blendFile,
    '--engine', job.engine,
    '-s', String(job.frameStart),
    '-e', String(job.frameEnd),
    '-j', String(job.frameStep),
    '-t', String(job.threads)
  ]

  if (job.outputPath)
    args.push('-o', job.outputPath)

  if (job.resolutionX != null)
    args.push('--python-expr', `import bpy; bpy.context.scene.render.resolution_x = ${job.resolutionX}`)
  if (job.resolutionY != null)
    args.push('--python-expr', `import bpy; bpy.context.scene.render.resolution_y = ${job.resolutionY}`)
  if (job.resolutionScale != null)
    args.push('--python-expr', `import bpy; bpy.context.scene.render.resolution_percentage = ${job.resolutionScale}`)
  if (job.samples != null)
    args.push('--python-expr',
      `import bpy; s = bpy.context.scene; hasattr(s.cycles, 'samples') and setattr(s.cycles, 'samples', ${job.samples}) or setattr(s.eevee, 'taa_render_samples', ${job.samples})`)

  args.push('-x', '1', '-a')
  return args
}

export function getDefaultBlenderPaths(): string[] {
  const platform = process.platform
  if (platform === 'win32') {
    return [
      'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
      'blender'
    ]
  } else if (platform === 'darwin') {
    return [
      '/Applications/Blender.app/Contents/MacOS/Blender',
      '/Applications/Blender.app/Contents/MacOS/blender',
      'blender'
    ]
  } else {
    return ['/usr/bin/blender', '/usr/local/bin/blender', 'blender']
  }
}
