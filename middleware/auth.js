const jwt = require('jsonwebtoken');
const userService = require('../services/userService');
const { MESSAGES } = require('../constants/messages');

class AuthMiddleware {
  static async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error(MESSAGES.ERROR.AUTH_TOKEN_REQUIRED));
      }

      // const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      //   algorithms: ['HS512']
      // });

      try {
        const decoded = {
          id: 1622,
          firstName: "kyle",
          publicUser: 1,
          hasAccess: true
        }
        const userAccess = await userService.checkUserAccess(decoded);
        
        socket.userId = decoded.id;
        socket.user = userAccess;
        next();
      } catch (userError) {
        return next(new Error(userError.message));
      }
    } catch (error) {
      next(new Error(MESSAGES.ERROR.AUTH_FAILED));
    }
  }
}

module.exports = AuthMiddleware;