const userService = require('./userService');
const notificationService = require('./notificationService');
const { MESSAGES, createSuccessResponse, createErrorResponse } = require('../constants/messages');

class SocketService {
  async getUserConnectionData(userId, io) {
    try {
      // Use Socket.IO's built-in method to fetch sockets across all instances
      const sockets = await io.in(`user_${userId}`).fetchSockets();

      if (sockets.length > 0) {
        const userSocket = sockets[0];
        return {
          isOnline: true,
          socketId: userSocket.id,
          roomId: userSocket.data.currentRoomId || null
        };
      }

      return { isOnline: false, socketId: null, roomId: null };
    } catch (error) {
      console.error('Error getting user connection data:', error);
      return { isOnline: false, socketId: null, roomId: null };
    }
  }

  async sendInboxUpdate(roomId, messageId, messageData, io, sendPushNotification = false) {
    try {
      let offset = 0;
      const limit = 100;
      const offlineUserIds = [];

      while (true) {
        const membersInboxData = await userService.getRoomMembersInboxData(roomId, offset, limit);

        if (membersInboxData.length === 0) break;

        for (const { userId, data } of membersInboxData) {
          // Get user connection data (online status and current roomId)
          const { isOnline, roomId: userCurrentRoomId } = await this.getUserConnectionData(userId, io);

          if (isOnline) {
            // If user is in the same room and messageId is provided, update last_message_read and set unreadCount to 0
            if (messageId && userCurrentRoomId === roomId) {
              userService.updateLastMessageRead(userId, roomId, messageId);
              data.unreadCount = 0;
            }
            // If user is online but in a different room, increment unreadCount
            // (unreadCount from data already has the correct value from getRoomMembersInboxData)

            io.to(`user_${userId}`).emit('update-inbox', createSuccessResponse(
              MESSAGES.SUCCESS.INBOX_UPDATED,
              data
            ));
          } else if (sendPushNotification) {
            offlineUserIds.push(userId);
          }
        }

        offset += limit;
        if (membersInboxData.length < limit) break;
      }

      // Send push notifications to offline users if enabled
      if (offlineUserIds.length > 0) {
        // notificationService.sendMessageNotification(offlineUserIds, messageData);
      }
    } catch (error) {
      console.error('Error sending inbox update:', error);
      throw error;
    }
  }

