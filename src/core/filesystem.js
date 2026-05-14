(function () {
  'use strict';

  class VirtualFileSystem {
    constructor() {
      this.db = null;
      this._cwd = '/';
      this.ready = false;
      this._initPromise = null;
    }

    async init() {
      if (this._initPromise) return this._initPromise;
      this._initPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('GASH_FS', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('files')) {
            const store = db.createObjectStore('files', { keyPath: 'path' });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('parent', 'parent', { unique: false });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          this.ready = true;
          resolve();
        };
        req.onerror = (e) => reject(e.target.error);
      });
      await this._initPromise;
      await this._ensureRoot();
      return this;
    }

    async _ensureRoot() {
      const exists = await this.exists('/');
      if (!exists) {
        await this._put({
          path: '/', type: 'directory', content: '',
          parent: null, created: Date.now(), modified: Date.now()
        });
      }
    }

    _withStore(mode, callback) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('files', mode);
        const store = tx.objectStore('files');
        callback(store, resolve, reject);
        tx.onerror = (e) => reject(e.target.error);
      });
    }

    _put(entry) {
      return this._withStore('readwrite', (store, resolve, reject) => {
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    }

    _get(path) {
      return this._withStore('readonly', (store, resolve, reject) => {
        const req = store.get(path);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    }

    _delete(path) {
      return this._withStore('readwrite', (store, resolve, reject) => {
        const req = store.delete(path);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      });
    }

    _getAll() {
      return this._withStore('readonly', (store, resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    }

    _getByIndex(indexName, value) {
      return this._withStore('readonly', (store, resolve, reject) => {
        const index = store.index(indexName);
        const req = index.getAll(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      });
    }

    normalizePath(path) {
      if (!path) path = '.';
      if (!path.startsWith('/')) {
        path = this._cwd + (this._cwd.endsWith('/') ? '' : '/') + path;
      }
      const parts = path.split('/').filter(p => p && p !== '.');
      const result = [];
      for (const p of parts) {
        if (p === '..') { if (result.length) result.pop(); }
        else result.push(p);
      }
      const normalized = '/' + result.join('/');
      return normalized || '/';
    }

    get cwd() { return this._cwd; }
    set cwd(val) { this._cwd = val; }

    async exists(path) {
      const entry = await this._get(this.normalizePath(path));
      return !!entry;
    }

    async isDirectory(path) {
      const entry = await this._get(this.normalizePath(path));
      return entry && entry.type === 'directory';
    }

    async readdir(path) {
      const normalized = this.normalizePath(path);
      const entries = await this._getByIndex('parent', normalized);
      return entries.map(e => ({
        name: e.path.split('/').pop(),
        type: e.type,
        size: e.type === 'file' ? (e.content || '').length : 0,
        modified: e.modified
      })).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    async mkdir(path) {
      const normalized = this.normalizePath(path);
      if (normalized === '/') throw new Error('Cannot create root');
      if (await this.exists(normalized)) throw new Error(`Already exists: ${normalized}`);
      const parent = normalized.split('/').slice(0, -1).join('/') || '/';
      const parentEntry = await this._get(parent);
      if (!parentEntry) throw new Error(`Parent not found: ${parent}`);
      if (parentEntry.type !== 'directory') throw new Error(`Parent is not a directory: ${parent}`);
      await this._put({
        path: normalized, type: 'directory', content: '',
        parent, created: Date.now(), modified: Date.now()
      });
    }

    async mkdirp(path) {
      const normalized = this.normalizePath(path);
      if (normalized === '/') return;
      const parts = normalized.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        if (!(await this.exists(current))) {
          await this._put({
            path: current, type: 'directory', content: '',
            parent: current.split('/').slice(0, -1).join('/') || '/',
            created: Date.now(), modified: Date.now()
          });
        }
      }
    }

    async writeFile(path, content) {
      const normalized = this.normalizePath(path);
      if (normalized === '/') throw new Error('Cannot write to root');
      const parent = normalized.split('/').slice(0, -1).join('/') || '/';
      const parentEntry = await this._get(parent);
      if (!parentEntry) throw new Error(`Parent not found: ${parent}`);
      if (parentEntry.type !== 'directory') throw new Error(`Parent is not a directory: ${parent}`);
      const existing = await this._get(normalized);
      if (existing) {
        existing.content = content;
        existing.modified = Date.now();
        if (existing.type !== 'file') throw new Error(`Not a file: ${normalized}`);
        await this._put(existing);
      } else {
        await this._put({
          path: normalized, type: 'file', content,
          parent, created: Date.now(), modified: Date.now()
        });
      }
    }

    async readFile(path) {
      const normalized = this.normalizePath(path);
      const entry = await this._get(normalized);
      if (!entry) throw new Error(`File not found: ${normalized}`);
      if (entry.type === 'directory') throw new Error(`Is a directory: ${normalized}`);
      return entry.content || '';
    }

    async delete(path) {
      const normalized = this.normalizePath(path);
      if (normalized === '/') throw new Error('Cannot delete root');
      const entry = await this._get(normalized);
      if (!entry) throw new Error(`Not found: ${normalized}`);
      if (entry.type === 'directory') {
        const children = await this._getByIndex('parent', normalized);
        if (children.length > 0) throw new Error(`Directory not empty: ${normalized}`);
      }
      await this._delete(normalized);
    }

    async rmrf(path) {
      const normalized = this.normalizePath(path);
      if (normalized === '/') throw new Error('Cannot delete root');
      const all = await this._getAll();
      const toDelete = all.filter(e => e.path === normalized || e.path.startsWith(normalized + '/'));
      for (const entry of toDelete.sort((a, b) => b.path.length - a.path.length)) {
        await this._delete(entry.path);
      }
    }

    async rename(oldPath, newPath) {
      const normalizedOld = this.normalizePath(oldPath);
      const normalizedNew = this.normalizePath(newPath);
      if (normalizedOld === '/') throw new Error('Cannot rename root');
      const entry = await this._get(normalizedOld);
      if (!entry) throw new Error(`Not found: ${normalizedOld}`);
      if (await this.exists(normalizedNew)) throw new Error(`Already exists: ${normalizedNew}`);

      entry.path = normalizedNew;
      entry.modified = Date.now();
      entry.parent = normalizedNew.split('/').slice(0, -1).join('/') || '/';
      await this._put(entry);
      await this._delete(normalizedOld);

      if (entry.type === 'directory') {
        const all = await this._getAll();
        const children = all.filter(e => e.path.startsWith(normalizedOld + '/'));
        for (const child of children) {
          const newChildPath = normalizedNew + child.path.slice(normalizedOld.length);
          child.path = newChildPath;
          child.parent = newChildPath.split('/').slice(0, -1).join('/') || '/';
          child.modified = Date.now();
          await this._put(child);
          await this._delete(child.path.replace(normalizedNew, normalizedOld));
        }
      }
    }

    async copy(srcPath, destPath) {
      const normalizedSrc = this.normalizePath(srcPath);
      const normalizedDest = this.normalizePath(destPath);
      const entry = await this._get(normalizedSrc);
      if (!entry) throw new Error(`Not found: ${normalizedSrc}`);
      if (await this.exists(normalizedDest)) throw new Error(`Already exists: ${normalizedDest}`);

      if (entry.type === 'directory') {
        await this._put({
          ...entry, path: normalizedDest,
          parent: normalizedDest.split('/').slice(0, -1).join('/') || '/',
          modified: Date.now()
        });
        const all = await this._getAll();
        const children = all.filter(e => e.path.startsWith(normalizedSrc + '/'));
        for (const child of children) {
          const newChildPath = normalizedDest + child.path.slice(normalizedSrc.length);
          await this._put({
            ...child, path: newChildPath,
            parent: newChildPath.split('/').slice(0, -1).join('/') || '/',
            modified: Date.now()
          });
        }
      } else {
        await this._put({
          ...entry, path: normalizedDest,
          parent: normalizedDest.split('/').slice(0, -1).join('/') || '/',
          modified: Date.now()
        });
      }
    }

    async stat(path) {
      const normalized = this.normalizePath(path);
      const entry = await this._get(normalized);
      if (!entry) throw new Error(`Not found: ${normalized}`);
      return { ...entry, size: entry.type === 'file' ? (entry.content || '').length : 0 };
    }

    async tree(path, indent = '') {
      const normalized = this.normalizePath(path);
      const entries = await this.readdir(normalized);
      let result = '';
      for (let i = 0; i < entries.length; i++) {
        const isLast = i === entries.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        result += indent + prefix + entries[i].name + '\n';
        if (entries[i].type === 'directory') {
          const subPath = (normalized === '/' ? '' : normalized) + '/' + entries[i].name;
          result += await this.tree(subPath, indent + (isLast ? '    ' : '│   '));
        }
      }
      return result;
    }

    async find(path, pattern) {
      const normalized = this.normalizePath(path);
      const results = [];
      const entries = await this._getAll();
      const entry = await this._get(normalized);
      if (!entry) throw new Error(`Not found: ${normalized}`);

      for (const e of entries) {
        if (e.path.startsWith(normalized === '/' ? '/' : normalized + '/')) {
          const name = e.path.split('/').pop();
          if (name.includes(pattern)) {
            results.push(e.path);
          }
        }
      }
      return results;
    }
  }

  window.GASH = window.GASH || {};
  window.GASH.VirtualFileSystem = VirtualFileSystem;
})();
