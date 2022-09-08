// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Defines the functions exposed by OpenAPI-to-GraphQL.
 *
 * Some general notes:
 *
 * - GraphQL interfaces rely on sanitized strings for (input) object type names
 *   and fields. We perform sanitization only when assigning (field-) names, but
 *   keep keys in the OAS otherwise as-is, to ensure that inner-OAS references
 *   work as expected.
 *
 * - GraphQL (input) object types must have a unique name. Thus, sometimes Input
 *   object types and object types need separate names, despite them having the
 *   same structure. We thus append 'Input' to every input object type's name
 *   as a convention.
 *
 * - To pass data between resolve functions, OpenAPI-to-GraphQL uses a _openAPIToGraphQL object
 *   returned by every resolver in addition to its original data (OpenAPI-to-GraphQL does
 *   not use the context to do so, which is an anti-pattern according to
 *   https://github.com/graphql/graphql-js/issues/953).
 *
 * - OpenAPI-to-GraphQL can handle basic authentication and API key-based authentication
 *   through GraphQL. To do this, OpenAPI-to-GraphQL creates two new intermediate Object
 *   Types called QueryViewer and MutationViewer that take as input security
 *   credentials and pass them on using the _openAPIToGraphQL object to other resolve
 *   functions.
 */

// Type imports:
import type { OpenAPIV3, OpenAPIV2 } from 'openapi-types';
import { Headers } from '@whatwg-node/fetch';
import type {
  Args,
  ConnectOptions,
  FileUploadOptions,
  InternalOptions,
  OpenAPILoaderOptions,
  Operation,
  Options,
  PreprocessingData,
  Report,
  RequestOptions,
  SubscriptionContext,
} from './types'
import {GraphQLOperationType} from './types'
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLFieldConfig,
} from 'graphql'
import { loadGraphQLSchemaFromJSONSchemas } from '@omnigraph/json-schema';

// Imports:
import {
  getResolver,
  getSubscribe,
  getPublishResolver
} from './resolver_builder'
import * as GraphQLTools from './graphql_tools'
import { preprocessOas } from './preprocessor'
import * as Oas3Tools from './oas_3_tools'
import { createAndLoadViewer } from './auth_builder'
import { GraphQLSchemaConfig } from 'graphql/type/schema'
import { sortObject, handleWarning, MitigationTypes } from './utils'
import crossFetch from 'cross-fetch'
import debug from 'debug'
import { getJSONSchemaOptions } from './getJSONSchemaOptions'
const translationLog = debug('translation')

type Oas2 = OpenAPIV2.Document;
type Oas3 = OpenAPIV3.Document;

export { Oas2, Oas3, Options }

type Result<TSource, TContext, TArgs> = {
  schema: GraphQLSchema
  report: Report
  data: PreprocessingData<TSource, TContext, TArgs>
}

const DEFAULT_OPTIONS: InternalOptions<any, any, any> = {
  report: {
    warnings: [],
    numOps: 0,
    numOpsQuery: 0,
    numOpsMutation: 0,
    numOpsSubscription: 0,
    numQueriesCreated: 0,
    numMutationsCreated: 0,
    numSubscriptionsCreated: 0
  },

  // Setting default options
  strict: false,

  // Schema options
  operationIdFieldNames: false,
  fillEmptyResponses: false,
  addLimitArgument: false,
  idFormats: [],
  selectQueryOrMutationField: {},
  genericPayloadArgName: false,
  simpleNames: false,
  simpleEnumValues: false,
  singularNames: false,
  createSubscriptionsFromCallbacks: false,

  // Resolver options
  headers: {},
  qs: {},
  requestOptions: {},
  customResolvers: {},
  customSubscriptionResolvers: {},
  fileUploadOptions: {},

  // Authentication options
  viewer: true,
  sendOAuthTokenInQuery: false,

  // Validation options
  oasValidatorOptions: {},
  swagger2OpenAPIOptions: {},

  // Logging options
  provideErrorExtensions: true,
  equivalentToMessages: true,

  fetch: crossFetch
}

