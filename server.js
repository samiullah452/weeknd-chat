require('dotenv').config();
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const redisClient = require('./config/redis');
const socketService = require('./services/socketService');
const AuthMiddleware = require('./middleware/auth');

const io = new Server({
  adapter: createAdapter(redisClient.getPubClient(), redisClient.getSubClient())
});

io.use(AuthMiddleware.authenticateSocket);

io.on('connection', (socket) => {
  socketService.handleConnection(socket, io);
});

const PORT = process.env.PORT;

const startServer = async () => {
  try {
    io.listen(PORT);
    console.log(`🚀 WebSocket server running on port ${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisClient.close();
  io.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = { io };