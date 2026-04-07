import { useState, useEffect } from 'react'
import { RenderEngine, RenderJob, BlendInfo, OutputFormat } from '../../../main/types'
import styles from './Modal.module.css'
import panelStyles from './AddJobPanel.module.css'

type AddJobParams = Omit<RenderJob, 'id' | 'status' | 'progress' | 'log'>

interface Props {
  initialData?: (BlendInfo & { filePath?: string }) | null
  defaultOutputPath?: string
  defaultOutputEnabled?: boolean
  onAdd: (params: AddJobParams) => void
  onClose: () => void
}

const VALID_ENGINES: RenderEngine[] = ['CYCLES', 'BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT']

function toEngine(raw?: string): RenderEngine {
  if (raw && VALID_ENGINES.includes(raw as RenderEngine)) return raw as RenderEngine
  return 'CYCLES'
}

export function AddJobPanel({ initialData, defaultOutputPath, defaultOutputEnabled, onAdd, onClose }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [blendFile, setBlendFile] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [engine, setEngine] = useState<RenderEngine>('CYCLES')
  const [frameStart, setFrameStart] = useState(1)
  const [frameEnd, setFrameEnd] = useState(250)
  const [frameStep, setFrameStep] = useState(1)
  const [threads, setThreads] = useState(0)
  const [samples, setSamples] = useState<number | ''>('')
  const [resX, setResX] = useState<number | ''>('')
  const [resY, setResY] = useState<number | ''>('')
  const [resScale, setResScale] = useState<number | ''>('')
  const [outputFormat, setOutputFormat] = useState<OutputFormat | ''>('')

  // Pre-fill fields when initialData is provided (from drag & drop or browse)
  useEffect(() => {
    if (!initialData) return
    if (initialData.filePath) {
      setBlendFile(initialData.filePath)
      if (defaultOutputEnabled && defaultOutputPath) {
        const blendName = initialData.filePath.split(/[\\/]/).pop()?.replace('.blend', '') || 'render'
        setOutputPath(`${defaultOutputPath.replace(/\\/g, '/')}/${blendName}/frame_####`)
      } else if (initialData.outputPath) {
        setOutputPath(sanitizeOutputPath(initialData.outputPath))
      }
    }
    if (initialData.frameStart != null) setFrameStart(initialData.frameStart)
    if (initialData.frameEnd != null) setFrameEnd(initialData.frameEnd)
    if (initialData.frameStep != null) setFrameStep(initialData.frameStep)
    if (initialData.engine) setEngine(toEngine(initialData.engine))
    if (initialData.resolutionX != null) setResX(initialData.resolutionX)
    if (initialData.resolutionY != null) setResY(initialData.resolutionY)
    if (initialData.resolutionScale != null) setResScale(initialData.resolutionScale)
    if (initialData.samples != null) setSamples(initialData.samples)
    if (initialData.sceneName) setName(initialData.sceneName)
  }, [initialData])

  const canSubmit = !!blendFile.trim()

  const handleSubmit = (): void => {
    const jobName = name.trim() || blendFile.split(/[\\/]/).pop()?.replace('.blend', '') || 'Render Job'
    onAdd({
      name: jobName,
      blendFile: blendFile.trim(),
      outputPath: outputPath.trim() || undefined,
      engine,
      frameStart,
      frameEnd,
      frameStep,
      threads,
      outputFormat: outputFormat || undefined,
      samples: samples !== '' ? samples : undefined,
      resolutionX: resX !== '' ? resX : undefined,
      resolutionY: resY !== '' ? resY : undefined,
      resolutionScale: resScale !== '' ? resScale : undefined,
      thumbnail: initialData?.thumbnail ?? undefined
    })
  }

  const pickBlend = async (): Promise<void> => {
    const path = await window.api.openBlendDialog()
    if (!path) return
    setBlendFile(path)
    const blendName = path.split(/[\\/]/).pop()?.replace('.blend', '') || ''
    if (!name) setName(blendName)
    // Apply default output path if enabled
    if (defaultOutputEnabled && defaultOutputPath) {
      setOutputPath(`${defaultOutputPath.replace(/\\/g, '/')}/${blendName}/frame_####`)
    }
    // Read blend info for the picked file
    try {
      const info = await window.api.readBlendInfo(path)
      if (info.frameStart != null) setFrameStart(info.frameStart)
      if (info.frameEnd != null) setFrameEnd(info.frameEnd)
      if (info.frameStep != null) setFrameStep(info.frameStep)
      if (info.engine) setEngine(toEngine(info.engine))
      if (!defaultOutputEnabled && info.outputPath) setOutputPath(sanitizeOutputPath(info.outputPath))
      if (info.resolutionX != null) setResX(info.resolutionX)
      if (info.resolutionY != null) setResY(info.resolutionY)
      if (info.resolutionScale != null) setResScale(info.resolutionScale)
      if (info.samples != null) setSamples(info.samples)
      if (info.sceneName && !name) setName(info.sceneName)
    } catch { /* ignore, user can fill manually */ }
  }

  const pickOutput = async (): Promise<void> => {
    const path = await window.api.openFolderDialog()
    if (path) setOutputPath(path.replace(/\\/g, '/') + '/frame_####')
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add Blend File</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Thumbnail preview if available */}
          {initialData?.thumbnail && (
            <div className={panelStyles.thumbRow}>
              <img src={initialData.thumbnail} alt="Scene preview" className={panelStyles.thumb} />
              <div className={panelStyles.thumbMeta}>
                <span className={panelStyles.thumbLabel}>Scene Preview</span>
                {initialData.sceneName && <span className={panelStyles.thumbScene}>{initialData.sceneName}</span>}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto from scene / file name" />
          </div>

          <div className={styles.field}>
            <label>Blend File *</label>
            <div className={styles.row}>
              <input value={blendFile} onChange={(e) => setBlendFile(e.target.value)} placeholder="/path/to/scene.blend" />
              <button className={styles.btnPick} onClick={pickBlend}>Browse</button>
            </div>
            {initialData && !blendFile && (
              <span className={styles.hint}>File was dropped — path auto-detected. You can browse to confirm.</span>
            )}
          </div>

          <div className={styles.field}>
            <label>Output Path</label>
            <div className={styles.row}>
              <input value={outputPath} onChange={(e) => setOutputPath(e.target.value)} placeholder="From .blend file (leave empty to use scene default)" />
              <button className={styles.btnPick} onClick={pickOutput}>Browse</button>
            </div>
            <span className={styles.hint}>Leave empty to use the output path saved in the .blend file. Use #### for frame padding.</span>
          </div>

          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label>Render Engine</label>
              <select value={engine} onChange={(e) => setEngine(e.target.value as RenderEngine)}>
                <option value="CYCLES">Cycles</option>
                <option value="BLENDER_EEVEE">EEVEE</option>
                <option value="BLENDER_EEVEE_NEXT">EEVEE Next</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Threads (0 = auto)</label>
              <input type="number" min={0} max={256} value={threads} onChange={(e) => setThreads(parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className={styles.section}>Frame Range</div>
          <div className={styles.threeCol}>
            <div className={styles.field}>
              <label>Start Frame</label>
              <input type="number" value={frameStart} onChange={(e) => setFrameStart(parseInt(e.target.value) || 1)} />
            </div>
            <div className={styles.field}>
              <label>End Frame</label>
              <input type="number" value={frameEnd} onChange={(e) => setFrameEnd(parseInt(e.target.value) || 1)} />
            </div>
            <div className={styles.field}>
              <label>Step</label>
              <input type="number" min={1} value={frameStep} onChange={(e) => setFrameStep(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
          </div>

          <div className={styles.section}>Overrides (optional)</div>
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label>Output Format</label>
              <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as OutputFormat | '')}>
                <option value="">From .blend file</option>
                <option value="PNG">PNG</option>
                <option value="JPEG">JPEG</option>
                <option value="OPEN_EXR">OpenEXR</option>
                <option value="OPEN_EXR_MULTILAYER">OpenEXR Multilayer</option>
                <option value="TIFF">TIFF</option>
                <option value="WEBP">WebP</option>
              </select>
            </div>
          </div>
          <div className={styles.threeCol}>
            <div className={styles.field}>
              <label>Samples</label>
              <input type="number" min={1} value={samples} onChange={(e) => setSamples(e.target.value ? parseInt(e.target.value) : '')} placeholder="From .blend" />
            </div>
            <div className={styles.field}>
              <label>Res X</label>
              <input type="number" min={1} value={resX} onChange={(e) => setResX(e.target.value ? parseInt(e.target.value) : '')} placeholder="From .blend" />
            </div>
            <div className={styles.field}>
              <label>Res Y</label>
              <input type="number" min={1} value={resY} onChange={(e) => setResY(e.target.value ? parseInt(e.target.value) : '')} placeholder="From .blend" />
            </div>
          </div>
          <div className={styles.field} style={{ maxWidth: 160 }}>
            <label>Resolution Scale %</label>
            <input type="number" min={1} max={100} value={resScale} onChange={(e) => setResScale(e.target.value ? parseInt(e.target.value) : '')} placeholder="100" />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSubmit} onClick={handleSubmit} disabled={!canSubmit}>
            Add to Render Queue
          </button>
        </div>
      </div>
    </div>
  )
}

/** Blender output paths use // prefix for relative paths — strip for display */
function sanitizeOutputPath(p: string): string {
  return p.replace(/^\/\//, '').replace(/\\/g, '/')
}