async function optionsTranslator<TSource, TContext, TArgs>(originOptions: Options<TSource, TContext, TArgs>, oas: OpenAPIV3.Document): Promise<OpenAPILoaderOptions> {
  /**
   * Ignored openapi-to-graphql options:
   * - strict: boolean
   * - report: Report
   * - operationIdFieldNames: boolean
   * - fillEmptyResponses: boolean
   * - addLimitArgument: boolean
   * - idFormats?: string[]
   * - genericPayloadArgName: boolean
   * - simpleNames: boolean
   * - simpleEnumValues: boolean
   * - singularNames: boolean
   * - createSubscriptionsFromCallbacks: boolean
   * - requestOptions?: Partial<RequestOptions<TSource, TContext, TArgs>>
   * - connectOptions?: ConnectOptions
   * - customResolvers?: OasTitlePathMethodObject<GraphQLFieldResolver<TSource, TContext, TArgs>
   * - customSubscriptionResolvers?: OasTitlePathMethodObject<{ subscribe: GraphQLFieldResolver<TSource, SubscriptionContext, TArgs>, resolve: GraphQLFieldResolver<TSource, TContext, TArgs> }>
   * - fileUploadOptions?: FileUploadOptions
   * - viewer: boolean
   * - tokenJSONpath?: string
   * - sendOAuthTokenInQuery: boolean
   * - oasValidatorOptions: object
   * - swagger2OpenAPIOptions: object
   * - provideErrorExtensions: boolean
   * - equivalentToMessages: boolean
   */

  const options: OpenAPILoaderOptions = {
    baseUrl: originOptions.baseUrl,
    fetch: originOptions.fetch,
    queryParams: originOptions.qs,
    source: oas,
    selectQueryOrMutationField: originOptions.selectQueryOrMutationField,
  }
  /**
   * Not used config options:
   * - operations: JSONSchemaOperationConfig[],
   * - errorMessage?: string,
   * - logger?: Logger,
   * - pubsub?: MeshPubSub,
   * - ignoreErrorResponses?: boolean,
   * - queryStringOptions?: IStringifyOptions,
   */

  // transform headers
  if (originOptions.headers) {
    if (originOptions.headers instanceof Function) {
      // Differences between headers function here and over MESH prevents it from being supported currently
      console.error('headers as a function is not supported');
    } else {
      options.operationHeaders = {};
      if (Array.isArray(originOptions.headers)) {
        originOptions.headers.forEach(header => {
          options.operationHeaders[header[0]] = header[1];
        });
      } else if (originOptions.headers instanceof Headers) {
        originOptions.headers.forEach((value, key) => {
          options.operationHeaders[key] = value;
        });
      } else {
        options.operationHeaders = originOptions.headers;
      }
    }
  }

  return options;
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification (2 or 3).
 */
export async function createGraphQLSchema<TSource, TContext, TArgs>(
  spec: OpenAPIV3.Document | OpenAPIV2.Document,
  options?: Options<TSource, TContext, TArgs>
): Promise<Result<TSource, TContext, TArgs>> {
  const internalOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  }
  // Convert non-OAS 3 into OAS 3
  const oas = await Oas3Tools.getValidOAS3(
    spec,
    internalOptions.oasValidatorOptions,
    internalOptions.swagger2OpenAPIOptions
  )

  // Setting default options
  const meshOptions = await optionsTranslator({
    ...DEFAULT_OPTIONS,
    ...options
  }, oas);

  const name = oas.info.title;

  const extraJSONSchemaOptions = await getJSONSchemaOptions(meshOptions);
  
  const schema = await loadGraphQLSchemaFromJSONSchemas(name, {
    ...meshOptions,
    ...extraJSONSchemaOptions,
  });

  // TODO: replace this
  return translateOpenAPIToGraphQL([oas], internalOptions, schema)
}

/**
 * Creates a GraphQL interface from the given OpenAPI Specification 3
 */
