// 极简响应式 store：发布订阅，不引框架
import { loadSettings, saveSettings } from '../data/idb'
import { getProfile } from '../core/profiles'
import type { AppSettings, MachineProfile, Student } from '../core/types'

export interface AppState {
  settings: AppSettings
  profile: MachineProfile
  currentStudent: Student | null
  route: string
}

type Listener = (state: AppState) => void

class Store {
  state: AppState
  private listeners = new Set<Listener>()

  constructor() {
    this.state = {
      settings: {
        machineProfileId: 'standard_dual',
        voxelResolution: 128,
        renderScale: 1,
        defaultTimeLimitSec: 30,
        iouThreshold: 0.3,
        currentStudentId: null,
      },
      profile: getProfile('standard_dual'),
      currentStudent: null,
      route: location.hash.slice(1) || '/library',
    }
  }

  async init(student: Student): Promise<void> {
    const settings = await loadSettings()
    this.state.settings = settings
    this.state.profile = getProfile(settings.machineProfileId)
    this.state.currentStudent = student
    this.state.settings.currentStudentId = student.id
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state)
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    this.state.settings = { ...this.state.settings, ...patch }
    if (patch.machineProfileId) {
      this.state.profile = getProfile(patch.machineProfileId)
    }
    await saveSettings(this.state.settings)
    this.emit()
  }

  setRoute(route: string): void {
    if (this.state.route === route) return
    this.state.route = route
    location.hash = route
    this.emit()
  }

  setStudent(student: Student): void {
    this.state.currentStudent = student
    this.state.settings.currentStudentId = student.id
    this.emit()
  }
}

export const store = new Store()

window.addEventListener('hashchange', () => {
  const route = location.hash.slice(1) || '/library'
  store.setRoute(route)
})
