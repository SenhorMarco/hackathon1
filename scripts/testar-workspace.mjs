// Node.js 22.18+: node scripts/testar-workspace.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceStore } from '../src/lib/workspace-store.ts';

const key = 'aula-clara-v3';
const initial = [{ id: 'c0', name: 'Turma de exemplo', students: [], exams: [] }];
function memoryStorage(value = null) {
  return { value, reads: 0, writes: 0,
    getItem(name) { assert.equal(name, key); this.reads++; return this.value; },
    setItem(name, value) { assert.equal(name, key); this.writes++; this.value = value; },
  };
}

test('hidratação usa snapshot do servidor e restaura dados existentes sem sobrescrevê-los', () => {
  const saved = [{ ...initial[0], name: 'Turma salva', databaseId: 'uuid-salvo' }];
  const storage = memoryStorage(JSON.stringify(saved));
  const store = createWorkspaceStore(initial, () => storage);
  assert.equal(store.getServerSnapshot().ready, false);
  assert.equal(storage.reads, 0);
  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.classes, saved);
  assert.equal(snapshot.ready, true);
  assert.equal(store.getSnapshot(), snapshot, 'Snapshot deve permanecer estável sem mudanças');
  assert.equal(storage.reads, 1);
  assert.equal(storage.writes, 0, 'Hidratar não deve sobrescrever dados salvos');
});

test('atualizações consecutivas preservam todos os dados e notificam assinantes', () => {
  const storage = memoryStorage();
  const store = createWorkspaceStore(initial, () => storage);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  store.setClasses(current => [...current, { ...initial[0], id: 'c1' }]);
  store.setClasses(current => current.map(c => c.id === 'c1' ? { ...c, name: 'Turma editada' } : c));
  assert.equal(notifications, 2);
  assert.equal(store.getSnapshot().classes.length, 2);
  assert.equal(JSON.parse(storage.value)[1].name, 'Turma editada');
  unsubscribe();
  store.setClasses(initial);
  assert.equal(notifications, 2);
});

test('JSON inválido e dados incompletos preservam a demonstração', () => {
  for (const value of ['{quebrado', '[]', '[null]', '[{}]']) {
    const storage = memoryStorage(value);
    const store = createWorkspaceStore(initial, () => storage);
    assert.deepEqual(store.getSnapshot().classes, initial);
    assert.equal(storage.writes, 0);
  }
  const store = createWorkspaceStore(initial, () => memoryStorage('{quebrado'));
  assert.match(store.getSnapshot().error, /recuperar os dados/);
});

test('falhas de leitura e gravação mantêm a interface utilizável e permitem fechar o aviso', () => {
  const store = createWorkspaceStore(initial, () => { throw new Error('Storage bloqueado'); });
  assert.match(store.getSnapshot().error, /recuperar os dados/);
  store.setClasses(current => [...current, { ...initial[0], id: 'nova' }]);
  assert.equal(store.getSnapshot().classes.length, 2);
  assert.match(store.getSnapshot().error, /Armazenamento local indisponível/);
  store.clearError();
  assert.equal(store.getSnapshot().error, '');
  assert.equal(store.getSnapshot().classes.length, 2);
});

test('quota esgotada não reverte alterações em memória nem altera o conteúdo persistido', () => {
  const storage = memoryStorage(JSON.stringify(initial));
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const store = createWorkspaceStore(initial, () => storage);
  store.setClasses(current => current.map(c => ({ ...c, name: 'Alteração em memória' })));
  assert.equal(store.getSnapshot().classes[0].name, 'Alteração em memória');
  assert.equal(JSON.parse(storage.value)[0].name, 'Turma de exemplo');
});

test('eventos de armazenamento atualizam assinantes e a inscrição é removida ao desmontar', () => {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    const storage = memoryStorage();
    const store = createWorkspaceStore(initial, () => storage);
    store.getSnapshot();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    storage.value = JSON.stringify([{ ...initial[0], name: 'Outra aba' }]);
    const event = new Event('storage'); Object.defineProperty(event, 'key', { value: key });
    window.dispatchEvent(event);
    assert.equal(store.getSnapshot().classes[0].name, 'Outra aba');
    assert.equal(notifications, 1);
    unsubscribe();
    window.dispatchEvent(event);
    assert.equal(notifications, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
