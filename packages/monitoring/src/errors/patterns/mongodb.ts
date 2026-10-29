import type { ErrorPattern } from './types'

// Sources:
// - https://www.mongodb.com/docs/manual/reference/error-codes/ (MongoDB server error codes)
// - https://learn.microsoft.com/en-us/azure/cosmos-db/mongodb/error-codes-solutions (Cosmos DB 16500)
// - https://github.com/mongodb/node-mongodb-native/blob/main/src/error.ts (driver error classes)
// - https://github.com/mongodb/node-mongodb-native/blob/main/src/operations/execute_operation.ts (auto-connect, MongoNotConnectedError)
// - https://mongoosejs.com/docs/api/error.html (Mongoose error classes)
// - https://github.com/Automattic/mongoose/blob/master/lib/drivers/node-mongodb-native/collection.js (buffering timeout)
// MongoDB driver / Mongoose: MONGO_<code> from the adapter, else class name.
export const mongodbPatterns: ErrorPattern[] = [
  {
    key: 'MONGO_11000',
    hint: 'Duplicate record',
    detail:
      'E11000 duplicate key: a unique index rejected the document (see target). Often a double submit.',
    howToFix:
      'Check the index name; guard against a double submit, or upsert instead.',
    level: 'warn',
    category: 'data',
    target: /index: ([^\s]+)/,
  },
  {
    key: 'MONGO_121',
    hint: 'Document validation failed',
    detail: 'The collection JSON schema rejected the document.',
    howToFix: 'Check the required fields and types.',
    level: 'warn',
  },
  {
    key: 'MONGO_13',
    hint: 'MongoDB unauthorized',
    detail: 'The user lacks the role for this operation/database.',
    howToFix: 'Grant the role to the MongoDB user.',
    category: 'config',
  },
  {
    key: 'MONGO_18',
    hint: 'MongoDB login rejected',
    detail: 'Authentication failed: wrong user/password or authSource.',
    howToFix: 'Check the Mongo URI in env.',
    category: 'config',
  },
  {
    key: 'MONGO_50',
    hint: 'MongoDB operation timed out',
    detail: 'maxTimeMS exceeded. The query is slow.',
    howToFix: 'Check indexes.',
    retryable: true,
  },
  {
    key: 'MONGO_112',
    hint: 'Write conflict',
    detail: 'Two transactions wrote the same document.',
    howToFix: 'Retry the transaction.',
    retryable: true,
  },
  {
    key: 'MONGO_251',
    hint: 'Transaction aborted',
    detail:
      'NoSuchTransaction: the transaction was already aborted (timeout or earlier error).',
    howToFix: 'Start a new one.',
    retryable: true,
  },
  {
    key: 'MONGO_16500',
    hint: 'Cosmos DB rate limited',
    detail: 'Request rate is large (Cosmos DB RU limit).',
    howToFix:
      'Retry with backoff, or raise the provisioned throughput (RU/s) of the container.',
    retryable: true,
  },
  {
    key: 'MongoServerSelectionError',
    hint: 'MongoDB unreachable',
    detail:
      'No server matched the read preference within serverSelectionTimeoutMS: the cluster is down, the URI is wrong, or the IP is not allow-listed.',
    howToFix:
      'Check the cluster status, the Mongo URI in env, and the IP allow list.',
    retryable: true,
  },
  {
    key: 'MongoNetworkError',
    hint: 'MongoDB network error',
    detail: 'The connection to MongoDB failed or dropped.',
    howToFix: 'Check the network and the cluster.',
    retryable: true,
  },
  {
    key: 'MongoNetworkTimeoutError',
    hint: 'MongoDB socket timed out',
    detail:
      'A socket read/connect exceeded its timeout. The server is slow or unreachable.',
    howToFix: 'Check the server load and the network, then retry.',
    retryable: true,
  },
  {
    key: 'MongoTopologyClosedError',
    hint: 'MongoDB client closed',
    detail: 'An operation ran after client.close(), usually during shutdown.',
    howToFix:
      'Stop sending operations before calling client.close() at shutdown.',
    category: 'bug',
  },
  {
    key: 'MongoNotConnectedError',
    hint: 'MongoDB not connected',
    detail:
      'An operation ran on a MongoClient that was closed. The driver auto-connects only a client that was never closed.',
    howToFix:
      'Stop operations before client.close(), or create a new MongoClient instead of reusing a closed one.',
    category: 'bug',
  },
  {
    key: 'MongoExpiredSessionError',
    hint: 'MongoDB session expired',
    detail: 'A session was used after it ended.',
    howToFix: 'Check the session lifecycle.',
    category: 'bug',
  },
  {
    key: 'MongoWriteConcernError',
    hint: 'MongoDB write concern failed',
    detail: 'The write was not acknowledged by enough replicas in time.',
    howToFix: 'Check replica health.',
    retryable: true,
  },
  {
    key: 'MongoBulkWriteError',
    hint: 'MongoDB bulk write failed',
    detail: 'Some bulk operations failed (often duplicates).',
    howToFix: 'Read writeErrors.',
    level: 'warn',
  },
  {
    key: 'MongoParseError',
    hint: 'MongoDB URI invalid',
    detail: 'The connection string or an option could not be parsed.',
    howToFix: 'Check the Mongo URI in env.',
    category: 'config',
  },
  {
    key: 'MongooseServerSelectionError',
    hint: 'MongoDB unreachable',
    detail:
      'Mongoose could not find a server: the cluster is down, the URI is wrong, or the IP is not allow-listed.',
    howToFix:
      'Check the cluster status, the Mongo URI in env, and the IP allow list.',
    retryable: true,
  },
  {
    key: 'DocumentNotFoundError',
    hint: 'Document not found',
    detail:
      'orFail() found no document, or save() found the document deleted in the meantime. Usually a wrong or deleted id.',
    howToFix: 'Check the id, and return 404 when the document is missing.',
    level: 'warn',
  },
  {
    key: 'VersionError',
    hint: 'Document changed by someone',
    detail: 'The document __v changed since it was loaded.',
    howToFix: 'Reload and retry.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'StrictModeError',
    hint: 'Unknown schema field',
    detail:
      "A field not in the schema was set, or an immutable field changed, with strict: 'throw'.",
    howToFix: 'Add it to the schema or drop it.',
    category: 'bug',
  },
  {
    key: 'MissingSchemaError',
    hint: 'Mongoose model not registered',
    detail:
      'mongoose.model(name) was called before the schema was registered (see target).',
    howToFix: 'Import the schema file before calling mongoose.model(name).',
    category: 'bug',
    target: /Schema hasn't been registered for model "([^"]+)"/,
  },
  {
    key: 'OverwriteModelError',
    hint: 'Mongoose model defined twice',
    detail:
      'mongoose.model(name, schema) ran twice for the same name (hot reload, duplicate import).',
    howToFix:
      'Reuse the existing model from mongoose.models instead of defining it again.',
    category: 'bug',
  },
  {
    key: 'MONGO_BUFFERING_TIMEOUT',
    messageMatch: /buffering timed out after \d+ms/,
    hint: 'Mongoose not connected',
    detail:
      'A query waited for the connection that never came (bufferTimeoutMS). mongoose.connect() failed or was never called.',
    howToFix: 'Check the connect error at startup and the Mongo URI in env.',
    category: 'dependency',
    retryable: true,
  },
]
