const admin = require('firebase-admin');
const firebaseConfig = require('../config/firebase'); // Initialize Firebase
const userService = require('./userService');

class NotificationService {
  async sendMessageNotification(userIds, messageData, roomData) {
    try {
      if (userIds.length === 0) return;

      const title = `${messageData.user?.firstName || 'Someone'} sent a message`;
      const body = this.getMessageBody(messageData);

      const additionalParams = {
        screen: "ChatMessage",
        params: {
          id: roomData.id,
          name: roomData.name,
          entityId: roomData.entityId,
          type: roomData.type,
          coverURL: roomData.coverURL
        }
      };

      // Fetch and send in batches of 100
      let offset = 0;
      const limit = 100;

      while (true) {
        console.log("Length of userIds: ", userIds.length )
        const deviceTokens = await userService.getUserDeviceTokens(userIds, offset, limit);

        if (deviceTokens.length === 0) break;

        const tokens = deviceTokens.map(row => row.device_token);

        const message = {
          tokens,
          notification: {
            title,
            body,
          },
          data: {
            screen: 'Chat',
            additionalParams: JSON.stringify(additionalParams),
          },
          android: {
            notification: {
              title,
              body,
              channelId: 'candid_notification_channel',
              color: '#839ED6',
              sound: 'default',
              icon: 'ic_stat_logo',
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title,
                  body,
                },
                sound: 'default',
                contentAvailable: true,
              },
            },
          },
        };

        try {
          const response = await admin.messaging().sendEachForMulticast(message);
          console.log(`Successfully sent ${response.successCount} notifications out of ${tokens.length}`);

          if (response.failureCount > 0) {
            console.error(`Failed to send ${response.failureCount} notifications`);

            // Handle failed tokens
            const responses = response.responses;
            for (let i = 0; i < responses.length; i++) {
              if (!responses[i].success) {
                const error = responses[i].error;
                if (error && error.code === 'messaging/registration-token-not-registered') {
                  console.log(`Token unregistered: ${tokens[i]}`);
                  // TODO: Remove invalid token from database
                }
              }
            }
          }
        } catch (error) {
          console.error('Error sending batch notifications:', error);
        }

        offset += limit;
        if (deviceTokens.length < limit) break;
      }
    } catch (error) {
      console.error('Error sending message notification:', error);
    }
  }

  getMessageBody(messageData) {
    switch (messageData.type) {
      case 'TEXT':
        return messageData.value.length > 150
          ? messageData.value.substring(0, 150) + '...'
          : messageData.value;
      case 'IMAGE':
        return 'An image is sent';
      case 'VIDEO':
        return 'A video is sent';
      default:
        return 'New message';
    }
  }
}

module.exports = new NotificationService();
