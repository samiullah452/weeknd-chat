const MESSAGES = {
  SUCCESS: {
    CONNECTED: 'Connected and authenticated successfully',
    ROOM_JOINED: 'Successfully joined room',
    ROOMS_LISTED: 'Rooms retrieved successfully',
    MESSAGES_LISTED: 'Messages retrieved successfully',
    MESSAGE_SENT: 'Message sent successfully',
    REACTION_ADDED: 'Reaction added successfully',
    USERS_LISTED: 'Users retrieved successfully'
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
    FAILED_TO_LIST_ROOMS: 'Failed to list rooms',
    FAILED_TO_LIST_MESSAGES: 'Failed to list messages',
    FAILED_TO_SEND_MESSAGE: 'Failed to send message',
    MESSAGE_VALUE_REQUIRED: 'Message value is required',
    MESSAGE_TYPE_REQUIRED: 'Message type is required',
    MESSAGE_ID_REQUIRED: 'Message ID is required',
    REACTION_VALUE_REQUIRED: 'Reaction value is required',
    FAILED_TO_ADD_REACTION: 'Failed to add reaction',
    FAILED_TO_LIST_USERS: 'Failed to list users',
    
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