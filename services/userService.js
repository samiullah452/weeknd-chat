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

  async listRooms(userId, page = 0, searchQuery = null, roomId = null) {
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 20;
      const offset = page * limit;

      // Build WHERE condition with proper parameterization
      let whereCondition = ` WHERE u.user_id = ?`;
      const queryParams = [userId];

      if (roomId) {
        whereCondition += ` AND u.room_id = ?`;
        queryParams.push(roomId);
      } else if (searchQuery) {
        whereCondition += ` AND u.name like ?`;
        queryParams.push(`${searchQuery}%`);
      }

      // Optimized query using CTEs instead of LATERAL JOINs
      const query = roomId
        ? `SELECT * FROM user_room_info u ${whereCondition} LIMIT 1`
        : `SELECT * FROM user_room_info u ${whereCondition} ORDER BY u.last_message_date DESC LIMIT ${limit} OFFSET ${offset}`;

      const results = await db.query(query, queryParams);
      
      // Process results in parallel with error handling for each room
      const rooms = await Promise.all(
        results.map(async (row) => {
          const coverURL = await this.processCoverURL(row, `room ${row.id}`);
          
          const lastMessage = {
            text: row.last_message_text,
            type: row.last_message_type,
            createdAt: row.last_message_date,
            firstName: row.last_message_user
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

  async listMessages(roomId, page = 0, messageId = null) {
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 20;
      const offset = page * limit;

      const query = messageId
        ? `SELECT * FROM message_info WHERE room_id = ? AND id = ? LIMIT 1`
        : `SELECT * FROM message_info WHERE room_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const results = await db.query(query, messageId ? [roomId, messageId] : [roomId]);
      
      // Process results in parallel with error handling for each message
      const messages = await Promise.all(
        results.map(async (row) => {
          const coverURL = await this.processCoverURL(row, `message ${row.id}`);
          
          return {
            id: row.id,
            roomId: row.room_id,
            type: row.type,
            value: row.value,
            createdAt: row.created_at,
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

  async updateLastMessageRead(userId, roomId, messageId) {
    try {
      const query = 'UPDATE user_room SET last_message_id = ? WHERE user_id = ? AND room_id = ?';
      await db.query(query, [messageId, userId, roomId]);
    } catch (error) {
      console.error('Error updating last message read:', error);
      throw error;
    }
  }

  async getRoomMembers(roomId, page) {
    try {
      const limit = parseInt(process.env.PAGE_LIMIT) || 20;
      const offset = page * limit;

      const query = `
        SELECT u.id, u.firstName, u.profilePhoto, ur.is_operator
        FROM user_room ur
        JOIN users u ON ur.user_id = u.id
        WHERE ur.room_id = ?
        LIMIT ${limit} OFFSET ${offset}
      `;
      const results = await db.query(query, [roomId]);
      return results.map(row => ({
        id: row.id,
        firstName: row.firstName,
        profilePhoto: row.profilePhoto,
        isOperator: row.is_operator
      }));
    } catch (error) {
      console.error('Error getting room members:', error);
      throw error;
    }
  }

  async getRoomMembersInboxData(roomId, offset = 0, limit = 100) {
    try {
      const query = `
        SELECT * FROM user_room_info u
        WHERE u.room_id = ?
        LIMIT ${limit} OFFSET ${offset}
      `;
      const results = await db.query(query, [roomId]);

      if (results.length === 0) return [];

      const isDirectMessage = results[0].room_type === 'direct_message';
      const sharedCoverURL = isDirectMessage ? null : await this.processCoverURL(results[0], `room ${results[0].room_id}`);

      const inboxDataByUser = await Promise.all(
        results.map(async (row) => {
          const coverURL = isDirectMessage
            ? await this.processCoverURL(row, `room ${row.id}`)
            : sharedCoverURL;

          const lastMessage = {
            text: row.last_message_text,
            type: row.last_message_type,
            createdAt: row.last_message_date
          };

          return {
            userId: row.user_id,
            data: {
              id: row.room_id,
              name: row.name,
              type: row.room_type,
              createdAt: row.room_created_at,
              unreadCount: row.unreadCount,
              coverURL,
              lastMessage
            }
          };
        })
      );

      return inboxDataByUser;
    } catch (error) {
      console.error('Error getting room members inbox data:', error);
      throw error;
    }
  }

  async insertMessage(userId, type, value, parentMessage, roomId, mentions = [], media = null) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Insert into user_photo or user_video if type is photo/video
      if (media && (type === 'photo' || type === 'video')) {
        const { id, fileName, type: mediaType } = media;

        if (type === 'photo') {
          const insertPhotoQuery = `
            INSERT INTO user_photo (id, user_id, file_name, type, photo_type)
            VALUES (?, ?, ?, ?, 5)
          `;
          await connection.execute(insertPhotoQuery, [id, userId, fileName, mediaType]);
        } else if (type === 'video') {
          const insertVideoQuery = `
            INSERT INTO user_video (id, user_id, file_name, type, video_type)
            VALUES (?, ?, ?, ?, 5)
          `;
          await connection.execute(insertVideoQuery, [id, userId, fileName, mediaType]);
        }
      }

      const insertMessageQuery = `
        INSERT INTO message (type, value, parent_message, room_id, user_id)
        VALUES (?, ?, ?, ?, ?)
      `;

      const [result] = await connection.execute(insertMessageQuery, [
        type,
        value,
        parentMessage || null,
        roomId,
        userId
      ]);

      const messageId = result.insertId;

      if (mentions && mentions.length > 0) {
        const values = mentions.map(() => '(?, ?)').join(', ');
        const insertMentionQuery = `INSERT INTO message_mention (user_id, message_id) VALUES ${values}`;
        const params = mentions.flatMap(mentionUserId => [mentionUserId, messageId]);

        await connection.execute(insertMentionQuery, params);
      }

      await connection.commit();
      return messageId;

    } catch (error) {
      await connection.rollback();
      console.error('Error inserting message:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async getUserDeviceTokens(userIds, offset = 0, limit = 100) {
    try {
      if (userIds.length === 0) return [];

      const placeholders = userIds.map(() => '?').join(',');
      const query = `
        SELECT device_token, user_id
        FROM user_device_token
        WHERE user_id IN (${placeholders})
        LIMIT ${limit} OFFSET ${offset}
      `;

      const results = await db.query(query, [...userIds]);
      return results;
    } catch (error) {
      console.error('Error getting user device tokens:', error);
      throw error;
    }
  }

  async canDeleteMessage(userId, messageId) {
    try {
      const query = `
        SELECT m.user_id, m.room_id, ur.is_operator
        FROM message m
        LEFT JOIN user_room ur ON m.room_id = ur.room_id AND ur.user_id = ?
        WHERE m.id = ?
      `;
      const results = await db.query(query, [userId, messageId]);

      if (results.length === 0) {
        return { canDelete: false, reason: 'Message not found' };
      }

      const message = results[0];

      // User can delete if they are the creator OR they are an operator in the room
      const isCreator = message.user_id === userId;
      const isOperator = message.is_operator === 1;

      if (isCreator || isOperator) {
        return { canDelete: true, roomId: message.room_id };
      }

      return { canDelete: false, reason: 'Not authorized to delete this message' };
    } catch (error) {
      console.error('Error checking delete message permission:', error);
      throw error;
    }
  }

  async isLastMessageInRoom(messageId, roomId) {
    try {
      const query = `
        SELECT id FROM message
        WHERE room_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const results = await db.query(query, [roomId]);

      if (results.length === 0) return false;

      return results[0].id === messageId;
    } catch (error) {
      console.error('Error checking if message is last in room:', error);
      throw error;
    }
  }

  async deleteMessage(messageId) {
    try {
      const query = 'DELETE FROM message WHERE id = ?';
      await db.query(query, [messageId]);
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  async addReaction(messageId, userId, value) {
    try {
      const query = 'INSERT INTO message_reaction (message_id, user_id, value) VALUES (?, ?, ?)';
      await db.query(query, [messageId, userId, value]);
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  async deleteReaction(messageId, userId, value) {
    try {
      const query = 'DELETE FROM message_reaction WHERE message_id = ? AND user_id = ? AND value = ?';
      await db.query(query, [messageId, userId, value]);
    } catch (error) {
      console.error('Error deleting reaction:', error);
      throw error;
    }
  }

  async canUpdateMessage(userId, messageId) {
    try {
      const query = `
        SELECT user_id, room_id, type
        FROM message
        WHERE id = ?
      `;
      const results = await db.query(query, [messageId]);

      if (results.length === 0) {
        return { canUpdate: false, reason: 'Message not found' };
      }

      const message = results[0];

      // Only text messages can be updated
      if (message.type !== 'text') {
        return { canUpdate: false, reason: 'Only text messages can be updated' };
      }

      // Only the creator can update the message
      if (message.user_id === userId) {
        return { canUpdate: true, roomId: message.room_id };
      }

      return { canUpdate: false, reason: 'Only the message creator can update this message' };
    } catch (error) {
      console.error('Error checking update message permission:', error);
      throw error;
    }
  }

  async updateMessage(messageId, newValue, mentions = []) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Update message value and set is_edited flag
      const updateQuery = 'UPDATE message SET value = ?, is_edited = 1 WHERE id = ?';
      await connection.execute(updateQuery, [newValue, messageId]);

      // Delete old mentions
      const deleteMentionsQuery = 'DELETE FROM message_mention WHERE message_id = ?';
      await connection.execute(deleteMentionsQuery, [messageId]);

      // Insert new mentions
      if (mentions && mentions.length > 0) {
        const values = mentions.map(() => '(?, ?)').join(', ');
        const insertMentionQuery = `INSERT INTO message_mention (user_id, message_id) VALUES ${values}`;
        const params = mentions.flatMap(mentionUserId => [mentionUserId, messageId]);

        await connection.execute(insertMentionQuery, params);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Error updating message:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

}

module.exports = new UserService();