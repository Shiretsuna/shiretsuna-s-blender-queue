import { spawn, ChildProcess } from 'child_process'
import { RenderJob } from './types'

const FRAME_RE = /^Fra:(\d+)\s/m
const SAVED_RE = /Saved:\s*'(.+?)'\s/

export type ProgressCallback = (frame: number, line: string, savedPath?: string) => void
export type DoneCallback = (exitCode: number | null, error?: string) => void

export function spawnBlender(
  blenderPath: string,
  job: RenderJob,
  startFrame: number,
  onProgress: ProgressCallback,
  onDone: DoneCallback
): ChildProcess {
  const args = buildArgs(job, startFrame)
  const proc = spawn(blenderPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  const handleLine = (line: string): void => {
    const frameMatch = FRAME_RE.exec(line)
    if (frameMatch) {
      onProgress(parseInt(frameMatch[1], 10), line, undefined)
      return
    }
    const savedMatch = SAVED_RE.exec(line)
    if (savedMatch) {
      onProgress(job.currentFrame ?? startFrame, line, savedMatch[1])
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

function buildArgs(job: RenderJob, startFrame: number): string[] {
  const args: string[] = [
    '-b', job.blendFile,
    '--engine', job.engine,
    '-s', String(startFrame),
    '-e', String(job.frameEnd),
    '-j', String(job.frameStep),
    '-t', String(job.threads)
  ]

  if (job.outputPath)
    args.push('-o', job.outputPath)

  // Python expression overrides — run before rendering
  const pyExprs: string[] = []

  if (job.outputFormat)
    pyExprs.push(`bpy.context.scene.render.image_settings.file_format = '${job.outputFormat}'`)
  if (job.resolutionX != null)
    pyExprs.push(`bpy.context.scene.render.resolution_x = ${job.resolutionX}`)
  if (job.resolutionY != null)
    pyExprs.push(`bpy.context.scene.render.resolution_y = ${job.resolutionY}`)
  if (job.resolutionScale != null)
    pyExprs.push(`bpy.context.scene.render.resolution_percentage = ${job.resolutionScale}`)
  if (job.samples != null)
    pyExprs.push(`(lambda s: hasattr(s.cycles,'samples') and setattr(s.cycles,'samples',${job.samples}) or setattr(s.eevee,'taa_render_samples',${job.samples}))(bpy.context.scene)`)

  if (pyExprs.length > 0)
    args.push('--python-expr', `import bpy\n${pyExprs.join('\n')}`)

  args.push('-x', '1', '-a')
  return args
}

export function getBlenderVersion(blenderPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    const done = (v: string | null): void => {
      if (resolved) return
      resolved = true
      resolve(v)
    }

    let proc: ChildProcess
    try {
      proc = spawn(blenderPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      return done(null)
    }

    let out = ''
    proc.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString() })
    proc.on('close', () => {
      const match = /Blender\s+(\d+\.\d+\.?\d*)/i.exec(out)
      done(match ? match[1] : null)
    })
    proc.on('error', () => done(null))

    // Safety timeout
    setTimeout(() => { try { proc.kill() } catch { /* ignore */ } done(null) }, 6000)
  })
}

export function getDefaultBlenderPaths(): string[] {
  const platform = process.platform
  if (platform === 'win32') {
    return [
      'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
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