  handleConnection(socket, io) {
    console.log('User connected:', socket.id, 'User ID:', socket.userId);

    socket.join(`user_${socket.userId}`);

    // Initialize socket data
    socket.data.currentRoomId = null;

    socket.emit('connected', createSuccessResponse(
      MESSAGES.SUCCESS.CONNECTED,
      { userId: socket.userId }
    ));

    socket.on('list-rooms', async (data) => {
      try {
        const { page = 0, searchQuery = null } = data || {};
        const rooms = await userService.listRooms(socket.userId, page, searchQuery);
        
        socket.emit('rooms-fetched', createSuccessResponse(
          MESSAGES.SUCCESS.ROOMS_LISTED,
          { rooms, page, searchQuery }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_LIST_ROOMS,
          error.message
        ));
      }
    });

    socket.on('join-room', async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ID_REQUIRED));
          return;
        }

        const hasAccess = await userService.checkRoomAccess(socket.userId, roomId);

        if (!hasAccess) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ACCESS_DENIED));
          return;
        }

        // Store current room in socket data
        socket.data.currentRoomId = roomId;

        socket.join(`room_${roomId}`);

        socket.emit('room-joined', createSuccessResponse(
          MESSAGES.SUCCESS.ROOM_JOINED,
          { roomId }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_JOIN_ROOM,
          error.message
        ));
      }
    });

    socket.on('get-members', async (data) => {
      try {
        const { roomId, page = 0, searchQuery = null } = data;

        if (!roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ID_REQUIRED));
          return;
        }

        const hasAccess = await userService.checkRoomAccess(socket.userId, roomId);

        if (!hasAccess) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ACCESS_DENIED));
          return;
        }

        const members = await userService.getRoomMembers(roomId, page, searchQuery);

        socket.emit('members-fetched', createSuccessResponse(
          MESSAGES.SUCCESS.MEMBERS_LISTED,
          { roomId, members, page, searchQuery }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_GET_MEMBERS,
          error.message
        ));
      }
    });

    socket.on('leave-room', async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ID_REQUIRED));
          return;
        }

        // Clear the roomId from socket data
        socket.data.currentRoomId = null;

        socket.leave(`room_${roomId}`);

        socket.emit('room-left', createSuccessResponse(
          MESSAGES.SUCCESS.ROOM_LEFT,
          { roomId }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_LEAVE_ROOM,
          error.message
        ));
      }
    });

    socket.on('list-messages', async (data) => {
      try {
        const { roomId, page = 0 } = data;

        if (!roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ID_REQUIRED));
          return;
        }

        const hasAccess = await userService.checkRoomAccess(socket.userId, roomId);

        if (!hasAccess) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ACCESS_DENIED));
          return;
        }

        // Get messages for the room
        const messages = await userService.listMessages(roomId, page, null);

        socket.emit('messages-fetched', createSuccessResponse(
          MESSAGES.SUCCESS.MESSAGES_LISTED,
          { roomId, messages, page }
        ));

        // Update last_message_id to mark messages as read (only on first page)
        if (messages.length > 0 && page === 0) {
          const latestMessageId = messages[0].id;
          await userService.updateLastMessageRead(socket.userId, roomId, latestMessageId);
        }

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_JOIN_ROOM,
          error.message
        ));
      }
    });

    socket.on('update-message', async (data) => {
      try {
        const { messageId, roomId, value, mentions = [] } = data;

        if (!messageId || !roomId || !value) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        // Check if user can update the message
        const { canUpdate, reason, roomId: messageRoomId } = await userService.canUpdateMessage(socket.userId, messageId);

        if (!canUpdate) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.UPDATE_PERMISSION_DENIED, reason));
          return;
        }

        // Verify roomId matches
        if (messageRoomId !== roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        // Check if this is the last message in the room before updating
        const isLastMessage = await userService.isLastMessageInRoom(messageId, roomId);

        // Update the message
        await userService.updateMessage(messageId, value, mentions);

        // Fetch the updated message using listMessages
        const [updatedMessage] = await userService.listMessages(roomId, 0, messageId);

        // Emit message-updated to room
        io.to(`room_${roomId}`).emit('message-updated', createSuccessResponse(
          MESSAGES.SUCCESS.MESSAGE_UPDATED,
          updatedMessage
        ));

        // If this was the last message, send update-inbox to all room members
        if (isLastMessage) {
          await this.sendInboxUpdate(roomId, null, null, io, false);
        }

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_UPDATE_MESSAGE,
          error.message
        ));
      }
    });

    socket.on('add-reaction', async (data) => {
      try {
        const { messageId, value, roomId } = data;

        if (!messageId || !value || !roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        // Check if user has access to the room
        const hasAccess = await userService.checkRoomAccess(socket.userId, roomId);

        if (!hasAccess) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ACCESS_DENIED));
          return;
        }

        // Add reaction
        await userService.addReaction(messageId, socket.userId, value);

        // Emit reaction-added to room
        io.to(`room_${roomId}`).emit('reaction-added', createSuccessResponse(
          MESSAGES.SUCCESS.REACTION_ADDED,
          { messageId, userId: socket.userId, value, roomId }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_ADD_REACTION,
          error.message
        ));
      }
    });

    socket.on('delete-reaction', async (data) => {
      try {
        const { messageId, value, roomId } = data;

        if (!messageId || !value || !roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        // Check if user has access to the room
        const hasAccess = await userService.checkRoomAccess(socket.userId, roomId);

        if (!hasAccess) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ACCESS_DENIED));
          return;
        }

        // Delete reaction
        await userService.deleteReaction(messageId, socket.userId, value);

        // Emit reaction-deleted to room
        io.to(`room_${roomId}`).emit('reaction-deleted', createSuccessResponse(
          MESSAGES.SUCCESS.REACTION_DELETED,
          { messageId, userId: socket.userId, value, roomId }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_DELETE_REACTION,
          error.message
        ));
      }
    });

    socket.on('delete-message', async (data) => {
      try {
        const { messageId, roomId } = data;

        if (!messageId || !roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        // Check if user can delete the message
        const { canDelete, reason, roomId: messageRoomId } = await userService.canDeleteMessage(socket.userId, messageId);

        if (!canDelete) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.DELETE_PERMISSION_DENIED, reason));
          return;
        }

        // Verify roomId matches
        if (messageRoomId !== roomId) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        // Check if this is the last message in the room before deleting
        const isLastMessage = await userService.isLastMessageInRoom(messageId, roomId);

        // Delete the message
        await userService.deleteMessage(messageId);

        // Emit message-deleted to room
        io.to(`room_${roomId}`).emit('message-deleted', createSuccessResponse(
          MESSAGES.SUCCESS.MESSAGE_DELETED,
          { messageId, roomId }
        ));

        // If this was the last message, send update-inbox to all room members
        if (isLastMessage) {
          await this.sendInboxUpdate(roomId, null, null, io, false);
        }

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_DELETE_MESSAGE,
          error.message
        ));
      }
    });

    socket.on('send-message', async (data) => {
      try {
        const { id, type, value, parentMessageId, roomId, mentions = [], media = null } = data;

        if (!type || !value || !roomId || !id) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.INVALID_DATA));
          return;
        }

        const hasAccess = await userService.checkRoomAccess(socket.userId, roomId);
        if (!hasAccess) {
          socket.emit('error', createErrorResponse(MESSAGES.ERROR.ROOM_ACCESS_DENIED));
          return;
        }

        const messageId = await userService.insertMessage(socket.userId, type, value, parentMessageId, roomId, mentions, media);

        const [messageData] = await userService.listMessages(roomId, 0, messageId);

        messageData.prevId = id;

        // Emit new-message to room
        io.to(`room_${roomId}`).emit('new-message', createSuccessResponse(
          MESSAGES.SUCCESS.MESSAGE_SENT,
          messageData
        ));

        // Emit update-inbox to all room members
        await this.sendInboxUpdate(roomId, messageId, messageData, io, true);

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_SEND_MESSAGE,
          error.message
        ));
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Socket.IO automatically handles cleanup, no manual removal needed
    });
  }
}

module.exports = new SocketService();