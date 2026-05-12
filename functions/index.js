// Firebase Cloud Function — sends a push notification when someone is tagged.
// Deploy with: firebase deploy --only functions
//
// Prerequisites:
//   cd functions && npm install
//   firebase deploy --only functions

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();

exports.onNotificationCreated = onDocumentCreated('notifications/{notifId}', async event => {
  const notif = event.data?.data();
  if (!notif) return;

  const userSnap = await getFirestore().doc(`users/${notif.toUid}`).get();
  const fcmToken = userSnap.data()?.fcmToken;
  if (!fcmToken) return;

  await getMessaging().send({
    token: fcmToken,
    notification: {
      title: `${notif.fromName} tagged you`,
      body:  notif.message || `In job: ${notif.jobName}`,
    },
    data: {
      photoId: notif.photoId || '',
      jobId:   notif.jobId   || '',
    },
    webpush: {
      notification: {
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        requireInteraction: false,
      },
      fcmOptions: { link: '/' },
    },
  });
});
