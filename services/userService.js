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
      const limit = parseInt(process.env.PAGE_LIMIT);
      const offset = page * limit;

      let whereCondition = 'WHERE ur.user_id = ?';
      let queryParams = [userId];

      if (searchQuery) {
        whereCondition += ` AND (
          (r.type = 'event' AND r.name LIKE '${searchQuery}%') 
          OR 
          (r.type = 'direct_message' AND EXISTS (
            SELECT 1 FROM user_room ur3 
            JOIN user u ON ur3.user_id = u.id 
            WHERE ur3.room_id = r.id 
            AND ur3.user_id != ? 
            AND u.first_name LIKE '${searchQuery}%'
          ))
        )`;
        queryParams.push(userId);
      }

      const query = `SELECT 
          r.id,
          r.name,
          r.type,
          r.created_at,
          COALESCE(
            (SELECT COUNT(*) 
             FROM message m 
             WHERE m.room_id = ur.room_id 
             AND m.id > COALESCE(ur.last_message_id, 0)
            ), 0
          ) as unreadCount,
          CASE 
            WHEN r.type = 'event' THEN 
              COALESCE(
                (SELECT CONCAT(up.user_id, '|', up.id, '|', up.file_name, '|photo') 
                 FROM irl e 
                 JOIN user_photo up ON e.media_id = up.id 
                 WHERE e.room_id = r.id AND e.media_type = 'photo'
                 LIMIT 1),
                (SELECT CONCAT(uv.user_id, '|', uv.id, '|', uv.file_name, '|video') 
                 FROM irl e 
                 JOIN user_video uv ON e.media_id = uv.id 
                 WHERE e.room_id = r.id AND e.media_type = 'video'
                 LIMIT 1)
              )
            WHEN r.type = 'direct_message' THEN 
              (SELECT CONCAT(up.user_id, '|', up.id, '|', up.file_name, '|photo') 
               FROM user_room ur2 
               JOIN user_photo up ON ur2.user_id = up.user_id 
               WHERE ur2.room_id = r.id 
               AND ur2.user_id != ? AND up.photo_type = 1
               LIMIT 1)
            ELSE NULL
          END as coverData
        FROM user_room ur
        JOIN room r ON ur.room_id = r.id
        ${whereCondition} 
        ORDER BY (
          SELECT MAX(m.created_at) 
          FROM message m 
          WHERE m.room_id = r.id
        ) DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}`;

      queryParams.push(userId);
      const results = await db.query(query, queryParams);
      const rooms = await Promise.all(results.map(async (row) => {
      let coverURL = null;
        
        if (row.coverData) {
          const [userId, mediaId, fileName, mediaType] = row.coverData.split('|');
          coverURL = await this.calculateCoverURL(userId, mediaId, fileName, mediaType);
        }
        
        return {
          id: row.id,
          name: row.name,
          type: row.type,
          createdAt: row.created_at,
          unreadCount: row.unreadCount,
          coverURL
        };
      }));
      
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

  async listMessages(userId, roomId, page = 0) {
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 10;
      const offset = page * limit;

      const query = `
        SELECT 
          m.id,
          m.value,
          m.type,
          m.created_at,
          m.parent_message_id,
          m.user_id,
          u.first_name,
          md.id as media_id,
          md.fileType as media_fileType,
          md.type as media_type,
          md.fileName as media_fileName,
          md.thumbnail as media_thumbnail,
          GROUP_CONCAT(
            CASE WHEN mr.value IS NOT NULL 
            THEN CONCAT(mr.value, ':', COUNT(mr.value)) 
            END SEPARATOR ','
          ) as reactions,
          COUNT(mr.message_id) as totalReactions,
          (SELECT mr_user.value 
           FROM message_reaction mr_user 
           WHERE mr_user.message_id = m.id 
           AND mr_user.user_id = ?
           LIMIT 1
          ) as reacted
        FROM message m
        JOIN users u ON m.user_id = u.id
        LEFT JOIN media md ON m.id = md.message_id
        LEFT JOIN message_reaction mr ON m.id = mr.message_id
        WHERE m.room_id = ?
        GROUP BY m.id, m.value, m.type, m.created_at, m.parent_message_id, m.user_id, u.first_name, md.id, md.fileType, md.type, md.fileName, md.thumbnail
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const results = await db.query(query, [userId, roomId, limit, offset]);
      
      const messages = await Promise.all(results.map(async (row) => {
        const reactions = {};
        if (row.reactions) {
          row.reactions.split(',').forEach(reaction => {
            const [emoji, count] = reaction.split(':');
            if (emoji && count) {
              reactions[emoji] = parseInt(count);
            }
          });
        }

        let media = null;
        if (row.media_id) {
          const uri = await this.calculateMediaUri(row.user_id, row.media_type, row.media_id, row.media_fileName);
          media = {
            id: row.media_id,
            uri,
            fileType: row.media_fileType,
            type: row.media_type,
            thumbnail: row.media_thumbnail
          };
        }

        return {
          id: row.id,
          value: row.value,
          type: row.type,
          createdAt: row.created_at,
          parentMessageId: row.parent_message_id,
          user: {
            id: row.user_id,
            firstName: row.first_name
          },
          media,
          reactions,
          totalReactions: row.totalReactions || 0,
          reacted: row.reacted
        };
      }));

      return messages;
    } catch (error) {
      console.error('Error listing messages:', error);
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