export function translateOpenAPIToGraphQL<TSource, TContext, TArgs>(
  oass: OpenAPIV3.Document[],
  {
    strict,
    report,

    // Schema options
    operationIdFieldNames,
    fillEmptyResponses,
    addLimitArgument,
    idFormats,
    selectQueryOrMutationField,
    genericPayloadArgName,
    simpleNames,
    simpleEnumValues,
    singularNames,
    createSubscriptionsFromCallbacks,

    // Resolver options
    headers,
    qs,
    requestOptions,
    fileUploadOptions,
    connectOptions,
    baseUrl,
    customResolvers,
    customSubscriptionResolvers,

    // Authentication options
    viewer,
    tokenJSONpath,
    sendOAuthTokenInQuery,

    // Validation options
    oasValidatorOptions,
    swagger2OpenAPIOptions,

    // Logging options
    provideErrorExtensions,
    equivalentToMessages,

    fetch
  }: InternalOptions<TSource, TContext, TArgs>,
  meshSchema: GraphQLSchema
): Result<TSource, TContext, TArgs> {
  const options = {
    strict,
    report,

    // Schema options
    operationIdFieldNames,
    fillEmptyResponses,
    addLimitArgument,
    idFormats,
    selectQueryOrMutationField,
    genericPayloadArgName,
    simpleNames,
    simpleEnumValues,
    singularNames,
    createSubscriptionsFromCallbacks,

    // Resolver options
    headers,
    qs,
    requestOptions,
    fileUploadOptions,
    connectOptions,
    baseUrl,
    customResolvers,
    customSubscriptionResolvers,

    // Authentication options
    viewer,
    tokenJSONpath,
    sendOAuthTokenInQuery,

    // Validation options
    oasValidatorOptions,
    swagger2OpenAPIOptions,

    // Logging options
    provideErrorExtensions,
    equivalentToMessages,

    fetch
  }
  // translationLog(`Options: ${JSON.stringify(options)}`)

  /**
   * Extract information from the OASs and put it inside a data structure that
   * is easier for OpenAPI-to-GraphQL to use
   */
  const data: PreprocessingData<TSource, TContext, TArgs> = preprocessOas(
    oass,
    options
  )

  preliminaryChecks(options, data)

  // Query, Mutation, and Subscription fields
  let queryFields: { [fieldName: string]: GraphQLFieldConfig<any, any> } = {}
  let mutationFields: { [fieldName: string]: GraphQLFieldConfig<any, any> } = {}
  let subscriptionFields: {
    [fieldName: string]: GraphQLFieldConfig<any, any>
  } = {}

  // Authenticated Query, Mutation, and Subscription fields
  let authQueryFields: {
    [fieldName: string]: {
      [securityRequirement: string]: GraphQLFieldConfig<any, any>
    }
  } = {}
  let authMutationFields: {
    [fieldName: string]: {
      [securityRequirement: string]: GraphQLFieldConfig<any, any>
    }
  } = {}
  let authSubscriptionFields: {
    [fieldName: string]: {
      [securityRequirement: string]: GraphQLFieldConfig<any, any>
    }
  } = {}

  // Add Query and Mutation fields
  Object.entries(data.operations).forEach(([operationId, operation]) => {
    translationLog(`Process operation '${operation.operationString}'...`)
    // Check if the operation should be added as a Query or Mutation
    if (operation.operationType === GraphQLOperationType.Query) {
      addQueryFields({
        authQueryFields,
        queryFields,
        operationId,
        operation,
        options,
        data
      })
    } else if (operation.operationType === GraphQLOperationType.Mutation) {
      addMutationFields({
        authMutationFields,
        mutationFields,
        operationId,
        operation,
        options,
        data
      })
    }
  })

  // Add Subscription fields
  Object.entries(data.callbackOperations).forEach(
    ([operationId, operation]) => {
      translationLog(`Process operation '${operationId}'...`)

      addSubscriptionFields({
        authSubscriptionFields,
        subscriptionFields,
        operationId,
        operation,
        options,
        data
      })
    }
  )

  // Sorting fields
  queryFields = sortObject(queryFields)
  mutationFields = sortObject(mutationFields)
  subscriptionFields = sortObject(subscriptionFields)
  authQueryFields = sortObject(authQueryFields)
  Object.keys(authQueryFields).forEach((key) => {
    authQueryFields[key] = sortObject(authQueryFields[key])
  })
  authMutationFields = sortObject(authMutationFields)
  Object.keys(authMutationFields).forEach((key) => {
    authMutationFields[key] = sortObject(authMutationFields[key])
  })
  authSubscriptionFields = sortObject(authSubscriptionFields)
  Object.keys(authSubscriptionFields).forEach((key) => {
    authSubscriptionFields[key] = sortObject(authSubscriptionFields[key])
  })

  // Count created Query, Mutation, and Subscription fields
  report.numQueriesCreated =
    Object.keys(queryFields).length +
    Object.keys(authQueryFields).reduce((sum, key) => {
      return sum + Object.keys(authQueryFields[key]).length
    }, 0)

  report.numMutationsCreated =
    Object.keys(mutationFields).length +
    Object.keys(authMutationFields).reduce((sum, key) => {
      return sum + Object.keys(authMutationFields[key]).length
    }, 0)

  report.numSubscriptionsCreated =
    Object.keys(subscriptionFields).length +
    Object.keys(authSubscriptionFields).reduce((sum, key) => {
      return sum + Object.keys(authSubscriptionFields[key]).length
    }, 0)

  /**
   * Organize authenticated Query, Mutation, and Subscriptions fields into
   * viewer objects.
   */
  if (Object.keys(authQueryFields).length > 0) {
    Object.assign(
      queryFields,
      createAndLoadViewer(
        authQueryFields,
        GraphQLOperationType.Query,
        data,
        fetch
      )
    )
  }

  if (Object.keys(authMutationFields).length > 0) {
    Object.assign(
      mutationFields,
      createAndLoadViewer(
        authMutationFields,
        GraphQLOperationType.Mutation,
        data,
        fetch
      )
    )
  }

  if (Object.keys(authSubscriptionFields).length > 0) {
    Object.assign(
      subscriptionFields,
      createAndLoadViewer(
        authSubscriptionFields,
        GraphQLOperationType.Subscription,
        data,
        fetch
      )
    )
  }

  // Build up the schema
  const schemaConfig: GraphQLSchemaConfig = {
    query:
      Object.keys(queryFields).length > 0
        ? new GraphQLObjectType({
            name: 'Query',
            fields: queryFields
          })
        : GraphQLTools.getEmptyObjectType('Query'), // A GraphQL schema must contain a Query object type
    mutation:
      Object.keys(mutationFields).length > 0
        ? new GraphQLObjectType({
            name: 'Mutation',
            fields: mutationFields
          })
        : null,
    subscription:
      Object.keys(subscriptionFields).length > 0
        ? new GraphQLObjectType({
            name: 'Subscription',
            fields: subscriptionFields
          })
        : null
  }

  /**
   * Fill in yet undefined object types to avoid GraphQLSchema from breaking.
   *
   * The reason: once creating the schema, the 'fields' thunks will resolve and
   * if a field references an undefined object type, GraphQL will throw.
   */
  Object.entries(data.operations).forEach(([opId, operation]) => {
    if (typeof operation.responseDefinition.graphQLType === 'undefined') {
      operation.responseDefinition.graphQLType =
        GraphQLTools.getEmptyObjectType(
          operation.responseDefinition.graphQLTypeName
        )
    }
  })

  const schema = new GraphQLSchema(schemaConfig)

  return { schema: meshSchema, report, data }
}

