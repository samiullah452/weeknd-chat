const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.pubClient = null;
    this.subClient = null;
    this.init();
  }

  async init() {
    try {
      const isCluster = process.env.REDIS_CLUSTER === 'true';

      if (isCluster) {
        // Cluster mode configuration
        const clusterNodes = [{
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT || 6379
        }];

        const clusterConfig = {
          redisOptions: {
            password: process.env.REDIS_PASSWORD,
            tls: process.env.REDIS_TLS === 'true' ? {} : null
          },
          retryDelayOnFailover: 500,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
          clusterRetryStrategy: (times) => {
            if (times > 10) return null;
            return Math.min(100 * times, 2000);
          }
        };

        console.log(`Connecting to Redis Cluster at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`);

        this.pubClient = new Redis.Cluster(clusterNodes, clusterConfig);
        this.subClient = new Redis.Cluster(clusterNodes, clusterConfig);
      } else {
        // Standalone mode configuration
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

        this.pubClient = new Redis(baseConfig);
        this.subClient = new Redis(baseConfig);
      }

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