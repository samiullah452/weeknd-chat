1. **Tech Stack**
   - Node.js with Express.js
   - Socket.IO for real-time communication
   - MySQL for storing messages, reactions, and metadata
   - Redis for Socket.IO adapter to enable horizontal scaling across multiple server instances
   - Firebase Cloud Messaging (FCM) for push notifications

2. **Features**
   - **sendText**: Allow a user to send a text message to another user or a group.
   - **sendAudio**: Allow sending audio files (store file URLs in DB, not actual binary).
   - **sendVideo**: Allow sending video files (store file URLs in DB, not actual binary).
   - **React to messages**: Users can react with an emoji or reaction type to any existing message.
   - **Delete messages**: Users can delete their own messages (mark as deleted in DB, do not hard-delete).
   - Emit proper Socket.IO events to other clients in the chat.
   - Trigger push notifications via Firebase Messaging when the receiver is offline.

3. **Database (MySQL)**
   Create the following tables (add foreign keys where relevant):
   - `users`: `id`, `name`, `email`, `fcm_token`, `created_at`
   - `messages`: `id`, `sender_id`, `receiver_id`, `message_type` ("text", "audio", "video"), `content` (text or file URL), `created_at`, `deleted` (boolean)
   - `reactions`: `id`, `message_id`, `user_id`, `reaction_type` (emoji or string), `created_at`

4. **Socket.IO Events**
   Implement server-side handling for:
   - `sendText` → Saves to DB, broadcasts to receiver(s), triggers FCM if offline
   - `sendAudio` → Saves file URL to DB, broadcasts, triggers FCM
   - `sendVideo` → Saves file URL to DB, broadcasts, triggers FCM
   - `reactMessage` → Adds reaction in DB and broadcasts update
   - `deleteMessage` → Updates `deleted` field in DB, broadcasts deletion event

5. **Firebase Messaging Integration**
   - Use `firebase-admin` SDK
   - Send push notifications containing message preview and sender info to offline users

6. **Code Requirements**
   - Organize code with routes, controllers, and services
   - Use async/await with proper error handling
   - Include `.env` configuration for DB credentials and Firebase config
   - Provide a SQL schema creation script for all tables
   - Write full example server code with imports, app setup, Socket.IO integration, MySQL connection, and Firebase setup
   - Include minimal sample client-side socket event usage in comments for reference

Produce the **full working code** with clear comments so it can run immediately after installing dependencies and configuring `.env`.