function addQueryFields<TSource, TContext, TArgs>({
  authQueryFields,
  queryFields,
  operationId,
  operation,
  options,
  data
}: {
  authQueryFields: {
    [fieldName: string]: {
      [securityRequirement: string]: GraphQLFieldConfig<any, any>
    }
  }
  queryFields: { [fieldName: string]: GraphQLFieldConfig<any, any> }
  operationId: string
  operation: Operation
  options: InternalOptions<TSource, TContext, TArgs>
  data: PreprocessingData<TSource, TContext, TArgs>
}) {
  const {
    operationIdFieldNames,
    singularNames,
    baseUrl,
    requestOptions,
      fileUploadOptions,
    connectOptions,
    fetch
  } = options

  const saneOperationId = Oas3Tools.sanitize(
    operationId,
    Oas3Tools.CaseStyle.camelCase
  )

  // Field name provided by x-graphql-field-name OAS extension
  const extensionFieldName =
    operation.operation[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName]

  if (!Oas3Tools.isSanitized(extensionFieldName)) {
    throw new Error(
      `Cannot create query field with name "${extensionFieldName}".\nYou ` +
        `provided "${extensionFieldName}" in ` +
        `${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it is not ` +
        `GraphQL-safe."`
    )
  }

  const generatedFieldName = operationIdFieldNames
    ? saneOperationId // Sanitized (generated) operationId
    : singularNames
    ? Oas3Tools.sanitize(
        // Generated singular name
        Oas3Tools.inferResourceNameFromPath(operation.path),
        Oas3Tools.CaseStyle.camelCase
      )
    : Oas3Tools.uncapitalize(
        // Generated type name (to be used as a field name)
        operation.responseDefinition.graphQLTypeName
      )

  /**
   * The name of the field
   *
   * Priority order:
   *  1. (extensionFieldName) if the field name is provided by
   * x-graphql-field-name OAS extension, use it.
   *
   *  2. (operationIdFieldNames) if the operationIdFieldNames option is set
   * to true, then use the sane operationId.
   *
   *  3. (singularNames) if the singularNames option is set to true, then
   * generate a singular name and use it.
   *
   *  4. (default) use the generated type name and use it.
   */
  let fieldName = extensionFieldName || generatedFieldName

  // Generate viewer
  if (operation.inViewer) {
    for (let securityRequirement of operation.securityRequirements) {
      if (typeof authQueryFields[securityRequirement] !== 'object') {
        authQueryFields[securityRequirement] = {}
      }

      // Check for extensionFieldName because it can create conflicts
      if (
        extensionFieldName &&
        extensionFieldName in authQueryFields[securityRequirement]
      ) {
        throw new Error(
          `Cannot create query field with name "${extensionFieldName}".\nYou ` +
            ` provided "${extensionFieldName}" in ` +
            `${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts ` +
            `with another field named "${extensionFieldName}".`
        )
      }

      /**
       * If using fieldName will cause a conflict, then try to use the
       * operationId instead.
       *
       * For example, the default behavior is to use the type name as a
       * field name and multiple operations can return the same type.
       */
      if (fieldName in authQueryFields[securityRequirement]) {
        fieldName = saneOperationId
      }

      // Final fieldName verification
      if (fieldName in authQueryFields[securityRequirement]) {
        handleWarning({
          mitigationType: MitigationTypes.DUPLICATE_FIELD_NAME,
          message:
            `Multiple operations have the same name ` +
            `'${fieldName}' and security requirement ` +
            `'${securityRequirement}'. GraphQL field names must be ` +
            `unique so only one can be added to the authentication ` +
            `viewer. Operation '${operation.operationString}' will be ignored.`,
          data,
          log: translationLog
        })

        return
      }
    }
  } else {
    // Check for extensionFieldName because it can create conflicts
    if (extensionFieldName && extensionFieldName in queryFields) {
      throw new Error(
        `Cannot create query field with name "${extensionFieldName}".\nYou ` +
          `provided "${extensionFieldName}" in ` +
          `${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it conflicts ` +
          `with another field named "${extensionFieldName}".`
      )
    }

    /**
     * If using fieldName will cause a conflict, then try to use the
     * operationId instead.
     *
     * For example, the default behavior is to use the type name as a
     * field name and multiple operations can return the same type.
     */
    if (fieldName in queryFields) {
      fieldName = saneOperationId
    }

    // Final fieldName verification
    if (fieldName in queryFields) {
      handleWarning({
        mitigationType: MitigationTypes.DUPLICATE_FIELD_NAME,
        message:
          `Multiple operations have the same name ` +
          `'${fieldName}'. GraphQL field names must be ` +
          `unique so only one can be added to the Query object. ` +
          `Operation '${operation.operationString}' will be ignored.`,
        data,
        log: translationLog
      })

      return
    }
  }
}

