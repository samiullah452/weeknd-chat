const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    this.init();
  }

  init() {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI
    };

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  }

  async sendToMultipleTokens(tokens, title, body, data = {}) {
    try {
      if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          timestamp: new Date().toISOString()
        },
        tokens
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log(`Push notification sent: ${response.successCount} success, ${response.failureCount} failed`);
      return response;
    } catch (error) {
      console.error('Error sending push notifications:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();