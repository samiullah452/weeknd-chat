const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

class AWSService {
    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    }

    async checkObjectExists(objectKey) {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey
            });

            await this.s3Client.send(command);
            return true;
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }

    async getObjectMetadata(objectKey) {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey
            });

            const response = await this.s3Client.send(command);
            return {
                exists: true,
                contentLength: response.ContentLength,
                lastModified: response.LastModified,
                contentType: response.ContentType,
                etag: response.ETag
            };
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return { exists: false };
            }
            throw error;
        }
    }
}

module.exports = new AWSService();