function addMutationFields<TSource, TContext, TArgs>({
  authMutationFields,
  mutationFields,
  operationId,
  operation,
  options,
  data
}: {
  authMutationFields: {
    [fieldName: string]: {
      [securityRequirement: string]: GraphQLFieldConfig<any, any>
    }
  }
  mutationFields: { [fieldName: string]: GraphQLFieldConfig<any, any> }
  operationId: string
  operation: Operation
  options: InternalOptions<TSource, TContext, TArgs>
  data: PreprocessingData<TSource, TContext, TArgs>
}) {
  const {
    singularNames,
    baseUrl,
    requestOptions,
      fileUploadOptions,
    connectOptions,
    fetch
  } = options

  const saneOperationId = Oas3Tools.sanitize(
    operationId,
    Oas3Tools.CaseStyle.camelCase
  )

  // Field name provided by x-graphql-field-name OAS extension
  const extensionFieldName =
    operation.operation[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName]

  if (!Oas3Tools.isSanitized(extensionFieldName)) {
    throw new Error(
      `Cannot create mutation field with name "${extensionFieldName}".\nYou ` +
        `provided "${extensionFieldName}" in ` +
        `${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it is not ` +
        `GraphQL-safe."`
    )
  }

  const generatedFieldName = singularNames
    ? Oas3Tools.sanitize(
        // Generated singular name with HTTP method
        `${operation.method}${Oas3Tools.inferResourceNameFromPath(
          operation.path
        )}`,
        Oas3Tools.CaseStyle.camelCase
      )
    : saneOperationId // (Generated) operationId (for mutations, operationId is guaranteed unique)

  /**
   * The name of the field
   *
   * Priority order:
   *  1. (extensionFieldName) if the field name is provided by
   * x-graphql-field-name OAS extension, use it.
   *
   *  2. (singularNames) if the singularNames option is set to true, then
   * generate a singular name with the HTTP method and use it.
   *
   *  3. (default) use the (generated) operationId.
   */
  const fieldName = extensionFieldName || generatedFieldName

  // Generate viewer
  if (operation.inViewer) {
    for (let securityRequirement of operation.securityRequirements) {
      if (typeof authMutationFields[securityRequirement] !== 'object') {
        authMutationFields[securityRequirement] = {}
      }

      // Check for extensionFieldName because it can create conflicts
      if (
        extensionFieldName &&
        extensionFieldName in authMutationFields[securityRequirement]
      ) {
        throw new Error(
          `Cannot create mutation field with name ` +
            `"${extensionFieldName}".\nYou provided "${extensionFieldName}" ` +
            `in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it ` +
            `conflicts with another field named "${extensionFieldName}".`
        )
      }

      // Final fieldName verification
      if (fieldName in authMutationFields[securityRequirement]) {
        handleWarning({
          mitigationType: MitigationTypes.DUPLICATE_FIELD_NAME,
          message:
            `Multiple operations have the same name ` +
            `'${fieldName}' and security requirement ` +
            `'${securityRequirement}'. GraphQL field names must be ` +
            `unique so only one can be added to the authentication ` +
            `viewer. Operation '${operation.operationString}' will be ignored.`,
          data,
          log: translationLog
        })

        return
      }
    }

    // No viewer
  } else {
    // Check for extensionFieldName because it can create conflicts
    if (extensionFieldName && extensionFieldName in mutationFields) {
      throw new Error(
        `Cannot create mutation field with name ` +
          `"${extensionFieldName}".\nYou provided "${extensionFieldName}" ` +
          `in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it ` +
          `conflicts with another field named "${extensionFieldName}".`
      )
    }

    // Final fieldName verification
    if (fieldName in mutationFields) {
      handleWarning({
        mitigationType: MitigationTypes.DUPLICATE_FIELD_NAME,
        message:
          `Multiple operations have the same name ` +
          `'${fieldName}'. GraphQL field names must be ` +
          `unique so only one can be added to the Mutation object. ` +
          `Operation '${operation.operationString}' will be ignored.`,
        data,
        log: translationLog
      })

      return
    }
  }
}

