// Firestore + Firebase Storage data layer
const DB = (() => {
  function fs()  { return firebase.firestore(); }
  function st()  { return firebase.storage(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  /* ── Users ──────────────────────────────────────────────────────────── */

  async function saveUserProfile(userId, data) {
    await fs().collection('users').doc(userId).set(
      { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  async function saveFCMToken(userId, token) {
    await fs().collection('users').doc(userId).update({ fcmToken: token });
  }

  async function getUsers() {
    const snap = await fs().collection('users').get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  }

  /* ── Jobs ───────────────────────────────────────────────────────────── */

  function listenJobs(callback) {
    return fs().collection('jobs')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
  }

  async function addJob(data) {
    const ref = fs().collection('jobs').doc();
    await ref.set({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: firebase.auth().currentUser?.uid || null,
    });
    return ref.id;
  }

  async function updateJob(id, data) {
    await fs().collection('jobs').doc(id).update(data);
  }

  async function deleteJob(id) {
    const photos = await getJobPhotos(id);
    await Promise.all(photos.map(p => deletePhoto(p.id)));
    await fs().collection('jobs').doc(id).delete();
  }

  /* ── Photos ─────────────────────────────────────────────────────────── */

  async function uploadPhoto(jobId, file, onProgress) {
    const photoId   = uid();
    const ext       = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path      = `photos/${photoId}/original.${ext}`;
    const uploadRef = st().ref(path);
    const task      = uploadRef.put(file);

    if (onProgress) {
      task.on('state_changed', snap => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      });
    }

    await task;
    const originalUrl = await uploadRef.getDownloadURL();

    const photoData = {
      id:           photoId,
      jobId,
      originalPath: path,
      originalUrl,
      annotatedUrl:    null,
      annotatedPath:   null,
      annotationsUrl:  null,
      annotationsPath: null,
      tags:         [],
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      createdBy:    firebase.auth().currentUser?.uid || null,
    };

    await fs().collection('photos').doc(photoId).set(photoData);
    return photoData;
  }

  function listenJobPhotos(jobId, callback) {
    return fs().collection('photos')
      .where('jobId', '==', jobId)
      .onSnapshot(snap => {
        const photos = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return ta - tb;
          });
        callback(photos);
      });
  }

  async function getJobPhotos(jobId) {
    const snap = await fs().collection('photos').where('jobId', '==', jobId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function deletePhoto(photoId) {
    const doc = await fs().collection('photos').doc(photoId).get();
    if (!doc.exists) return;
    const data = doc.data();
    const paths = [data.originalPath, data.annotatedPath, data.annotationsPath].filter(Boolean);
    await Promise.all(paths.map(p => st().ref(p).delete().catch(() => {})));
    await fs().collection('photos').doc(photoId).delete();
  }

  async function saveAnnotations(photoId, annotatedBlob, annotationsBlob) {
    const [annSnap, layerSnap] = await Promise.all([
      st().ref(`photos/${photoId}/annotated.jpg`).put(annotatedBlob, { contentType: 'image/jpeg' }),
      st().ref(`photos/${photoId}/annotations.png`).put(annotationsBlob, { contentType: 'image/png' }),
    ]);
    const [annotatedUrl, annotationsUrl] = await Promise.all([
      annSnap.ref.getDownloadURL(),
      layerSnap.ref.getDownloadURL(),
    ]);
    await fs().collection('photos').doc(photoId).update({
      annotatedUrl,
      annotatedPath:   `photos/${photoId}/annotated.jpg`,
      annotationsUrl,
      annotationsPath: `photos/${photoId}/annotations.png`,
    });
    return { annotatedUrl, annotationsUrl };
  }

  async function updatePhotoTags(photoId, tags) {
    await fs().collection('photos').doc(photoId).update({ tags });
  }

  /* ── Notifications ───────────────────────────────────────────────────── */

  async function addNotification(data) {
    await fs().collection('notifications').add({
      ...data,
      read:      false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function listenNotifications(toUid, callback) {
    return fs().collection('notifications')
      .where('toUid', '==', toUid)
      .onSnapshot(snap => {
        const notifs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        callback(notifs);
      });
  }

  async function markAllNotificationsRead(toUid) {
    const snap = await fs().collection('notifications')
      .where('toUid', '==', toUid)
      .where('read', '==', false)
      .get();
    const batch = fs().batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  return {
    saveUserProfile,
    saveFCMToken,
    getUsers,
    listenJobs,
    addJob,
    updateJob,
    deleteJob,
    uploadPhoto,
    listenJobPhotos,
    getJobPhotos,
    deletePhoto,
    saveAnnotations,
    updatePhotoTags,
    addNotification,
    listenNotifications,
    markAllNotificationsRead,
  };
})();
