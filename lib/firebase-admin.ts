import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Missing Firebase service account configuration. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
  );
}

const sanitizedPrivateKey = privateKey.replace(/\\n/g, "\n");

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: sanitizedPrivateKey,
        }),
      });

export const adminDb = getFirestore(app);