function addSubscriptionFields<TSource, TContext, TArgs>({
  authSubscriptionFields,
  subscriptionFields,
  operationId,
  operation,
  options,
  data
}: {
  authSubscriptionFields: {
    [fieldName: string]: {
      [securityRequirement: string]: GraphQLFieldConfig<any, any>
    }
  }
  subscriptionFields: { [fieldName: string]: GraphQLFieldConfig<any, any> }
  operationId: string
  operation: Operation
  options: InternalOptions<TSource, TContext, TArgs>
  data: PreprocessingData<TSource, TContext, TArgs>
}) {
  const { baseUrl, requestOptions, connectOptions, fetch, fileUploadOptions } = options

  const saneOperationId = Oas3Tools.sanitize(
    operationId,
    Oas3Tools.CaseStyle.camelCase
  )

  const extensionFieldName =
    operation.operation[Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName]

  if (!Oas3Tools.isSanitized(extensionFieldName)) {
    throw new Error(
      `Cannot create subscription field with name ` +
        `"${extensionFieldName}".\nYou provided "${extensionFieldName}" in ` +
        `${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it is not ` +
        `GraphQL-safe."`
    )
  }

  const fieldName = extensionFieldName || saneOperationId

  // Generate viewer
  if (operation.inViewer) {
    for (let securityRequirement of operation.securityRequirements) {
      if (typeof authSubscriptionFields[securityRequirement] !== 'object') {
        authSubscriptionFields[securityRequirement] = {}
      }

      if (
        extensionFieldName &&
        extensionFieldName in authSubscriptionFields[securityRequirement]
      ) {
        throw new Error(
          `Cannot create subscription field with name ` +
            `"${extensionFieldName}".\nYou provided "${extensionFieldName}" ` +
            `in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it ` +
            `conflicts with another field named "${extensionFieldName}".`
        )
      }

      // Final fieldName verification
      if (fieldName in authSubscriptionFields[securityRequirement]) {
        handleWarning({
          mitigationType: MitigationTypes.DUPLICATE_FIELD_NAME,
          message:
            `Multiple operations have the same name ` +
            `'${fieldName}' and security requirement ` +
            `'${securityRequirement}'. GraphQL field names must be ` +
            `unique so only one can be added to the authentication ` +
            `viewer. Operation '${operation.operationString}' will be ignored.`,
          data,
          log: translationLog
        })

        return
      }
    }

    // No viewer
  } else {
    if (extensionFieldName && extensionFieldName in subscriptionFields) {
      throw new Error(
        `Cannot create subscription field with name ` +
          `"${extensionFieldName}".\nYou provided "${extensionFieldName}" ` +
          `in ${Oas3Tools.OAS_GRAPHQL_EXTENSIONS.FieldName}, but it ` +
          `conflicts with another field named "${extensionFieldName}".`
      )
    }

    // Final fieldName verification
    if (fieldName in subscriptionFields) {
      handleWarning({
        mitigationType: MitigationTypes.DUPLICATE_FIELD_NAME,
        message:
          `Multiple operations have the same name ` +
          `'${fieldName}'. GraphQL field names must be ` +
          `unique so only one can be added to the Mutation object. ` +
          `Operation '${operation.operationString}' will be ignored.`,
        data,
        log: translationLog
      })

      return
    }
  }
}

