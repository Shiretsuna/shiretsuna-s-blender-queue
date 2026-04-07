import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

interface Config {
  blenderPath: string
  defaultOutputPath: string
  defaultOutputEnabled: boolean
  concurrentJobs: number
}

const CONFIG_DIR = app.getPath('userData')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

const DEFAULTS: Config = {
  blenderPath: '',
  defaultOutputPath: '',
  defaultOutputEnabled: false,
  concurrentJobs: 1
}

function load(): Config {
  try {
    if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(config: Config): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
  } catch { /* non-fatal */ }
}

let _config = load()

export const store = {
  get blenderPath(): string { return _config.blenderPath },
  set blenderPath(v: string) { _config.blenderPath = v; save(_config) },

  get defaultOutputPath(): string { return _config.defaultOutputPath },
  set defaultOutputPath(v: string) { _config.defaultOutputPath = v; save(_config) },

  get defaultOutputEnabled(): boolean { return _config.defaultOutputEnabled },
  set defaultOutputEnabled(v: boolean) { _config.defaultOutputEnabled = v; save(_config) },

  get concurrentJobs(): number { return _config.concurrentJobs },
  set concurrentJobs(v: number) { _config.concurrentJobs = v; save(_config) }
}
