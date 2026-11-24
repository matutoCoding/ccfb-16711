import type {
  AppSettings,
  ExamPaper,
  ExamRecord,
  Question,
  Student,
} from '../core/types'
import { DEFAULT_PROFILE_ID } from '../core/profiles'

const DB_NAME = 'xray_trainer_db'
const DB_VERSION = 1

const STORES = {
  questions: 'questions',
  papers: 'papers',
  records: 'records',
  students: 'students',
  settings: 'settings',
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.questions)) {
        db.createObjectStore(STORES.questions, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.papers)) {
        db.createObjectStore(STORES.papers, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.records)) {
        const store = db.createObjectStore(STORES.records, { keyPath: 'id' })
        store.createIndex('studentId', 'studentId', { unique: false })
        store.createIndex('paperId', 'paperId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.students)) {
        db.createObjectStore(STORES.students, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async <T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idb = {
  async put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    return tx(store, 'readwrite', (s) => s.put(value as object, key))
  },
  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return tx(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
  },
  async getAll<T>(store: StoreName): Promise<T[]> {
    return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
  },
  async delete(store: StoreName, key: IDBValidKey): Promise<undefined> {
    return tx(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>)
  },
  async count(store: StoreName): Promise<number> {
    return tx(store, 'readonly', (s) => s.count())
  },
  async clear(store: StoreName): Promise<undefined> {
    return tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>)
  },
}

export const STORE_NAMES = STORES

const SETTINGS_KEY = 'app_settings'

export const DEFAULT_SETTINGS: AppSettings = {
  machineProfileId: DEFAULT_PROFILE_ID,
  voxelResolution: 128,
  renderScale: 1,
  defaultTimeLimitSec: 30,
  iouThreshold: 0.3,
  currentStudentId: null,
}

export const loadSettings = async (): Promise<AppSettings> => {
  const saved = await idb.get<AppSettings>(STORES.settings, SETTINGS_KEY)
  return saved ?? { ...DEFAULT_SETTINGS }
}

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  await idb.put(STORES.settings, settings, SETTINGS_KEY)
}

// 首次进入时写入一个默认学员，保证训练流程可直接开始
export const ensureDefaultStudent = async (): Promise<Student> => {
  const students = await idb.getAll<Student>(STORES.students)
  if (students.length > 0) return students[0]
  const student: Student = {
    id: crypto.randomUUID(),
    name: '默认学员',
    org: '本培训点',
    createdAt: Date.now(),
  }
  await idb.put(STORES.students, student)
  return student
}

export type { Question, ExamPaper, ExamRecord, Student }