/**
 * Ensure that the customResolvers/customSubscriptionResolvers object is a
 * triply nested object using the name of the OAS, the path, and the method
 * as keys.
 */
function checkCustomResolversStructure<TSource, TContext, TArgs>(
  customResolvers: any,
  data: PreprocessingData<TSource, TContext, TArgs>
) {
  if (typeof customResolvers === 'object') {
    // Check that all OASs that are referenced in the customResolvers are provided
    Object.keys(customResolvers)
      .filter((title) => {
        // If no OAS contains this title
        return !data.oass.some((oas) => {
          return title === oas.info.title
        })
      })
      .forEach((title) => {
        handleWarning({
          mitigationType: MitigationTypes.CUSTOM_RESOLVER_UNKNOWN_OAS,
          message:
            `Custom resolvers reference OAS '${title}' but no such ` +
            `OAS was provided`,
          data,
          log: translationLog
        })
      })

    // TODO: Only run the following test on OASs that exist. See previous check.
    Object.keys(customResolvers).forEach((title) => {
      // Get all operations from a particular OAS
      const operations = Object.values(data.operations).filter((operation) => {
        return title === operation.oas.info.title
      })

      Object.keys(customResolvers[title]).forEach((path) => {
        Object.keys(customResolvers[title][path]).forEach((method) => {
          if (
            !operations.some((operation) => {
              return path === operation.path && method === operation.method
            })
          ) {
            handleWarning({
              mitigationType:
                MitigationTypes.CUSTOM_RESOLVER_UNKNOWN_PATH_METHOD,
              message:
                `A custom resolver references an operation with ` +
                `path '${path}' and method '${method}' but no such operation ` +
                `exists in OAS '${title}'`,
              data,
              log: translationLog
            })
          }
        })
      })
    })
  }
}

/**
 * Ensures that the options are valid
 */
function preliminaryChecks<TSource, TContext, TArgs>(
  options: InternalOptions<TSource, TContext, TArgs>,
  data: PreprocessingData<TSource, TContext, TArgs>
): void {
  // Check if OASs have unique titles
  const titles = data.oass.map((oas) => {
    return oas.info.title
  })

  // Find duplicates among titles
  new Set(
    titles.filter((title, index) => {
      return titles.indexOf(title) !== index
    })
  ).forEach((title) => {
    handleWarning({
      mitigationType: MitigationTypes.MULTIPLE_OAS_SAME_TITLE,
      message: `Multiple OAS share the same title '${title}'`,
      data,
      log: translationLog
    })
  })

  // Check customResolvers
  checkCustomResolversStructure(options.customResolvers, data)

  // Check customSubscriptionResolvers
  checkCustomResolversStructure(options.customSubscriptionResolvers, data)
}

export { CaseStyle, sanitize } from './oas_3_tools'
export { GraphQLOperationType } from './types/graphql'
