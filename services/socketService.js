const userService = require('./userService');
const { MESSAGES, createSuccessResponse, createErrorResponse } = require('../constants/messages');
const redisClient = require('../config/redis');

class SocketService {
  constructor() {
    this.pubClient = redisClient.getPubClient();
    this.subClient = redisClient.getSubClient();
  }

  async setConnectedUser(userId, socketId) {
    try {
      if (this.pubClient) {
        await this.pubClient.hset('connected_users', userId, socketId);
      }
    } catch (error) {
      console.error('Error setting connected user in Redis:', error);
    }
  }

  async getConnectedUser(userId) {
    try {
      if (this.subClient) {
        return await this.subClient.hget('connected_users', userId);
      }
      return null;
    } catch (error) {
      console.error('Error getting connected user from Redis:', error);
      return null;
    }
  }

  async removeConnectedUser(userId) {
    try {
      if (this.pubClient) {
        await this.pubClient.hdel('connected_users', userId);
      }
    } catch (error) {
      console.error('Error removing connected user from Redis:', error);
    }
  }

  handleConnection(socket, io) {
    console.log('User connected:', socket.id, 'User ID:', socket.userId);

    this.setConnectedUser(socket.userId, socket.id);
    
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

        socket.join(`room_${roomId}`);
        
        // Get messages for the room
        const messages = await userService.listMessages(roomId, page);

        // Update last_message_id to mark messages as read (only on first page)
        if (messages.length > 0 && page === 0) {
          const latestMessageId = messages[0].id;
          await userService.updateLastMessageRead(socket.userId, roomId, latestMessageId);
        }

        socket.emit('messages-fetched', createSuccessResponse(
          MESSAGES.SUCCESS.MESSAGES_LISTED,
          { roomId, messages, page }
        ));

      } catch (error) {
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_JOIN_ROOM,
          error.message
        ));
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (socket.userId) {
        this.removeConnectedUser(socket.userId);
      }
    });
  }
}

module.exports = new SocketService();