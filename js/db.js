const DB = (() => {
  const DB_NAME = 'jobcam', DB_VER = 1;
  let db;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('photos')) {
          const store = d.createObjectStore('photos', { keyPath: 'id' });
          store.createIndex('jobId', 'jobId', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeName, mode, fn) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const req = fn(store);
      if (req) {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } else {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }
    });
  }

  return {
    addPhoto: (photo) => tx('photos', 'readwrite', s => s.put(photo)),
    getPhoto: (id) => tx('photos', 'readonly', s => s.get(id)),
    getPhotosByJob: (jobId) => new Promise(async (resolve, reject) => {
      const d = await open();
      const t = d.transaction('photos', 'readonly');
      const index = t.objectStore('photos').index('jobId');
      const req = index.getAll(jobId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
    deletePhoto: (id) => tx('photos', 'readwrite', s => s.delete(id)),
    deletePhotosByJob: (jobId) => new Promise(async (resolve, reject) => {
      const d = await open();
      const t = d.transaction('photos', 'readwrite');
      const index = t.objectStore('photos').index('jobId');
      const req = index.getAllKeys(jobId);
      req.onsuccess = () => {
        req.result.forEach(key => t.objectStore('photos').delete(key));
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    }),
    updatePhoto: (photo) => tx('photos', 'readwrite', s => s.put(photo)),
  };
})();
