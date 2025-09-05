const db = require('../config/database');
const { MESSAGES } = require('../constants/messages');
const awsService = require('./awsService');

class UserService {
  async checkUserAccess(userDetails) {
    try {
      const { id } = userDetails;
      
      if (!id) {
        throw new Error('User ID is required');
      }

      const query = 'SELECT id, first_name, public_user, flagged FROM user WHERE id = ?';
      const results = await db.query(query, [id]);
      
      if (results.length === 0) {
        throw new Error(MESSAGES.ERROR.USER_NOT_FOUND);
      }

      const user = results[0];
      
      if (user.flagged === 1) {
        throw new Error(MESSAGES.ERROR.USER_ACCESS_DENIED);
      }

      return {
        id: user.id,
        firstName: user.first_name,
        publicUser: user.public_user,
        hasAccess: true
      };
    } catch (error) {
      console.error('Error checking user access:', error);
      throw error;
    }
  }

  async listRooms(userId, page = 0, searchQuery = null) {   
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 20;
      const offset = page * limit;

      // Build WHERE condition with proper parameterization
      let whereCondition = ` WHERE u.user_id = ?`;
      const queryParams = [userId];

      if (searchQuery) {
        whereCondition += ` AND u.name like ?`;
        queryParams.push(`${searchQuery}%`);
      }

      // Optimized query using CTEs instead of LATERAL JOINs
      const query = `
        SELECT * FROM user_room_info u
        ${whereCondition}      
        ORDER BY u.last_message_date DESC
        LIMIT ${limit} OFFSET ${offset}`;

      const results = await db.query(query, queryParams);
      
      // Process results in parallel with error handling for each room
      const rooms = await Promise.all(
        results.map(async (row) => {
          const coverURL = await this.processCoverURL(row, `room ${row.id}`);
          
          const lastMessage = {
            text: row.last_message_text,
            type: row.last_message_type,
            createdAt: row.last_message_date
          };

          return {
            id: row.room_id,
            name: row.name,
            type: row.room_type,
            createdAt: row.room_created_at,
            unreadCount: row.unreadCount,
            coverURL,
            lastMessage
          };
        })
      );
      return rooms;
    } catch (error) {
      console.error('Error listing user rooms:', error);
      throw error;
    }
  }

  async listMessages(roomId, page = 0) {
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 20;
      const offset = page * limit;

      const query = `
        SELECT * FROM message_info 
        WHERE room_id = ?
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`;

      const results = await db.query(query, [roomId]);
      
      // Process results in parallel with error handling for each message
      const messages = await Promise.all(
        results.map(async (row) => {
          const coverURL = await this.processCoverURL(row, `message ${row.id}`);
          
          return {
            id: row.id,
            type: row.type,
            value: row.value,
            parentMessage: row.parent_message ? {
              id: row.parent_message,
              value: row.parent_message_text
            } : null,
            user: {
              id: row.user_id,
              firstName: row.first_name
            },
            reactions: row.reactions,
            mentions: row.mentions,
            coverURL
          };
        })
      );
      return messages;
    } catch (error) {
      console.error('Error listing messages:', error);
      throw error;
    }
  }

  async checkRoomAccess(userId, roomId) {
    try {
      const query = 'SELECT 1 FROM user_room WHERE user_id = ? AND room_id = ?';
      const results = await db.query(query, [userId, roomId]);
      
      return results.length > 0;
    } catch (error) {
      console.error('Error checking room access:', error);
      throw error;
    }
  }

  async processCoverURL(row, itemId) {
    let coverURL = null;
    
    try {
      if (row.cover_data) {
        const [mediaId, mediaType, fileName, userId] = row.cover_data.split('|');
        coverURL = await this.calculateCoverURL(userId, mediaId, fileName, mediaType);
      }
    } catch (error) {
      console.error(`Error processing cover for ${itemId}:`, error);
      coverURL = null;
    }
    
    return coverURL;
  }

  async calculateCoverURL(userId, mediaId, fileName, mediaType) {
    try {
      const thumbnailObject = `${process.env.THUMBNAIL_FOLDER}/${userId}/${mediaId}.png`;
      const thumbnailExists = await awsService.checkObjectExists(thumbnailObject);
      if (thumbnailExists) {
        return `${process.env.AWS_CDN}/${thumbnailObject}`;
      }
      const folderName = mediaType == "video" ? process.env.VIDEO_FOLDER : process.env.PHOTO_FOLDER;
      return `${process.env.AWS_CDN}/${folderName}/${userId}/${mediaId}${fileName}`;
    } catch (error) {
      console.error('Error calculating cover URL:', error);
      return null;
    }
  }

}

module.exports = new UserService();