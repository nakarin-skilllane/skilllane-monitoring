import type { ErrorPattern } from './types'

// TypeORM 0.3 errors (src/error/*), matched by class name (generic adapter)
// or message. school-core-api: findOneOrFail ×122, transactions/query runners ×318.
export const typeormPatterns: ErrorPattern[] = [
  {
    key: 'EntityNotFoundError',
    hint: 'Record not found',
    hintDetail:
      'findOneOrFail found no row. Usually a wrong or deleted id from the client; the filter answers 404.',
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
        fix: `No ${entity} found${by}. Check the id the client sent, or whether the row was deleted.`,
      }
    },
  },
  {
    key: 'EntityPropertyNotFoundError',
    hint: 'Unknown entity property',
    hintDetail:
      'A where/order/select names a property the entity does not have: a typo, or a DB column name used instead of the property name.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(
        /Property "([^"]+)" was not found in "([^"]+)"/,
      )
      return found
        ? {
            target: `${found[2]}.${found[1]}`,
            fix: `${found[2]} has no property "${found[1]}". Use the entity property name, not the column name.`,
          }
        : undefined
    },
  },
  {
    key: 'EntityColumnNotFound',
    hint: 'Unknown entity column',
    hintDetail:
      'A query names a column the entity does not map (see target). Check the property name.',
    category: 'bug',
    target: /No entity column "([^"]+)" was found/,
  },
  {
    key: 'EntityMetadataNotFoundError',
    hint: 'Entity not registered',
    hintDetail:
      'TypeORM has no metadata for this entity: it is missing from the entities list or TypeOrmModule.forFeature.',
    category: 'bug',
    target: /No metadata for "([^"]+)"/,
  },
  {
    key: 'RepositoryNotFoundError',
    hint: 'Repository not registered',
    hintDetail:
      'getRepository() was asked for an entity the DataSource does not know (see target). Add it to entities / forFeature.',
    category: 'bug',
    target: /No repository for "([^"]+)"/,
  },
  {
    key: 'FindRelationsNotFoundError',
    hint: 'Unknown relation in find',
    hintDetail:
      'find({ relations }) names a relation the entity does not have (see target). Check the property name and nesting.',
    category: 'bug',
    target: /Relation(?:s)? ([^\s]+) (?:was|were) not found/,
  },
  {
    key: 'QueryRunnerAlreadyReleasedError',
    hint: 'Query after transaction end',
    hintDetail:
      'A query ran on a released query runner: usually a missing await inside the transaction, or work left running after commit.',
    category: 'bug',
  },
  {
    key: 'QueryRunnerProviderAlreadyReleasedError',
    hint: 'Query runner provider released',
    hintDetail:
      'A query ran on a query runner provider after it was released. Same cause as a missing await in a transaction.',
    category: 'bug',
  },
  {
    key: 'TransactionNotStartedError',
    hint: 'Transaction not started',
    hintDetail:
      'commit/rollback was called without startTransaction, or twice. Check the try/catch/finally of the query runner.',
    category: 'bug',
  },
  {
    key: 'TransactionAlreadyStartedError',
    hint: 'Transaction already started',
    hintDetail:
      'startTransaction was called twice on one query runner. Nested work should reuse the manager, not start again.',
    category: 'bug',
  },
  {
    key: 'ForbiddenTransactionModeOverrideError',
    hint: 'Nested transaction mode',
    hintDetail:
      'A nested @Transaction tried to change the isolation/propagation of the outer one.',
    category: 'bug',
  },
  {
    key: 'PessimisticLockTransactionRequiredError',
    hint: 'Lock needs a transaction',
    hintDetail:
      'setLock("pessimistic_write") was used outside a transaction. Run the query inside queryRunner/transaction().',
    category: 'bug',
  },
  {
    key: 'LockNotSupportedOnGivenDriverError',
    hint: 'Lock mode unsupported',
    hintDetail: 'The lock mode is not supported by this database driver.',
    category: 'bug',
  },
  {
    key: 'OptimisticLockVersionMismatchError',
    hint: 'Row changed by someone else',
    hintDetail:
      'The @VersionColumn in the DB differs from the one loaded: another request updated the row first. Reload and retry, or tell the user.',
    level: 'warn',
    category: 'data',
    target: /for entity "([^"]+)"/,
  },
  {
    key: 'OptimisticLockCanNotBeUsedError',
    hint: 'Optimistic lock unsupported',
    hintDetail:
      'setLock("optimistic") needs a @VersionColumn or @UpdateDateColumn on the entity.',
    category: 'bug',
  },
  {
    key: 'NoVersionOrUpdateDateColumnError',
    hint: 'Version column missing',
    hintDetail:
      'Optimistic locking needs a @VersionColumn or @UpdateDateColumn on the entity (see target).',
    category: 'bug',
    target: /Entity "([^"]+)"/,
  },
  {
    key: 'UpdateValuesMissingError',
    hint: 'Update with no values',
    hintDetail:
      'An update ran with an empty set of values, often a DTO whose fields were all undefined. Skip the update when nothing changed.',
    category: 'bug',
  },
  {
    key: 'InsertValuesMissingError',
    hint: 'Insert with no values',
    hintDetail:
      'insert() was called without values (an empty array or undefined). Guard empty input.',
    category: 'bug',
  },
  {
    key: 'MissingDeleteDateColumnError',
    hint: 'No @DeleteDateColumn',
    hintDetail:
      'softDelete/restore needs a @DeleteDateColumn on the entity (see target).',
    category: 'bug',
    target: /Entity "([^"]+)"/,
  },
  {
    key: 'CannotExecuteNotConnectedError',
    hint: 'DB not connected yet',
    hintDetail:
      'A query ran before the DataSource connected, or after it closed during shutdown.',
    category: 'dependency',
  },
  {
    key: 'CannotGetEntityManagerNotConnectedError',
    hint: 'DB not connected yet',
    hintDetail:
      'The EntityManager was requested before DataSource.initialize() finished.',
    category: 'dependency',
  },
  {
    key: 'CannotConnectAlreadyConnectedError',
    hint: 'DataSource already connected',
    hintDetail: 'initialize() was called twice on the same DataSource.',
    category: 'bug',
  },
  {
    key: 'AlreadyHasActiveConnectionError',
    hint: 'DataSource already registered',
    hintDetail:
      'A DataSource with this name already exists. Reuse it instead of creating another.',
    category: 'bug',
  },
  {
    key: 'ConnectionNotFoundError',
    hint: 'DataSource not found',
    hintDetail:
      'getConnection(name) found no DataSource with that name. Check the TypeOrmModule name option.',
    category: 'config',
  },
  {
    key: 'NoConnectionForRepositoryError',
    hint: 'Repository has no connection',
    hintDetail: 'The repository was created without a DataSource.',
    category: 'bug',
  },
  {
    key: 'ConnectionIsNotSetError',
    hint: 'DB connection not set',
    hintDetail:
      'The driver has no connection object: the DataSource was not initialized.',
    category: 'bug',
  },
  {
    key: 'DriverPackageNotInstalledError',
    hint: 'DB driver not installed',
    hintDetail:
      'The database driver package (oracledb, pg, mysql2) is not installed. Add it to dependencies.',
    category: 'config',
  },
  {
    key: 'DriverOptionNotSetError',
    hint: 'DB option missing',
    hintDetail:
      'A required DataSource option (host, database, url) is missing (see target). Check the DB env vars.',
    category: 'config',
    target: /Driver option \(([^)]+)\)/,
  },
  {
    key: 'MissingDriverError',
    hint: 'Unknown DB type',
    hintDetail:
      'The DataSource "type" is not a supported driver name. Check the DB config.',
    category: 'config',
  },
  {
    key: 'NoConnectionOptionError',
    hint: 'DataSource option missing',
    hintDetail: 'A required DataSource option is missing (see target).',
    category: 'config',
    target: /Option "([^"]+)"/,
  },
  {
    key: 'CannotCreateEntityIdMapError',
    hint: 'Entity id not set',
    hintDetail:
      'An entity (see target) has no value for its primary column, so TypeORM cannot build its id.',
    category: 'bug',
    target: /entity "([^"]+)"/,
  },
  {
    key: 'CannotDetermineEntityError',
    hint: 'Entity type unknown',
    hintDetail:
      'save/remove got a plain object TypeORM cannot map to an entity. Pass an entity instance or use the repository.',
    category: 'bug',
  },
  {
    key: 'MustBeEntityError',
    hint: 'Not an entity',
    hintDetail:
      'save/remove got something that is not an entity (undefined, a DTO, an array of ids).',
    category: 'bug',
  },
  {
    key: 'SubjectWithoutIdentifierError',
    hint: 'Entity has no id',
    hintDetail:
      'An update/remove targets an entity without its primary key loaded (see target). Load it first.',
    category: 'bug',
    target: /entity (?:of type )?"?([^"\s]+)"?/,
  },
  {
    key: 'SubjectRemovedAndUpdatedError',
    hint: 'Entity removed and updated',
    hintDetail:
      'The same entity is both removed and updated in one save. Check the cascades.',
    category: 'bug',
  },
  {
    key: 'PersistedEntityNotFoundError',
    hint: 'Saved entity vanished',
    hintDetail:
      'TypeORM could not reload an entity it just saved. A trigger or a concurrent delete removed it.',
    category: 'data',
  },
  {
    key: 'ColumnTypeUndefinedError',
    hint: 'Column type unknown',
    hintDetail:
      'A @Column has no type and TypeScript could not reflect it (see target). Set the type explicitly, or enable emitDecoratorMetadata.',
    category: 'bug',
    target: /Column type for ([^\s]+) is not defined/,
  },
  {
    key: 'DataTypeNotSupportedError',
    hint: 'Column type unsupported',
    hintDetail:
      'The column data type is not supported by this driver (see target). Use a driver-specific type.',
    category: 'bug',
    target: /Data type "([^"]+)" in "([^"]+)"/,
  },
  {
    key: 'MissingPrimaryColumnError',
    hint: 'Entity has no primary key',
    hintDetail:
      'The entity has no @PrimaryColumn/@PrimaryGeneratedColumn (see target).',
    category: 'bug',
    target: /Entity "([^"]+)"/,
  },
  {
    key: 'PrimaryColumnCannotBeNullableError',
    hint: 'Primary column nullable',
    hintDetail:
      'A primary column is marked nullable (see target). Remove nullable.',
    category: 'bug',
    target: /Primary column ([^\s]+)/,
  },
  {
    key: 'MissingJoinColumnError',
    hint: '@JoinColumn missing',
    hintDetail:
      'A one-to-one relation has no @JoinColumn on either side (see target).',
    category: 'bug',
    target: /Relation ([^\s]+)/,
  },
  {
    key: 'MissingJoinTableError',
    hint: '@JoinTable missing',
    hintDetail:
      'A many-to-many relation has no @JoinTable on either side (see target).',
    category: 'bug',
    target: /Relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinColumnIsNotAllowedError',
    hint: '@JoinColumn not allowed',
    hintDetail:
      '@JoinColumn is only valid on many-to-one and one-to-one relations (see target).',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinTableIsNotAllowedError',
    hint: '@JoinTable not allowed',
    hintDetail:
      '@JoinTable is only valid on many-to-many relations (see target).',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinColumnOnlyOnOneSideAllowedError',
    hint: '@JoinColumn on both sides',
    hintDetail:
      'Only one side of a one-to-one may have @JoinColumn (see target).',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'UsingJoinTableOnlyOnOneSideAllowedError',
    hint: '@JoinTable on both sides',
    hintDetail:
      'Only one side of a many-to-many may have @JoinTable (see target).',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'CircularRelationsError',
    hint: 'Circular non-nullable FKs',
    hintDetail:
      'Entities reference each other with non-nullable foreign keys, so neither can be inserted first. Make one side nullable.',
    category: 'bug',
  },
  {
    key: 'InitializedRelationError',
    hint: 'Relation initialized in class',
    hintDetail:
      'A relation property has a default value (= []) which breaks lazy loading (see target). Remove the initializer.',
    category: 'bug',
    target: /relation ([^\s]+)/,
  },
  {
    key: 'TreeRepositoryNotSupportedError',
    hint: 'Tree repository unsupported',
    hintDetail: 'getTreeRepository is not supported by this driver.',
    category: 'bug',
  },
  {
    key: 'RepositoryNotTreeError',
    hint: 'Entity is not a tree',
    hintDetail:
      'getTreeRepository was used on an entity without @Tree() (see target).',
    category: 'bug',
    target: /"([^"]+)"/,
  },
  {
    key: 'CannotAttachTreeChildrenEntityError',
    hint: 'Tree child without parent',
    hintDetail: 'A tree entity was saved with children but no parent link.',
    category: 'bug',
  },
  {
    key: 'CustomRepositoryNotFoundError',
    hint: 'Custom repository not found',
    hintDetail:
      'getCustomRepository got a class without @EntityRepository (see target).',
    category: 'bug',
    target: /Custom repository ([^\s]+)/,
  },
  {
    key: 'CustomRepositoryDoesNotHaveEntityError',
    hint: 'Custom repo has no entity',
    hintDetail: '@EntityRepository() was used without an entity argument.',
    category: 'bug',
  },
  {
    key: 'CustomRepositoryCannotInheritRepositoryError',
    hint: 'Custom repository inheritance',
    hintDetail:
      'A custom repository extends Repository without a target entity.',
    category: 'bug',
  },
  {
    key: 'MetadataAlreadyExistsError',
    hint: 'Duplicate entity metadata',
    hintDetail:
      'Two entities share the same name or table (see target), often the same file loaded twice via glob + import.',
    category: 'bug',
    target: /metadata (?:with name )?"?([^"\s]+)"?/,
  },
  {
    key: 'MetadataWithSuchNameAlreadyExistsError',
    hint: 'Duplicate entity name',
    hintDetail:
      'Two entities register the same name (see target). Rename one or fix the entities glob.',
    category: 'bug',
    target: /with name "([^"]+)"/,
  },
  {
    key: 'ReturningStatementNotSupportedError',
    hint: 'RETURNING unsupported',
    hintDetail:
      'The driver does not support RETURNING/OUTPUT in this statement. Fetch the row after the write.',
    category: 'bug',
  },
  {
    key: 'LimitOnUpdateNotSupportedError',
    hint: 'LIMIT on UPDATE unsupported',
    hintDetail:
      'This database does not allow LIMIT in UPDATE. Select the ids first, then update by id.',
    category: 'bug',
  },
  {
    key: 'OffsetWithoutLimitNotSupportedError',
    hint: 'OFFSET without LIMIT',
    hintDetail:
      'This database needs LIMIT when OFFSET is used. Add a take() to the query.',
    category: 'bug',
  },
  {
    key: 'CannotReflectMethodParameterTypeError',
    hint: 'Cannot reflect parameter type',
    hintDetail:
      'Decorator metadata is missing for a method parameter. Enable emitDecoratorMetadata.',
    category: 'bug',
  },
  {
    key: 'NoNeedToReleaseEntityManagerError',
    hint: 'Release on non-runner manager',
    hintDetail:
      'release() was called on an EntityManager that was not created with a query runner.',
    category: 'bug',
  },
  {
    key: 'QueryFailedError',
    hint: 'Database query failed',
    hintDetail:
      'The database rejected the query and the driver gave no code. Read error.message (the driver text) and the db span for the statement.',
    category: 'dependency',
  },
  {
    key: 'TYPEORM_EMPTY_CRITERIA',
    messageMatch: /Empty criteria\(s\) are not allowed/,
    hint: 'Delete/update with no criteria',
    hintDetail:
      'delete/update was called with an empty id list or object. Guard empty input before calling it.',
    category: 'bug',
    explain: ({ message }) => {
      const method = message.match(/for the (\w+) method/)?.[1]
      return method
        ? {
            target: method,
            fix: `${method}() received empty criteria. Return early when the id list is empty.`,
          }
        : undefined
    },
  },
  {
    key: 'TYPEORM_MANY_TO_MANY_QUERY',
    messageMatch: /Cannot query across many-to-many for property/,
    hint: 'Where on many-to-many',
    hintDetail:
      'find() cannot filter by a many-to-many property. Use a QueryBuilder with a join.',
    category: 'bug',
    target: /for property (\S+)/,
  },
  {
    key: 'TYPEORM_ONE_TO_MANY_QUERY',
    messageMatch: /Cannot query across one-to-many for property/,
    hint: 'Where on one-to-many',
    hintDetail:
      'find() cannot filter by a one-to-many property. Use a QueryBuilder with a join.',
    category: 'bug',
    target: /for property (\S+)/,
  },
  {
    key: 'TYPEORM_ALIAS_NOT_FOUND',
    messageMatch: /alias was not found\. Maybe you forgot to join it\?/,
    hint: 'Query alias not joined',
    hintDetail:
      'A QueryBuilder where/select references an alias that was never joined (see target). Add leftJoin(...) for it.',
    category: 'bug',
    target: /^"([^"]+)" alias was not found/,
  },
  {
    key: 'TYPEORM_RELATION_ALIAS_NOT_FOUND',
    messageMatch:
      /^Cannot find alias for relation|^Relation with property path .* in entity was not found/,
    hint: 'Unknown relation in query',
    hintDetail:
      'A join names a relation the entity does not have. Check the property path.',
    category: 'bug',
    target: /relation "?([^"\s]+)"?|property path ([^\s]+)/,
  },
  {
    key: 'TYPEORM_DUPLICATE_ALIAS',
    messageMatch: /^"[^"]+" alias already exists|already has an alias/,
    hint: 'Duplicate query alias',
    hintDetail:
      'The same alias was joined twice in one QueryBuilder. Use a different alias.',
    category: 'bug',
  },
  {
    key: 'TYPEORM_ENTITY_MULTIPLE_PRIMARY',
    messageMatch: /has multiple primary columns/,
    hint: 'Composite key in findBy id',
    hintDetail:
      'findOne(id) cannot be used on an entity with a composite key. Pass a where object.',
    category: 'bug',
  },
  {
    key: 'TYPEORM_INVALID_WHERE',
    messageMatch:
      /^(Cannot find alias|Property path .* does not exist|Wrong value .* in where)/,
    hint: 'Invalid where clause',
    hintDetail:
      'The where object references a property or value TypeORM cannot map.',
    category: 'bug',
  },
]
