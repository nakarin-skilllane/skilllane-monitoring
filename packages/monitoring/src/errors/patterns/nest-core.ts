import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/nestjs/nest/blob/master/packages/core/errors/messages.ts (DI, module, middleware and route messages)
// - https://github.com/nestjs/nest/tree/master/packages/core/errors/exceptions (where each message is raised)
// - https://github.com/nestjs/graphql/blob/master/packages/graphql/lib/schema-builder/errors/undefined-type.error.ts (GraphQL undefined type)
// - https://github.com/nestjs/swagger/blob/master/lib/services/schema-object-factory.ts (Swagger circular type)

// NestJS dependency injection and module errors (packages/core/errors/messages.ts).
// Most happen at boot; a few (ModuleRef.get, request-scoped) at runtime.
export const nestCorePatterns: ErrorPattern[] = [
  {
    key: 'NEST_UNRESOLVED_DEPENDENCY',
    messageMatch: /^Nest can't resolve dependencies of the /,
    hint: 'Nest cannot inject dependency',
    detail:
      'A provider needs something the module does not provide or import (see target).',
    howToFix:
      'Import the module that exports it, or add it to providers; if it is undefined at runtime, use a normal import instead of import type.',
    category: 'bug',
    explain: ({ message }) => {
      const consumer = message.match(/dependencies of the (\S+?) \(/)?.[1]
      const argument = message.match(
        /argument (\S+?) at index \[(\d+)\]|the "([^"]+)" property/,
      )
      const context = message.match(
        /available in the (\S+?) (?:module|context)/,
      )?.[1]
      const dependency = argument?.[1] ?? argument?.[3]
      if (!consumer) return undefined
      const where =
        argument?.[2] !== undefined
          ? ` (constructor argument ${argument[2]})`
          : ''
      return {
        target: dependency ? `${consumer} ← ${dependency}` : consumer,
        detail: `${consumer} needs ${dependency ?? 'a provider'}${where} that ${context ?? 'its module'} does not have.`,
        howToFix: `Import the module exporting ${dependency ?? 'it'} into ${context ?? 'its module'}, or register it in providers.`,
      }
    },
  },
  {
    key: 'NEST_CIRCULAR_MODULE',
    messageMatch:
      /^Nest cannot create the module instance\. Often, this is because of a circular dependency/,
    hint: 'Circular module import',
    detail: 'Two modules import each other, so one is undefined at load time.',
    howToFix:
      'Use forwardRef(() => Module) on both sides, or move the shared provider to a third module.',
    category: 'bug',
  },
  {
    key: 'NEST_INVALID_MODULE',
    messageMatch: /^Nest cannot create the \S+ instance\./,
    hint: 'Invalid module import',
    detail:
      'A module imports/providers/controllers/exports entry is undefined or invalid: usually a circular file import (barrel index.ts), or a provider without a valid use* property.',
    howToFix:
      'Import the class directly instead of through index.ts or use forwardRef, and give each custom provider a defined useClass/useValue/useFactory/useExisting.',
    category: 'bug',
    target: /^Nest cannot create the (\S+) instance/,
  },
  {
    key: 'NEST_UNKNOWN_EXPORT',
    messageMatch:
      /^Nest cannot export a provider\/module that is not a part of the currently processed module/,
    hint: 'Export not in module',
    detail:
      'A module exports something it neither provides nor imports (see target).',
    howToFix: 'Add it to providers/imports or remove the export.',
    category: 'bug',
    target: /\(([^)]+)\)\. Please verify whether the exported (\S+)/,
  },
  {
    key: 'NEST_UNKNOWN_ELEMENT',
    messageMatch: /^Nest could not find \S+ element/,
    hint: 'Provider not in context',
    detail:
      'moduleRef.get()/app.get() asked for a provider this module does not know (see target).',
    howToFix: 'Pass { strict: false } or resolve it from the right module.',
    category: 'bug',
    target: /^Nest could not find (\S+) element/,
  },
  {
    key: 'NEST_NOT_CONSTRUCTABLE',
    messageMatch: /^ModuleRef cannot instantiate class/,
    hint: 'Provider not a class',
    detail:
      'moduleRef.create() got something that is not a constructor (an instance, a token).',
    howToFix:
      'Pass the provider class to moduleRef.create(), or use moduleRef.get() for an existing instance.',
    category: 'bug',
  },
  {
    key: 'NEST_REQUEST_SCOPED_CREATE',
    messageMatch:
      /depends on a request-scoped provider, so it can't be created without a context id/,
    hint: 'Request-scoped provider needed',
    detail:
      'moduleRef.create() was called without a context id for a class that depends on a request-scoped provider.',
    howToFix:
      'Call moduleRef.create(type, contextId) with a context id, or remove the request-scoped dependency.',
    category: 'bug',
    target: /^(\S+) depends on a request-scoped provider/,
  },
  {
    key: 'NEST_REQUEST_SCOPED_ENHANCER',
    messageMatch: /provider \(\S+\) depends on a request-scoped provider/,
    hint: 'Request-scoped global enhancer',
    detail:
      'A global enhancer provider (APP_GUARD, APP_INTERCEPTOR...) depends on a request-scoped provider, so it would run with undefined dependencies or never run.',
    howToFix:
      'Make it request-scoped: @Injectable({ scope: Scope.REQUEST }) on the class, or scope: Scope.REQUEST on the provider.',
    category: 'bug',
  },
  {
    key: 'NEST_DUPLICATE_ROUTE',
    messageMatch: /^Duplicate route: /,
    hint: 'Duplicate route',
    detail: 'Two handlers register the same method and path (see target).',
    howToFix: 'Rename one route.',
    category: 'bug',
    target: /^Duplicate route: (\S+ \S+)/,
  },
  {
    key: 'NEST_INVALID_CONTROLLER',
    messageMatch: /^An invalid controller has been detected/,
    hint: 'Controller missing decorator',
    detail:
      'A class in the controllers array has no @Controller() decorator (see target).',
    howToFix:
      'Add @Controller() to the class, or remove it from the controllers array.',
    category: 'bug',
    target: /"([^"]+)" does not have the @Controller/,
  },
  {
    key: 'NEST_INVALID_MIDDLEWARE',
    messageMatch: /^The middleware doesn't provide the 'use' method/,
    hint: 'Middleware has no use()',
    detail:
      'A class in configure(consumer) does not implement NestMiddleware.use().',
    howToFix: 'Implement use(req, res, next) on the middleware class.',
    category: 'bug',
  },
  {
    key: 'NEST_INVALID_MIDDLEWARE_CONFIG',
    messageMatch: /^An invalid middleware configuration has been passed/,
    hint: 'Invalid middleware config',
    detail: 'consumer.apply(...).forRoutes(...) got an invalid route or class.',
    howToFix:
      'Check the classes passed to apply() and the routes passed to forRoutes().',
    category: 'bug',
  },
  {
    key: 'NEST_INVALID_EXCEPTION_FILTER',
    messageMatch: /^Invalid exception filters/,
    hint: 'Invalid @UseFilters()',
    detail:
      'The exceptions handler got filters that are not an array: filter metadata not set through @UseFilters() or useGlobalFilters().',
    howToFix:
      'Register filters only with @UseFilters() or app.useGlobalFilters(), passing filter classes or instances.',
    category: 'bug',
  },
  {
    key: 'NEST_MICROSERVICES_MISSING',
    messageMatch: /^Unable to load @nestjs\/microservices package/,
    hint: '@nestjs/microservices missing',
    detail:
      'A microservice transport is used but @nestjs/microservices is not installed.',
    howToFix: 'Add the @nestjs/microservices dependency.',
    category: 'config',
  },
  {
    key: 'NEST_CLASS_IN_IMPORTS',
    messageMatch:
      /is decorated with @(Controller|Injectable|Catch)\(\) and cannot appear in the "imports" array/,
    hint: 'Class in module imports',
    detail: 'A controller/provider/filter was listed in imports.',
    howToFix: 'Move it to controllers or providers.',
    category: 'bug',
  },
  {
    key: 'NEST_UNHANDLED_RUNTIME',
    messageMatch: /^Unhandled Runtime Exception\.$/,
    hint: 'Nest runtime exception',
    detail: 'Nest raised a RuntimeException without detail.',
    howToFix: 'Read the stack for the origin.',
    category: 'bug',
  },
  {
    key: 'NEST_GRAPHQL_UNDEFINED_TYPE',
    messageMatch:
      /^Undefined type error\. Make sure you are providing an explicit type/,
    hint: 'GraphQL field type unknown',
    detail:
      'A @Field()/@Args() has a type TypeScript cannot reflect (array, union, interface, circular).',
    howToFix: 'Pass an explicit () => Type.',
    category: 'bug',
    target: /for the "([^"]+)" of the "([^"]+)" class/,
  },
  {
    key: 'NEST_SWAGGER_UNDEFINED_TYPE',
    messageMatch: /^A circular dependency has been detected \(property key: /,
    hint: 'Swagger circular type',
    detail:
      'Swagger cannot reflect a property type (circular DTO or undefined type).',
    howToFix:
      'Use @ApiProperty({ type: () => Dto }) on each side of the relationship.',
    category: 'bug',
    target: /property key: "([^"]+)"/,
  },
]
