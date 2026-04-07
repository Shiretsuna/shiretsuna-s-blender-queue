import { useState } from 'react'
import { QueueState } from '../../../main/types'
import styles from './Modal.module.css'
import settingsStyles from './SettingsModal.module.css'

interface Props {
  state: QueueState
  onSetBlenderPath: (path: string) => Promise<void>
  onClose: () => void
}

export function SettingsModal({ state, onSetBlenderPath, onClose }: Props): JSX.Element {
  const [blenderPath, setBlenderPath] = useState(state.blenderPath)
  const [defaultOutputPath, setDefaultOutputPath] = useState(state.defaultOutputPath)
  const [defaultOutputEnabled, setDefaultOutputEnabled] = useState(state.defaultOutputEnabled)
  const [concurrentJobs, setConcurrentJobs] = useState(state.concurrentJobs)

  const pickExe = async (): Promise<void> => {
    const path = await window.api.openBlenderExeDialog()
    if (path) setBlenderPath(path)
  }

  const detectAuto = async (): Promise<void> => {
    const path = await window.api.detectBlender()
    if (path) setBlenderPath(path)
    else alert('Could not auto-detect Blender. Please set the path manually.')
  }

  const pickOutputFolder = async (): Promise<void> => {
    const path = await window.api.openFolderDialog()
    if (path) setDefaultOutputPath(path.replace(/\\/g, '/'))
  }

  const handleSave = async (): Promise<void> => {
    await onSetBlenderPath(blenderPath.trim())
    await window.api.setDefaultOutput(defaultOutputPath.trim(), defaultOutputEnabled)
    await window.api.setConcurrentJobs(concurrentJobs)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Blender path */}
          <div className={styles.section}>Blender</div>
          <div className={styles.field}>
            <label>Executable Path</label>
            <div className={styles.row}>
              <input value={blenderPath} onChange={(e) => setBlenderPath(e.target.value)} placeholder="blender" />
              <button className={styles.btnPick} onClick={pickExe}>Browse</button>
            </div>
            {state.blenderVersion && (
              <span className={styles.hint}>Detected: Blender {state.blenderVersion}</span>
            )}
            {!state.blenderVersion && (
              <span className={styles.hint}>You can also type &ldquo;blender&rdquo; if it&apos;s on your PATH.</span>
            )}
          </div>
          <button className={styles.btnSecondary} onClick={detectAuto}>Auto-detect Blender</button>

          {/* Concurrent renders */}
          <div className={styles.section}>Queue</div>
          <div className={styles.field}>
            <label>Concurrent Renders</label>
            <div className={settingsStyles.concurrentRow}>
              <input
                type="range"
                min={1} max={8} step={1}
                value={concurrentJobs}
                onChange={(e) => setConcurrentJobs(parseInt(e.target.value))}
                className={settingsStyles.slider}
              />
              <span className={settingsStyles.concurrentValue}>{concurrentJobs}</span>
            </div>
            <span className={styles.hint}>
              {concurrentJobs === 1
                ? 'One at a time (default). Safe for most setups.'
                : `${concurrentJobs} jobs run in parallel. Requires enough VRAM / CPU threads.`}
            </span>
          </div>

          {/* Default output path */}
          <div className={styles.section}>Output</div>
          <div className={settingsStyles.toggleRow}>
            <span className={settingsStyles.toggleLabel}>Default Output Folder</span>
            <button
              className={`${settingsStyles.toggle} ${defaultOutputEnabled ? settingsStyles.toggleOn : ''}`}
              onClick={() => setDefaultOutputEnabled(!defaultOutputEnabled)}
            >
              <span className={settingsStyles.toggleThumb} />
            </button>
          </div>

          {defaultOutputEnabled && (
            <div className={styles.field} style={{ marginTop: 8 }}>
              <label>Output Root Folder</label>
              <div className={styles.row}>
                <input
                  value={defaultOutputPath}
                  onChange={(e) => setDefaultOutputPath(e.target.value)}
                  placeholder="/renders"
                />
                <button className={styles.btnPick} onClick={pickOutputFolder}>Browse</button>
              </div>
              <span className={styles.hint}>
                Each file renders to <em>{defaultOutputPath || '/renders'}/{'<blend name>'}/frame_####</em>
              </span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSubmit} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
