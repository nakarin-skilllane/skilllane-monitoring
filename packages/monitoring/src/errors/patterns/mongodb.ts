import type { ErrorPattern } from './types'

// MongoDB driver / Mongoose: MONGO_<code> from the adapter, else class name.
export const mongodbPatterns: ErrorPattern[] = [
  {
    key: 'MONGO_11000',
    hint: 'Duplicate record',
    hintDetail:
      'E11000 duplicate key: a unique index rejected the document (see target). Often a double submit.',
    level: 'warn',
    category: 'data',
    target: /index: ([^\s]+)/,
  },
  {
    key: 'MONGO_121',
    hint: 'Document validation failed',
    hintDetail:
      'The collection JSON schema rejected the document. Check the required fields and types.',
    level: 'warn',
  },
  {
    key: 'MONGO_13',
    hint: 'MongoDB unauthorized',
    hintDetail:
      'The user lacks the role for this operation/database. Grant it.',
    category: 'config',
  },
  {
    key: 'MONGO_18',
    hint: 'MongoDB login rejected',
    hintDetail:
      'Authentication failed: wrong user/password or authSource. Check the Mongo URI in env.',
    category: 'config',
  },
  {
    key: 'MONGO_50',
    hint: 'MongoDB operation timed out',
    hintDetail: 'maxTimeMS exceeded. The query is slow; check indexes.',
    retryable: true,
  },
  {
    key: 'MONGO_112',
    hint: 'Write conflict',
    hintDetail:
      'Two transactions wrote the same document. Retry the transaction.',
    retryable: true,
  },
  {
    key: 'MONGO_251',
    hint: 'Transaction aborted',
    hintDetail:
      'NoSuchTransaction: the transaction was already aborted (timeout or earlier error). Start a new one.',
    retryable: true,
  },
  {
    key: 'MONGO_16500',
    hint: 'Cosmos DB rate limited',
    hintDetail:
      'Request rate is large (Cosmos DB RU limit). Retry with backoff.',
    retryable: true,
  },
  {
    key: 'MongoServerSelectionError',
    hint: 'MongoDB unreachable',
    hintDetail:
      'No server matched the read preference within serverSelectionTimeoutMS: the cluster is down, the URI is wrong, or the IP is not allow-listed.',
    retryable: true,
  },
  {
    key: 'MongoNetworkError',
    hint: 'MongoDB network error',
    hintDetail:
      'The connection to MongoDB failed or dropped. Check the network and the cluster.',
    retryable: true,
  },
  {
    key: 'MongoNetworkTimeoutError',
    hint: 'MongoDB socket timed out',
    hintDetail:
      'A socket read/connect exceeded its timeout. The server is slow or unreachable.',
    retryable: true,
  },
  {
    key: 'MongoTopologyClosedError',
    hint: 'MongoDB client closed',
    hintDetail:
      'An operation ran after client.close(), usually during shutdown.',
    category: 'bug',
  },
  {
    key: 'MongoNotConnectedError',
    hint: 'MongoDB not connected',
    hintDetail: 'An operation ran before connect() finished.',
    category: 'bug',
  },
  {
    key: 'MongoExpiredSessionError',
    hint: 'MongoDB session expired',
    hintDetail:
      'A session was used after it ended. Check the session lifecycle.',
    category: 'bug',
  },
  {
    key: 'MongoWriteConcernError',
    hint: 'MongoDB write concern failed',
    hintDetail:
      'The write was not acknowledged by enough replicas in time. Check replica health.',
    retryable: true,
  },
  {
    key: 'MongoBulkWriteError',
    hint: 'MongoDB bulk write failed',
    hintDetail:
      'Some bulk operations failed (often duplicates). Read writeErrors.',
    level: 'warn',
  },
  {
    key: 'MongoParseError',
    hint: 'MongoDB URI invalid',
    hintDetail:
      'The connection string or an option could not be parsed. Check the Mongo URI in env.',
    category: 'config',
  },
  {
    key: 'MongooseServerSelectionError',
    hint: 'MongoDB unreachable',
    hintDetail:
      'Mongoose could not find a server: the cluster is down, the URI is wrong, or the IP is not allow-listed.',
    retryable: true,
  },
  {
    key: 'DocumentNotFoundError',
    hint: 'Document not found',
    hintDetail: 'orFail() found no document. Usually a wrong or deleted id.',
    level: 'warn',
  },
  {
    key: 'VersionError',
    hint: 'Document changed by someone',
    hintDetail:
      'The document __v changed since it was loaded. Reload and retry.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'StrictModeError',
    hint: 'Unknown schema field',
    hintDetail:
      'A field not in the schema was set (strict mode). Add it to the schema or drop it.',
    category: 'bug',
  },
  {
    key: 'MissingSchemaError',
    hint: 'Mongoose model not registered',
    hintDetail:
      'mongoose.model(name) was called before the schema was registered (see target).',
    category: 'bug',
    target: /Schema hasn't been registered for model "([^"]+)"/,
  },
  {
    key: 'OverwriteModelError',
    hint: 'Mongoose model defined twice',
    hintDetail:
      'mongoose.model(name, schema) ran twice for the same name (hot reload, duplicate import).',
    category: 'bug',
  },
  {
    key: 'MONGO_BUFFERING_TIMEOUT',
    messageMatch: /buffering timed out after \d+ms/,
    hint: 'Mongoose not connected',
    hintDetail:
      'A query waited for the connection that never came (bufferTimeoutMS). mongoose.connect() failed or was never called.',
    category: 'dependency',
    retryable: true,
  },
]
