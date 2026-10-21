import type { ErrorPattern } from './types'

// NestJS dependency injection and module errors (packages/core/errors/messages.ts).
// Most happen at boot; a few (ModuleRef.get, request-scoped) at runtime.
export const nestCorePatterns: ErrorPattern[] = [
  {
    key: 'NEST_UNRESOLVED_DEPENDENCY',
    messageMatch: /^Nest can't resolve dependencies of the /,
    hint: 'Nest cannot inject dependency',
    hintDetail:
      'A provider needs something the module does not provide or import (see target). Import the module that exports it, or add it to providers.',
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
        fix: `${consumer} needs ${dependency ?? 'a provider'}${where} that ${context ?? 'its module'} does not have. Import the module exporting it, or register it in providers.`,
      }
    },
  },
  {
    key: 'NEST_CIRCULAR_MODULE',
    messageMatch:
      /^Nest cannot create the module instance\. Often, this is because of a circular dependency/,
    hint: 'Circular module import',
    hintDetail:
      'Two modules import each other, so one is undefined at load time. Use forwardRef(() => Module) on both sides, or move the shared provider to a third module.',
    category: 'bug',
  },
  {
    key: 'NEST_INVALID_MODULE',
    messageMatch: /^Nest cannot create the \S+ instance\./,
    hint: 'Invalid module import',
    hintDetail:
      'A module imports undefined or a non-module (see message): a circular import, a missing export, or a controller/provider listed in imports.',
    category: 'bug',
    target: /^Nest cannot create the (\S+) instance/,
  },
  {
    key: 'NEST_UNKNOWN_EXPORT',
    messageMatch:
      /^Nest cannot export a provider\/module that is not a part of the currently processed module/,
    hint: 'Export not in module',
    hintDetail:
      'A module exports something it neither provides nor imports (see target). Add it to providers/imports or remove the export.',
    category: 'bug',
    target: /\(([^)]+)\)\. Please verify whether the exported (\S+)/,
  },
  {
    key: 'NEST_UNKNOWN_ELEMENT',
    messageMatch: /^Nest could not find \S+ element/,
    hint: 'Provider not in context',
    hintDetail:
      'moduleRef.get()/app.get() asked for a provider this module does not know (see target). Pass { strict: false } or resolve it from the right module.',
    category: 'bug',
    target: /^Nest could not find (\S+) element/,
  },
  {
    key: 'NEST_NOT_CONSTRUCTABLE',
    messageMatch: /^ModuleRef cannot instantiate class/,
    hint: 'Provider not a class',
    hintDetail:
      'moduleRef.create() got something that is not a constructor (an instance, a token).',
    category: 'bug',
  },
  {
    key: 'NEST_REQUEST_SCOPED_CREATE',
    messageMatch:
      /depends on a request-scoped provider, so it can't be created without a context id/,
    hint: 'Request-scoped provider needed',
    hintDetail:
      'A request-scoped provider was resolved outside a request. Use moduleRef.resolve(type, contextId), or make the provider singleton.',
    category: 'bug',
    target: /^(\S+) depends on a request-scoped provider/,
  },
  {
    key: 'NEST_REQUEST_SCOPED_ENHANCER',
    messageMatch: /provider \(\S+\) depends on a request-scoped provider/,
    hint: 'Request-scoped global enhancer',
    hintDetail:
      'A global guard/interceptor/filter depends on a request-scoped provider, so it would run with undefined dependencies. Mark it request-scoped too.',
    category: 'bug',
  },
  {
    key: 'NEST_DUPLICATE_ROUTE',
    messageMatch: /^Duplicate route: /,
    hint: 'Duplicate route',
    hintDetail:
      'Two handlers register the same method and path (see target). Rename one route.',
    category: 'bug',
    target: /^Duplicate route: (\S+ \S+)/,
  },
  {
    key: 'NEST_INVALID_CONTROLLER',
    messageMatch: /^An invalid controller has been detected/,
    hint: 'Controller missing decorator',
    hintDetail:
      'A class in the controllers array has no @Controller() decorator (see target).',
    category: 'bug',
    target: /"([^"]+)" does not have the @Controller/,
  },
  {
    key: 'NEST_INVALID_MIDDLEWARE',
    messageMatch: /^The middleware doesn't provide the 'use' method/,
    hint: 'Middleware has no use()',
    hintDetail:
      'A class in configure(consumer) does not implement NestMiddleware.use().',
    category: 'bug',
  },
  {
    key: 'NEST_INVALID_MIDDLEWARE_CONFIG',
    messageMatch: /^An invalid middleware configuration has been passed/,
    hint: 'Invalid middleware config',
    hintDetail:
      'consumer.apply(...).forRoutes(...) got an invalid route or class.',
    category: 'bug',
  },
  {
    key: 'NEST_INVALID_EXCEPTION_FILTER',
    messageMatch: /^Invalid exception filters/,
    hint: 'Invalid @UseFilters()',
    hintDetail:
      '@UseFilters() got something that is not a filter class or instance.',
    category: 'bug',
  },
  {
    key: 'NEST_MICROSERVICES_MISSING',
    messageMatch: /^Unable to load @nestjs\/microservices package/,
    hint: '@nestjs/microservices missing',
    hintDetail:
      'A microservice transport is used but @nestjs/microservices is not installed. Add the dependency.',
    category: 'config',
  },
  {
    key: 'NEST_CLASS_IN_IMPORTS',
    messageMatch:
      /is decorated with @(Controller|Injectable|Catch)\(\) and cannot appear in the "imports" array/,
    hint: 'Class in module imports',
    hintDetail:
      'A controller/provider/filter was listed in imports. Move it to controllers or providers.',
    category: 'bug',
  },
  {
    key: 'NEST_UNHANDLED_RUNTIME',
    messageMatch: /^Unhandled Runtime Exception\.$/,
    hint: 'Nest runtime exception',
    hintDetail:
      'Nest raised a RuntimeException without detail. Read the stack for the origin.',
    category: 'bug',
  },
  {
    key: 'NEST_GRAPHQL_UNDEFINED_TYPE',
    messageMatch:
      /^Undefined type error\. Make sure you are providing an explicit type/,
    hint: 'GraphQL field type unknown',
    hintDetail:
      'A @Field()/@Args() has a type TypeScript cannot reflect (array, union, interface, circular). Pass an explicit () => Type.',
    category: 'bug',
    target: /for the "([^"]+)" of the "([^"]+)" class/,
  },
  {
    key: 'NEST_SWAGGER_UNDEFINED_TYPE',
    messageMatch: /^A circular dependency has been detected \(property key: /,
    hint: 'Swagger circular type',
    hintDetail:
      'Swagger cannot reflect a property type (circular DTO or undefined type). Use @ApiProperty({ type: () => Dto }).',
    category: 'bug',
    target: /property key: "([^"]+)"/,
  },
]
