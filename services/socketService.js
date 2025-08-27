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

    socket.on('listRooms', async (data) => {
      try {
        const { page = 0, searchQuery = null } = data || {};
        const rooms = await userService.listRooms(socket.userId, page, searchQuery);
        
        socket.emit('roomsListed', createSuccessResponse(
          MESSAGES.SUCCESS.ROOMS_LISTED,
          { rooms, page, searchQuery }
        ));

      } catch (error) {
        console.error('Error listing rooms:', error);
        socket.emit('error', createErrorResponse(
          MESSAGES.ERROR.FAILED_TO_LIST_ROOMS,
          error.message
        ));
      }
    });

    socket.on('joinRoom', async (data) => {
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

        socket.join(`room_${roomId}`);
        
        socket.emit('roomJoined', createSuccessResponse(
          MESSAGES.SUCCESS.ROOM_JOINED,
          { roomId }
        ));

      } catch (error) {
        console.error('Error joining room:', error);
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