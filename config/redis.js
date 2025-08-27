const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.pubClient = null;
    this.subClient = null;
    this.init();
  }

  async init() {
    try {
      const baseConfig = {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 500,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: false,
        connectTimeout: 10000,
        commandTimeout: 5000,
        tls: process.env.REDIS_TLS === 'true' ? {} : null
      };

      console.log(`Connecting to Redis at ${baseConfig.host}:${baseConfig.port}`);
      
      // Publisher client
      this.pubClient = new Redis(baseConfig);

      // Subscriber client
      this.subClient = new Redis(baseConfig);

      this.pubClient.on('error', (err) => {
        console.error('Redis Pub Client Error:', err.message || err);
      });

      this.pubClient.on('connect', () => {
        console.log('Redis Pub Client connected...');
      });

      this.subClient.on('error', (err) => {
        console.error('Redis Sub Client Error:', err.message || err);
      });

      this.subClient.on('connect', () => {
        console.log('Redis Sub Client connected...');
      });

    } catch (error) {
      console.error('Failed to initialize Redis ElastiCache:', error);
    }
  }

  getSubClient() {
    return this.subClient;
  }

  getPubClient() {
    return this.pubClient;
  }

  async close() {
    try {
      if (this.pubClient) {
        await this.pubClient.disconnect();
        console.log('Redis pub client disconnected');
      }
      
      if (this.subClient) {
        await this.subClient.disconnect();
        console.log('Redis sub client disconnected');
      }
    } catch (error) {
      console.error('Error closing Redis connections:', error);
    }
  }

}

module.exports = new RedisClient();