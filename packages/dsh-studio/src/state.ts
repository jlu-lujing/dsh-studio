/** Persistent store of per-feature on/off state. */

import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FeatureId } from './store.ts'

interface StateFile {
  features: Partial<Record<FeatureId, boolean>>
}

/** Atomic write (tmp + rename): a crash mid-write never leaves a torn state file. */
function atomicWriteJson(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, path)
}

export interface Store {
  load(): void
  isEnabled(id: FeatureId): boolean
  setEnabled(id: FeatureId, enabled: boolean): void
}

const DEFAULT_STATE: StateFile = { features: {} }

export function createStore(stateDir?: string, defaults?: Partial<Record<FeatureId, boolean>>): Store {
  const dir = stateDir ?? process.env.DSH_HOME ?? join(process.env.HOME ?? '.', '.dsh')
  const file = join(dir, 'dsh-studio', 'state.json')

  let state: StateFile = DEFAULT_STATE

  return {
    load() {
      try {
        state = JSON.parse(readFileSync(file, 'utf8')) as StateFile
      } catch {
        state = { ...DEFAULT_STATE }
      }
    },
    isEnabled(id) {
      if (state.features[id] !== undefined) return state.features[id] as boolean
      return defaults?.[id] ?? true
    },
    setEnabled(id, enabled) {
      state.features[id] = enabled
      mkdirSync(dirname(file), { recursive: true })
      atomicWriteJson(file, state)
    },
  }
}
