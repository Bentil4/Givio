// Vite's dependency pre-bundling can evaluate Dexie's module-level `indexedDB` capture before
// 'fake-indexeddb/auto''s global assignment takes effect, leaving Dexie.dependencies.indexedDB
// undefined even though globalThis.indexedDB is set. Dexie reads `Dexie.dependencies` fresh at
// `new Dexie()` construction time (not at import time), so patching it directly — after both
// imports, before any AppDb is constructed — sidesteps that ordering issue entirely.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
