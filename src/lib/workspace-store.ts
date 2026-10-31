import type { ClassRoom } from './data';

const STORAGE_KEY = 'aula-clara-v3';
type Snapshot = { classes: ClassRoom[]; ready: boolean; error: string };
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

/** Uma fonte de estado para dados locais, consumida com useSyncExternalStore. */
export function createWorkspaceStore(initialClasses: ClassRoom[], getStorage: () => StorageAccess = () => window.localStorage) {
  const serverSnapshot: Snapshot = { classes: initialClasses, ready: false, error: '' };
  let snapshot = serverSnapshot;
  let initialized = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());

  function readStorage() {
    initialized = true;
    try {
      const saved = getStorage().getItem(STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : initialClasses;
      const valid = Array.isArray(parsed) && parsed.length > 0 && parsed.every(c => c && Array.isArray(c.students) && Array.isArray(c.exams));
      snapshot = { classes: valid ? parsed : initialClasses, ready: true, error: '' };
    } catch {
      snapshot = { classes: initialClasses, ready: true, error: 'Não foi possível recuperar os dados locais. A demonstração foi carregada.' };
    }
  }
  function getSnapshot() {
    if (!initialized) readStorage();
    return snapshot;
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) { readStorage(); emit(); }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }
  function setClasses(update: ClassRoom[] | ((current: ClassRoom[]) => ClassRoom[])) {
    const current = getSnapshot();
    const classes = typeof update === 'function' ? update(current.classes) : update;
    let error = '';
    try { getStorage().setItem(STORAGE_KEY, JSON.stringify(classes)); }
    catch { error = 'Armazenamento local indisponível. Mantenha esta aba aberta.'; }
    // Mantém alterações em memória mesmo se o armazenamento estiver bloqueado/cheio.
    snapshot = { classes, ready: true, error };
    emit();
  }
  function clearError() {
    if (!snapshot.error) return;
    snapshot = { ...snapshot, error: '' };
    emit();
  }
  return { subscribe, getSnapshot, getServerSnapshot: () => serverSnapshot, setClasses, clearError };
}
