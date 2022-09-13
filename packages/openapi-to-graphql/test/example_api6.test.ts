// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { graphql, GraphQLSchema, parse, validate } from 'graphql'
import { afterAll, beforeAll, expect, test } from '@jest/globals'

import * as openAPIToGraphQL from '../src/index'
import { Options } from '../src/types'
import { startServer, stopServer } from './example_api6_server'

const oas = require('./fixtures/example_oas6.json')
const PORT = 3008
// Update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

let createdSchema: GraphQLSchema

// Set up the schema first and run example API server
beforeAll(() => {
  return Promise.all([
    openAPIToGraphQL.createGraphQLSchema(oas).then(({ schema, report }) => {
      createdSchema = schema
    }),
    startServer(PORT)
  ])
})

// Shut down API server
afterAll(() => {
  return stopServer()
})

test('Option requestOptions should work with links', () => {
  // Verify the behavior of the link by itself
  const query = `{
    object {
      object2Link {
        data
      }
      withParameter: object2Link (specialheader: "extra data"){
        data
      }
    }
  }`

  const promise = graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      object: {
        object2Link: {
          data: 'object2'
        },
        withParameter: {
          data: "object2 with special header: 'extra data'"
        }
      }
    })
  })

  const options: Options<any, any, any> = {
    requestOptions: {
      headers: {
        specialheader: 'requestOptions'
      }
    }
  }

  const query2 = `{
    object {
      object2Link {
        data
      }
    }
  }`

  const promise2 = openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query2)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({schema, source: query2}).then((result) => {
        expect(result).toEqual({
          data: {
            object: {
              object2Link: {
                data: "object2 with special header: 'requestOptions'" // Data from requestOptions in a link
              }
            }
          }
        })
      })
    })

  return Promise.all([promise, promise2])
})

// Simple scalar fields on the request body
test('Simple request body using application/x-www-form-urlencoded', () => {
  const query = `mutation {
    post_formUrlEncoded (input: {
      name: "Mittens",
      status: "healthy",
      weight: 6
    }) {
      name
      status
      weight
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      post_formUrlEncoded: {
        name: 'Mittens',
        status: 'healthy',
        weight: 6
      }
    })
  })
})

/**
 * The field 'previousOwner' should be desanitized to 'previous_owner'
 *
 * Status is a required field so it is also included
 */
test('Request body using application/x-www-form-urlencoded and desanitization of field name', () => {
  const query = `mutation {
    post_formUrlEncoded (input: {
      previous_owner: "Martin",
      status: "healthy"
    }) {
      previous_owner
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      post_formUrlEncoded: {
        previous_owner: 'Martin'
      }
    })
  })
})

/**
 * The field 'history' is an object
 *
 * Status is a required field so it is also included
 */
test('Request body using application/x-www-form-urlencoded containing object', () => {
  const query = `mutation {
    post_formUrlEncoded (input: {
      history: {
        data: "Friendly"
      }
      status: "healthy"
    }) {
      history {
        data
      }
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      post_formUrlEncoded: {
        history: {
          data: 'Friendly'
        }
      }
    })
  })
})

test('Request body using application/x-www-form-urlencoded containing object with no properties', () => {
  const query = `mutation {
    post_formUrlEncoded (input: {
      history2: {
        data: "Friendly"
      }
      status: "healthy"
    }) {
      history2
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      post_formUrlEncoded: {
        history2: {
          data: 'Friendly'
        }
      }
    })
  })
})

/**
 * '/cars/{id}' should create a 'cars_by_id' field
 *
 * Also the path parameter just contains the term 'id'
 */
test('inferResourceNameFromPath() field with simple plural form', () => {
  const query = `{
    cars_by_id (id: "Super Speed")
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      cars_by_id: 'Car ID: Super Speed'
    })
  })
})

/**
 * '/cacti/{cactusId}' should create an 'cacti_by_cactusId' field
 *
 * Also the path parameter is the combination of the singular form and 'id'
 */
test('inferResourceNameFromPath() field with irregular plural form', () => {
  const query = `{
    cacti_by_cactusId (cactusId: "Spikey")
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      cacti_by_cactusId: 'Cactus ID: Spikey'
    })
  })
})

/**
 * '/eateries/{eatery}/breads/{breadName}/dishes/{dishKey}/ should create an
 * 'eateryBreadDish' field
 *
 * The path parameters are the singular form, some combination with the term
 * 'name', and some combination with the term 'key'
 */
test('inferResourceNameFromPath() field with long path', () => {
  const query = `{
    eateries_by_eatery_breads_by_breadName_dishes_by_dishKey(eatery: "Mike's", breadName: "challah", dishKey: "bread pudding")
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      eateries_by_eatery_breads_by_breadName_dishes_by_dishKey: "Parameters combined: Mike's challah bread pudding"
    })
  })
})

/**
 * '/nestedReferenceInParameter' contains a query parameter 'russianDoll' that
 * contains reference to a component schema.
 */
test('Nested reference in parameter schema', () => {
  const query = `{
    nestedReferenceInParameter(russianDoll: {
      name: "Gertrude",
      nestedDoll: {
        name: "Tatiana",
        nestedDoll: {
          name: "Lidia"
        }
      }
    })
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      nestedReferenceInParameter: 'Gertrude, Tatiana, Lidia'
    })
  })
})

/**
 * 'POST inputUnion' has a request body that contains a oneOf. The request body
 * will be converted into an input object type while the oneOf will be turned
 * into a union type. However, according to the spec, input object types cannot
 * be composed of unions. We create an input type with `@oneOf` directive which
 * annotates that type as an input union.
 */
test('Input object types composed of union types should default to arbitrary JSON type', () => {
  const query = `{
    __type(name: "Mutation") {
      fields {
        name
        args {
          name
          type {
            name
          }
        }
      }
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(
      (result.data['__type'] as any).fields.find(
        (field) => field.name === 'post_inputUnion'
      )
    ).toEqual({
      name: 'post_inputUnion',
      args: [
        {
          name: 'port',
          type: {
            name: 'String'
          },
        },
        {
          name: "basePath",
          type: {
            name: "String",
          },
        },
        {
          name: "input",
          type: {
            name: "post_inputUnion_request_Input",
          },
        },
      ]
    })
  })
})

/**
 * GET /strictGetOperation should not receive a Content-Type header
 */
test('Get operation should not receive Content-Type', () => {
  const query = `{
    strictGetOperation
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      strictGetOperation: 'Perfect!'
    })
  })
})

/**
 * GET /noResponseSchema does not have a response schema
 */
test('Handle no response schema1', () => {
  const query = `{
    noResponseSchema
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      noResponseSchema: 'Hello world'
    })
  })
})


/**
 * GET /testLinkWithNonStringParam has a link object that has a non-string 
 * parameter
 */
 test('Handle no response schema2', () => {
  const query = `{
    testLinkWithNonStringParam {
      hello
      return5
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      testLinkWithNonStringParam: {
        hello: "world",
        return5: 5
      }
    })
  })
})

/**
 * GET /testLinkwithNestedParam has a link object that has a nested 
 * parameter
 */
 test('Handle no response schema3', () => {
  const query = `{
    testLinkwithNestedParam{
      nesting1 {
        nesting2
      }
      returnNestedNumber
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result.data).toEqual({
      testLinkwithNestedParam: {
        nesting1: {
          nesting2: 5
        },
        returnNestedNumber: 5
      }
    })
  })
})
