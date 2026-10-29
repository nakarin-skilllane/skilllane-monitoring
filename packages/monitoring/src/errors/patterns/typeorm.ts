import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/typeorm/typeorm/tree/0.3.31/src/error (TypeORM 0.3 error classes and messages)
// - https://github.com/typeorm/typeorm/blob/0.3.31/src/query-builder/QueryBuilder.ts (where, alias and empty-criteria messages)
// - https://github.com/typeorm/typeorm/tree/0.2.45/src/error (EntityColumnNotFound, RepositoryNotFoundError from 0.2)

// TypeORM 0.3 errors (src/error/*), matched by class name (generic adapter)
// or message.
export const typeormPatterns: ErrorPattern[] = [
  {
    key: 'EntityNotFoundError',
    hint: 'Record not found',
    detail:
      'findOneOrFail found no row, usually a wrong or deleted id from the client; the filter answers 404.',
    howToFix: 'Check the id the client sent, or whether the row was deleted.',
    level: 'warn',
    category: 'input',
    explain: ({ message }) => {
      const entity = message.match(/entity of type "([^"]+)"/)?.[1]
      if (!entity) return undefined
      // Criteria keys only; their values may be personal data.
      const keys = [
        ...new Set(
          [...message.matchAll(/"(\w+)"\s*:/g)].map((match) => match[1]),
        ),
      ]
      const by = keys.length ? ` by (${keys.join(', ')})` : ''
      return {
        target: entity,
        detail: `No ${entity} found${by}.`,
        howToFix:
          'Check the id the client sent, or whether the row was deleted.',
      }
    },
  },
  {
    key: 'EntityPropertyNotFoundError',
    hint: 'Unknown entity property',
    detail:
      'A where/order/select names a property the entity does not have: a typo, or a DB column name used instead of the property name.',
    howToFix: 'Use the entity property name, not the column name.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(
        /Property "([^"]+)" was not found in "([^"]+)"/,
      )
      return found
        ? {
            target: `${found[2]}.${found[1]}`,
            detail: `${found[2]} has no property "${found[1]}".`,
            howToFix: 'Use the entity property name, not the column name.',
          }
        : undefined
    },
  },
  {
    key: 'EntityColumnNotFound',
    hint: 'Unknown entity column',
    detail: 'A query names a column the entity does not map (see target).',
    howToFix: 'Check the property name.',
    category: 'bug',
    target: /No entity column "([^"]+)" was found/,
  },
  {
    key: 'EntityMetadataNotFoundError',
    hint: 'Entity not registered',
    detail:
      'TypeORM has no metadata for this entity: it is missing from the entities list or TypeOrmModule.forFeature.',
    howToFix:
      'Add the entity to the entities list and to TypeOrmModule.forFeature.',
    category: 'bug',
    target: /No metadata for "([^"]+)"/,
  },
  {
    key: 'RepositoryNotFoundError',
    hint: 'Repository not registered',
    detail:
      'getRepository() was asked for an entity the DataSource does not know (see target).',
    howToFix: 'Add the entity to entities / forFeature.',
    category: 'bug',
    target: /No repository for "([^"]+)"/,
  },
  {
    key: 'FindRelationsNotFoundError',
    hint: 'Unknown relation in find',
    detail:
      'find({ relations }) names a relation the entity does not have (see target).',
    howToFix: 'Check the property name and nesting.',
    category: 'bug',
    target: /Relation(?:s)? ([^\s]+) (?:was|were) not found/,
  },
  {
    key: 'QueryRunnerAlreadyReleasedError',
    hint: 'Query after transaction end',
    detail:
      'A query ran on a released query runner: usually a missing await inside the transaction, or work left running after commit.',
    howToFix:
      'Await every query inside the transaction, and finish all work before commit.',
    category: 'bug',
  },
  {
    key: 'QueryRunnerProviderAlreadyReleasedError',
    hint: 'Query runner provider released',
    detail:
      'transaction() or query() got a query runner, or an EntityManager bound to one, that was already released: usually a missing await in a transaction.',
    howToFix: 'Await every query inside the transaction before it ends.',
    category: 'bug',
  },
  {
    key: 'TransactionNotStartedError',
    hint: 'Transaction not started',
    detail: 'commit/rollback was called without startTransaction, or twice.',
    howToFix: 'Check the try/catch/finally of the query runner.',
    category: 'bug',
  },
  {
    key: 'TransactionAlreadyStartedError',
    hint: 'Transaction already started',
    detail: 'startTransaction was called twice on one query runner.',
    howToFix: 'Let nested work reuse the manager instead of starting again.',
    category: 'bug',
  },
  {
    key: 'ForbiddenTransactionModeOverrideError',
    hint: 'Nested transaction mode',
    detail:
      'A migration sets its own transaction option while migrations run with transaction "all" (one transaction for all).',
    howToFix:
      'Remove the transaction property from those migrations, or run migrations with transaction "each" or "none".',
    category: 'bug',
  },
  {
    key: 'PessimisticLockTransactionRequiredError',
    hint: 'Lock needs a transaction',
    detail:
      'A pessimistic setLock() (pessimistic_read, pessimistic_write and similar) was used outside a transaction.',
    howToFix: 'Run the query inside queryRunner/transaction().',
    category: 'bug',
  },
  {
    key: 'LockNotSupportedOnGivenDriverError',
    hint: 'Lock mode unsupported',
    detail: 'The lock mode is not supported by this database driver.',
    howToFix: 'Use a lock mode this driver supports, or remove setLock().',
    category: 'bug',
  },
  {
    key: 'OptimisticLockVersionMismatchError',
    hint: 'Row changed by someone else',
    detail:
      'The row version (@VersionColumn or @UpdateDateColumn) differs from the one passed to setLock("optimistic"): another request updated the row first.',
    howToFix: 'Reload and retry, or tell the user.',
    level: 'warn',
    category: 'data',
    target: /for entity "([^"]+)"/,
  },
  {
    key: 'OptimisticLockCanNotBeUsedError',
    hint: 'Optimistic lock unsupported',
    detail:
      'setLock("optimistic") was used with a method other than getOne(), such as getMany() or getRawOne().',
    howToFix:
      'Use getOne() with the optimistic lock, or remove setLock("optimistic").',
    category: 'bug',
  },
  {
    key: 'NoVersionOrUpdateDateColumnError',
    hint: 'Version column missing',
    detail:
      'Optimistic locking was used on an entity without a @VersionColumn or @UpdateDateColumn (see target).',
    howToFix: 'Add a @VersionColumn or @UpdateDateColumn to the entity.',
    category: 'bug',
    target: /Entity "([^"]+)"/,
  },
  {
    key: 'UpdateValuesMissingError',
    hint: 'Update with no values',
    detail:
      'An update ran with an empty set of values, often a DTO whose fields were all undefined.',
    howToFix: 'Skip the update when nothing changed.',
    category: 'bug',
  },
  {
    key: 'InsertValuesMissingError',
    hint: 'Insert with no values',
    detail:
      'An insert query ran without values: values() was not called, or got undefined.',
    howToFix: 'Guard empty input before calling insert().',
    category: 'bug',
  },
  {
    key: 'MissingDeleteDateColumnError',
    hint: 'No @DeleteDateColumn',
    detail:
      'softDelete/restore was used on an entity without a @DeleteDateColumn (see target).',
    howToFix: 'Add a @DeleteDateColumn to the entity.',
    category: 'bug',
    target: /Entity "([^"]+)"/,
  },
  {
    key: 'CannotExecuteNotConnectedError',
    hint: 'DB not connected yet',
    detail:
      'destroy(), synchronize() or a migration command ran on a DataSource that is not initialized, or was already destroyed.',
    howToFix:
      'Await DataSource.initialize() before these calls, and call destroy() only once at shutdown.',
    category: 'dependency',
  },
  {
    key: 'CannotGetEntityManagerNotConnectedError',
    hint: 'DB not connected yet',
    detail:
      'The EntityManager was requested before DataSource.initialize() finished.',
    howToFix:
      'Wait for DataSource.initialize() to finish before using the EntityManager.',
    category: 'dependency',
  },
  {
    key: 'CannotConnectAlreadyConnectedError',
    hint: 'DataSource already connected',
    detail: 'initialize() was called twice on the same DataSource.',
    howToFix: 'Call initialize() once, or check isInitialized first.',
    category: 'bug',
  },
  {
    key: 'AlreadyHasActiveConnectionError',
    hint: 'DataSource already registered',
    detail: 'A DataSource with this name already exists.',
    howToFix: 'Reuse the existing DataSource instead of creating another.',
    category: 'bug',
  },
  {
    key: 'ConnectionNotFoundError',
    hint: 'DataSource not found',
    detail: 'getConnection(name) found no DataSource with that name.',
    howToFix: 'Check the TypeOrmModule name option.',
    category: 'config',
  },
  {
    key: 'NoConnectionForRepositoryError',
    hint: 'Repository has no connection',
    detail:
      'A repository was requested before the connection to the database was established.',
    howToFix:
      'Get the repository only after DataSource.initialize() has finished, or inject it with forFeature.',
    category: 'bug',
  },
  {
    key: 'ConnectionIsNotSetError',
    hint: 'DB connection not set',
    detail:
      'The driver had no open connection pool to close: destroy() ran on a DataSource that never connected or was already closed.',
    howToFix:
      'Call destroy() only on an initialized DataSource, and only once.',
    category: 'bug',
  },
  {
    key: 'DriverPackageNotInstalledError',
    hint: 'DB driver not installed',
    detail:
      'The database driver package (oracledb, pg, mysql2) is not installed.',
    howToFix: 'Add the driver package to dependencies.',
    category: 'config',
  },
  {
    key: 'DriverOptionNotSetError',
    hint: 'DB option missing',
    detail:
      'A required DataSource option (host, database, url) is missing (see target).',
    howToFix: 'Check the DB env vars.',
    category: 'config',
    target: /Driver option \(([^)]+)\)/,
  },
  {
    key: 'MissingDriverError',
    hint: 'Unknown DB type',
    detail: 'The DataSource "type" is not a supported driver name.',
    howToFix: 'Check the DB config.',
    category: 'config',
  },
  {
    key: 'NoConnectionOptionError',
    hint: 'DataSource option missing',
    detail: 'A required DataSource option is missing (see target).',
    howToFix: 'Set the option in the DataSource config.',
    category: 'config',
    target: /Option "([^"]+)"/,
  },
  {
    key: 'CannotCreateEntityIdMapError',
    hint: 'Entity id not set',
    detail:
      'A single id value was given for an entity with a composite primary key, so TypeORM cannot map it to the primary columns.',
    howToFix: 'Pass the id as an object with a value for every primary column.',
    category: 'bug',
    target: /entity "([^"]+)"/,
  },
  {
    key: 'CannotDetermineEntityError',
    hint: 'Entity type unknown',
    detail: 'save/remove got a plain object TypeORM cannot map to an entity.',
    howToFix: 'Pass an entity instance or use the repository.',
    category: 'bug',
  },
  {
    key: 'MustBeEntityError',
    hint: 'Not an entity',
    detail:
      'save/remove got a value that is not an object (undefined, null, or a plain id).',
    howToFix: 'Pass an entity instance, or load the entities by id first.',
    category: 'bug',
  },
  {
    key: 'SubjectWithoutIdentifierError',
    hint: 'Entity has no id',
    detail:
      'An update/remove targets an entity without its primary key loaded (see target).',
    howToFix: 'Load the entity with its primary key first.',
    category: 'bug',
    target: /entity (?:of type )?"?([^"\s]+)"?/,
  },
  {
    key: 'SubjectRemovedAndUpdatedError',
    hint: 'Entity removed and updated',
    detail: 'The same entity is both removed and updated in one save.',
    howToFix: 'Check the cascades.',
    category: 'bug',
  },
  {
    key: 'PersistedEntityNotFoundError',
    hint: 'Saved entity vanished',
    detail:
      'TypeORM internal error: a persisted entity was missing from the list of entities prepared for the save.',
    howToFix:
      'Upgrade TypeORM, and check the save call that raised it for the same entity passed twice.',
    category: 'data',
  },
  {
    key: 'ColumnTypeUndefinedError',
    hint: 'Column type unknown',
    detail:
      'A @Column has no type and TypeScript could not reflect it (see target).',
    howToFix:
      'Set the type explicitly, or enable emitDecoratorMetadata and import reflect-metadata before any entity.',
    category: 'bug',
    target: /Column type for ([^\s]+) is not defined/,
  },
  {
    key: 'DataTypeNotSupportedError',
    hint: 'Column type unsupported',
    detail:
      'The column data type is not supported by this driver (see target).',
    howToFix: 'Use a driver-specific type.',
    category: 'bug',
    target: /Data type "([^"]+)" in "([^"]+)"/,
  },
  {
    key: 'MissingPrimaryColumnError',
    hint: 'Entity has no primary key',
    detail:
      'The entity has no @PrimaryColumn/@PrimaryGeneratedColumn (see target).',
    howToFix: 'Add a @PrimaryColumn or @PrimaryGeneratedColumn to the entity.',
    category: 'bug',
    target: /Entity "([^"]+)"/,
  },
  {
    key: 'PrimaryColumnCannotBeNullableError',
    hint: 'Primary column nullable',
    detail: 'A primary column is marked nullable (see target).',
    howToFix: 'Remove nullable.',
    category: 'bug',
    target: /Primary column ([^\s]+)/,
  },
  {
    key: 'MissingJoinColumnError',
    hint: '@JoinColumn missing',
    detail:
      'A one-to-one relation has no @JoinColumn on either side (see target).',
    howToFix: 'Add @JoinColumn to the owning side of the relation.',
    category: 'bug',
    target: /Relation ([^\s]+)/,
  },
  {
    key: 'MissingJoinTableError',
    hint: '@JoinTable missing',
    detail:
      'A many-to-many relation has no @JoinTable on either side (see target).',
    howToFix: 'Add @JoinTable to the owning side of the relation.',
    category: 'bug',
    target: /Relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinColumnIsNotAllowedError',
    hint: '@JoinColumn not allowed',
    detail:
      '@JoinColumn is only valid on many-to-one and one-to-one relations (see target).',
    howToFix: 'Remove @JoinColumn from this relation.',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinTableIsNotAllowedError',
    hint: '@JoinTable not allowed',
    detail: '@JoinTable is only valid on many-to-many relations (see target).',
    howToFix: 'Remove @JoinTable from this relation.',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinColumnOnlyOnOneSideAllowedError',
    hint: '@JoinColumn on both sides',
    detail: 'Only one side of a one-to-one may have @JoinColumn (see target).',
    howToFix: 'Keep @JoinColumn on the owning side only.',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinTableOnlyOnOneSideAllowedError',
    hint: '@JoinTable on both sides',
    detail: 'Only one side of a many-to-many may have @JoinTable (see target).',
    howToFix: 'Keep @JoinTable on the owning side only.',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'CircularRelationsError',
    hint: 'Circular non-nullable FKs',
    detail:
      'Entities reference each other with non-nullable foreign keys, so neither can be inserted first.',
    howToFix: 'Make one side nullable.',
    category: 'bug',
  },
  {
    key: 'InitializedRelationError',
    hint: 'Relation initialized in class',
    detail:
      'A one-to-many or many-to-many relation property is initialized with = [] in the class (see target), which TypeORM forbids.',
    howToFix: 'Remove the initializer.',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'TreeRepositoryNotSupportedError',
    hint: 'Tree repository unsupported',
    detail: 'getTreeRepository is not supported by this driver.',
    howToFix: 'Use a regular repository and query the parent column directly.',
    category: 'bug',
  },
  {
    key: 'RepositoryNotTreeError',
    hint: 'Entity is not a tree',
    detail:
      'getTreeRepository was used on an entity without @Tree() (see target).',
    howToFix: 'Add @Tree() to the entity, or use getRepository instead.',
    category: 'bug',
    target: /"([^"]+)"/,
  },
  {
    key: 'CannotAttachTreeChildrenEntityError',
    hint: 'Tree child without parent',
    detail:
      'A closure-table tree entity could not be attached to its parent because the parent is not saved yet.',
    howToFix: 'Save the parent entity before saving its children.',
    category: 'bug',
  },
  {
    key: 'CustomRepositoryNotFoundError',
    hint: 'Custom repository not found',
    detail:
      'getCustomRepository got a class without @EntityRepository (see target).',
    howToFix:
      'Add @EntityRepository to the class, or use a repository from the DataSource.',
    category: 'bug',
    target: /Custom repository ([^\s]+)/,
  },
  {
    key: 'CustomRepositoryDoesNotHaveEntityError',
    hint: 'Custom repo has no entity',
    detail: '@EntityRepository() was used without an entity argument.',
    howToFix: 'Pass the entity class to @EntityRepository().',
    category: 'bug',
  },
  {
    key: 'CustomRepositoryCannotInheritRepositoryError',
    hint: 'Custom repository inheritance',
    detail: 'A custom repository extends Repository without a target entity.',
    howToFix:
      'Pass the target entity to @EntityRepository(), or use Repository.extend().',
    category: 'bug',
  },
  {
    key: 'MetadataAlreadyExistsError',
    hint: 'Duplicate entity metadata',
    detail:
      'Metadata was registered twice for one class, often a stale compiled copy of a moved or renamed entity left in the build output.',
    howToFix: 'Clean the build output directory, and load each entity once.',
    category: 'bug',
    target: /metadata (?:with name )?"?([^"\s]+)"?/,
  },
  {
    key: 'MetadataWithSuchNameAlreadyExistsError',
    hint: 'Duplicate entity name',
    detail: 'Two entities register the same name (see target).',
    howToFix: 'Rename one or fix the entities glob.',
    category: 'bug',
    target: /with name "([^"]+)"/,
  },
  {
    key: 'ReturningStatementNotSupportedError',
    hint: 'RETURNING unsupported',
    detail: 'The driver does not support RETURNING/OUTPUT in this statement.',
    howToFix: 'Fetch the row after the write.',
    category: 'bug',
  },
  {
    key: 'LimitOnUpdateNotSupportedError',
    hint: 'LIMIT on UPDATE unsupported',
    detail: 'This database does not allow LIMIT in UPDATE.',
    howToFix: 'Select the ids first, then update by id.',
    category: 'bug',
  },
  {
    key: 'OffsetWithoutLimitNotSupportedError',
    hint: 'OFFSET without LIMIT',
    detail: 'This database needs LIMIT when OFFSET is used.',
    howToFix: 'Add a take() to the query.',
    category: 'bug',
  },
  {
    key: 'CannotReflectMethodParameterTypeError',
    hint: 'Cannot reflect parameter type',
    detail: 'Decorator metadata is missing for a method parameter.',
    howToFix:
      'Enable emitDecoratorMetadata, and import reflect-metadata at the top of the entry file.',
    category: 'bug',
  },
  {
    key: 'NoNeedToReleaseEntityManagerError',
    hint: 'Release on non-runner manager',
    detail:
      'release() was called on an EntityManager that was not created with a query runner.',
    howToFix: 'Call release() only on a manager created from a query runner.',
    category: 'bug',
  },
  {
    key: 'QueryFailedError',
    hint: 'Database query failed',
    detail: 'The database rejected the query and the driver gave no code.',
    howToFix:
      'Read error.message (the driver text) and the db span for the statement.',
    category: 'dependency',
  },
  {
    key: 'TYPEORM_EMPTY_CRITERIA',
    messageMatch: /Empty criteria\(s\) are not allowed/,
    hint: 'Delete/update with no criteria',
    detail: 'delete/update was called with an empty id list or object.',
    howToFix: 'Guard empty input before calling delete/update.',
    category: 'bug',
    explain: ({ message }) => {
      const method = message.match(/for the (\w+) method/)?.[1]
      return method
        ? {
            target: method,
            detail: `${method}() received empty criteria.`,
            howToFix: 'Return early when the id list is empty.',
          }
        : undefined
    },
  },
  {
    key: 'TYPEORM_MANY_TO_MANY_QUERY',
    messageMatch: /Cannot query across many-to-many for property/,
    hint: 'Where on many-to-many',
    detail:
      'A where object passed to QueryBuilder.where(), update() or delete() filters by a many-to-many relation.',
    howToFix:
      'Use find() with a nested where, or a QueryBuilder that joins the relation.',
    category: 'bug',
    target: /for property (\S+)/,
  },
  {
    key: 'TYPEORM_ONE_TO_MANY_QUERY',
    messageMatch: /Cannot query across one-to-many for property/,
    hint: 'Where on one-to-many',
    detail:
      'A where object passed to QueryBuilder.where(), update() or delete() filters by a one-to-many relation.',
    howToFix:
      'Use find() with a nested where, or a QueryBuilder that joins the relation.',
    category: 'bug',
    target: /for property (\S+)/,
  },
  {
    key: 'TYPEORM_ALIAS_NOT_FOUND',
    messageMatch: /alias was not found\. Maybe you forgot to join it\?/,
    hint: 'Query alias not joined',
    detail:
      'A QueryBuilder where/select references an alias that was never joined (see target).',
    howToFix: 'Add a leftJoin(...) for that alias.',
    category: 'bug',
    target: /^"([^"]+)" alias was not found/,
  },
  {
    key: 'TYPEORM_RELATION_ALIAS_NOT_FOUND',
    messageMatch:
      /^Cannot find alias for relation|^Relation with property path .* in entity was not found/,
    hint: 'Unknown relation in query',
    detail:
      'A join names a relation the entity does not have, or a where object filters on a relation the QueryBuilder did not join.',
    howToFix:
      'Check the relation property path, and join the relation before filtering on it.',
    category: 'bug',
    target: /relation "?([^"\s]+)"?|property path ([^\s]+)/,
  },
  {
    key: 'TYPEORM_DUPLICATE_ALIAS',
    messageMatch: /^"[^"]+" alias already exists|already has an alias/,
    hint: 'Duplicate query alias',
    detail: 'The same alias was joined twice in one QueryBuilder.',
    howToFix: 'Use a different alias.',
    category: 'bug',
  },
  {
    key: 'TYPEORM_ENTITY_MULTIPLE_PRIMARY',
    messageMatch: /has multiple primary columns/,
    hint: 'Composite key in findBy id',
    detail:
      'An entity with a composite primary key gives its primary columns different constraint names.',
    howToFix:
      'Use the same primaryKeyConstraintName on every primary column of the entity.',
    category: 'bug',
  },
  {
    key: 'TYPEORM_INVALID_WHERE',
    messageMatch:
      /^(Cannot find alias|Property path .* does not exist|Wrong value .* in where)/,
    hint: 'Invalid where clause',
    detail:
      'The where object references a property or value TypeORM cannot map.',
    howToFix: 'Check the property names and value types in the where object.',
    category: 'bug',
  },
]
