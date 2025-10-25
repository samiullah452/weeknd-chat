const MESSAGES = {
  SUCCESS: {
    CONNECTED: 'Connected and authenticated successfully',
    ROOM_JOINED: 'Successfully joined room',
    ROOM_LEFT: 'Successfully left room',
    ROOMS_LISTED: 'Rooms retrieved successfully',
    MESSAGES_LISTED: 'Messages retrieved successfully',
    MESSAGE_SENT: 'Message sent successfully',
    MESSAGE_UPDATED: 'Message updated successfully',
    MESSAGE_DELETED: 'Message deleted successfully',
    REACTION_ADDED: 'Reaction added successfully',
    REACTION_DELETED: 'Reaction deleted successfully',
    INBOX_UPDATED: 'Inbox updated successfully',
    ONLINE_STATUS_UPDATED: 'Online status updated successfully',
    MEMBERS_LISTED: 'Members retrieved successfully',
    REACTION_USERS_LISTED: 'Reaction users listed successfully'

  },

  ERROR: {
    AUTH_TOKEN_REQUIRED: 'Authentication token required',
    INVALID_TOKEN: 'Invalid token',
    AUTH_FAILED: 'Authentication failed',
    USER_ACCESS_DENIED: 'User access denied - account flagged',
    USER_NOT_FOUND: 'User not found',

    ROOM_ID_REQUIRED: 'Room ID is required',
    ROOM_ACCESS_DENIED: 'Access denied to this room',
    FAILED_TO_JOIN_ROOM: 'Failed to join room',
    FAILED_TO_LEAVE_ROOM: 'Failed to leave room',
    FAILED_TO_LIST_ROOMS: 'Failed to list rooms',
    FAILED_TO_SEND_MESSAGE: 'Failed to send message',
    FAILED_TO_UPDATE_MESSAGE: 'Failed to update message',
    FAILED_TO_DELETE_MESSAGE: 'Failed to delete message',
    FAILED_TO_ADD_REACTION: 'Failed to add reaction',
    FAILED_TO_DELETE_REACTION: 'Failed to delete reaction',
    FAILED_TO_UPDATE_STATUS: 'Failed to update online status',
    FAILED_TO_GET_MEMBERS: 'Failed to get room members',
    FAILED_TO_LIST_REACTION_USERS: 'Failed to list reaction users',
    UPDATE_PERMISSION_DENIED: 'Only the message creator can update this message',
    DELETE_PERMISSION_DENIED: 'You do not have permission to delete this message',
    INVALID_DATA: 'Invalid data provided',
    INTERNAL_ERROR: 'Internal server error'
  }
};

const createResponse = (status, message, data = {}, error = null) => {
  const response = {
    status,
    message,
    ...data
  };
  
  if (error) {
    response.error = error;
  }
  
  return response;
};

const createSuccessResponse = (message, data = {}) => {
  return createResponse('success', message, data);
};

const createErrorResponse = (message, error = null) => {
  return createResponse('error', message, {}, error);
};

module.exports = {
  MESSAGES,
  createResponse,
  createSuccessResponse,
  createErrorResponse
};