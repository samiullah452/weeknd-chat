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
      whereCondition += ` AND u.name like '?'`
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
        try {
          let coverURL = null;
          
          if (row.coverData) {
            const [mediaId, mediaType, fileName, userId] = row.coverData.split('|');
            coverURL = await this.calculateCoverURL(userId, mediaId, fileName, mediaType);
          }
          
          const lastMessage = {
            text: row.last_message_text,
            type: row.last_message_type,
            createdAt: row.last_message_date
          };

          return {
            id: row.id,
            name: row.name,
            type: row.type,
            createdAt: row.created_at,
            unreadCount: row.unreadCount,
            coverURL,
            lastMessage
          };
        } catch (error) {
          console.error(`Error processing room ${row.id}:`, error);
          // Return room with minimal data if processing fails
          return {
            id: row.id,
            name: row.name,
            type: row.type,
            createdAt: row.created_at,
            unreadCount: 0,
            coverURL: null,
            lastMessage: null
          };
        }
      })
    );
    
    return rooms;
  } catch (error) {
    console.error('Error listing user rooms:', error);
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


  async calculateMediaUri(userId, mediaId, fileName, mediaType) {
    try {
      const compressedVideoFolder = process.env.COMPRESSED_VIDEO_FOLDER || 'compressed/video/';
      const videoFolder = process.env.VIDEO_FOLDER || 'video/';
      const compressedPhotoFolder = process.env.COMPRESSED_PHOTO_FOLDER || 'compressed/photo/';
      const photoFolder = process.env.PHOTO_FOLDER || 'photo/';
      
      if (mediaType === 'video') {
        const compressedObjectName = `${compressedVideoFolder}${userId}/${mediaId}.mp4`;
        
        const compressedExists = await awsService.checkObjectExists(compressedObjectName);
        if (compressedExists) {
          return compressedObjectName;
        }
        
        return `${videoFolder}${userId}/${mediaId}${fileName}`;
      } else if (mediaType === 'photo') {
        const compressedObjectName = `${compressedPhotoFolder}${userId}/${mediaId}.jpg`;
        
        const compressedExists = await awsService.checkObjectExists(compressedObjectName);
        if (compressedExists) {
          return compressedObjectName;
        }
        
        return `${photoFolder}${userId}/${mediaId}${fileName}`;
      }
      
      return null;
    } catch (error) {
      console.error('Error calculating cover URL:', error);
      return null;
    }
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


  async sendMessage(userId, roomId, value, type, parentMessageId = null) {
    try {
      const query = `
        INSERT INTO message (room_id, user_id, value, type, parent_message_id) 
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const result = await db.query(query, [roomId, userId, value, type, parentMessageId]);
      
      const messageQuery = `
        SELECT 
          m.id,
          m.value,
          m.type,
          m.created_at,
          m.parent_message_id,
          u.first_name as sender_name
        FROM message m
        JOIN users u ON m.user_id = u.id
        WHERE m.id = ?
      `;
      
      const message = await db.query(messageQuery, [result.insertId]);
      
      return {
        id: message[0].id,
        value: message[0].value,
        type: message[0].type,
        createdAt: message[0].created_at,
        parentMessageId: message[0].parent_message_id,
        senderName: message[0].sender_name,
        reactions: {},
        reacted: null
      };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async getRoomUsers(roomId, limit = 100, offset = 0) {
    try {
      const query = 'SELECT user_id FROM user_room WHERE room_id = ? LIMIT ? OFFSET ?';
      const results = await db.query(query, [roomId, limit, offset]);
      
      return results.map(row => row.user_id);
    } catch (error) {
      console.error('Error getting room users:', error);
      throw error;
    }
  }

  async getRoomDeviceTokens(roomId, limit = 100, offset = 0) {
    try {
      const query = `
        SELECT DISTINCT udt.device_token 
        FROM user_room ur
        JOIN user_device_token udt ON ur.user_id = udt.user_id
        WHERE ur.room_id = ?
        LIMIT ? OFFSET ?
      `;
      
      const results = await db.query(query, [roomId, limit, offset]);
      return results.map(row => row.device_token);
    } catch (error) {
      console.error('Error getting room device tokens:', error);
      throw error;
    }
  }

  async addReaction(messageId, userId, value) {
    try {
      const query = `
        INSERT INTO message_reaction (message_id, user_id, value) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `;
      
      await db.query(query, [messageId, userId, value]);
      
      return {
        messageId,
        userId,
        value,
        reacted: true
      };
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  async listRoomUsers(roomId, page = 0) {
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 10;
      const offset = page * limit;

      const query = `
        SELECT 
          u.id,
          u.first_name,
          u.public_user,
          up.photo_url
        FROM user_room ur
        JOIN users u ON ur.user_id = u.id
        LEFT JOIN user_photo up ON u.id = up.user_id AND up.photoType = 1
        WHERE ur.room_id = ? AND u.flagged = 0
        ORDER BY u.first_name ASC
        LIMIT ? OFFSET ?
      `;
      
      const results = await db.query(query, [roomId, limit, offset]);
      
      return results.map(row => ({
        id: row.id,
        firstName: row.first_name,
        publicUser: row.public_user,
        profilePhoto: row.photo_url
      }));
    } catch (error) {
      console.error('Error listing room users:', error);
      throw error;
    }
  }
}

module.exports = new UserService();