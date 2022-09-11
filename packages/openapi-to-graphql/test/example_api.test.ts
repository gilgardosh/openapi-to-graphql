// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import 'json-bigint-patch';
import { graphql, GraphQLInputObjectTypeConfig, GraphQLObjectTypeConfig, GraphQLSchema, OperationTypeNode, parse, validate } from 'graphql'
import { afterAll, beforeAll, expect, test } from '@jest/globals'

import * as openAPIToGraphQL from '../src/index'
import { Options } from '../src/types'
import { startServer, stopServer } from './example_api_server'

const oas = require('./fixtures/example_oas.json')
const PORT = 3002
// Update PORT for this test case:
oas.servers[0].variables.port.default = String(PORT)

let createdSchema: GraphQLSchema

// Set up the schema first and run example API server
beforeAll(() => {
  return Promise.all([
    openAPIToGraphQL
      .createGraphQLSchema(oas, {
        fillEmptyResponses: true
      })
      .then(({ schema, report }) => {
        createdSchema = schema
      }),
    startServer(PORT)
  ])
})

// Shut down API server
afterAll(() => {
  return stopServer()
})

test('Get descriptions', () => {
  // Get all the descriptions of the fields on the GraphQL object type Car
  const query = `{
    __type(name: "car") {
      name
      fields {
        description
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        __type: {
          name: 'car',
          fields: [
            {
              description: 'The model of the car.'
            },
            {
              description: 'The color of the car.'
            },
            {
              description: null
            },
            {
              description: 'Arbitrary (string) tags describing an entity.'
            },
            {
              description: null
            },
            {
              description: 'The rating of the car.'
            }
          ]
        }
      }
    })
  })
})

test('Get resource (incl. enum)', () => {
  // Status is an enum
  const query = `{
    getUserByUsername (username: "arlene") {
      name
      status
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: { getUserByUsername: { name: 'Arlene L McMahon', status: 'staff' } }
    })
  })
})

test('Get resource 2', () => {
  const query = `{
    getCompanyById (id: "binsol") {
      legalForm
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({ data: { getCompanyById: { legalForm: 'public' } } })
  })
})

// OAS allows you to define response objects with HTTP code with the XX wildcard syntax
test('Get resource with status code: 2XX', () => {
  const query = `{
    getPapers {
      name
      published
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getPapers: [
          { name: 'Deliciousness of apples', published: true },
          { name: 'How much coffee is too much coffee?', published: false },
          {
            name: 'How many tennis balls can fit into the average building?',
            published: true
          }
        ]
      }
    })
  })
})

/**
 * Some operations do not have a response body. The option fillEmptyResponses
 * allows OpenAPI-to-GraphQL to handle these cases.
 */
test('Get resource with no response schema and status code: 204 and fillEmptyResponses', () => {
  const query = `{
    getBonuses
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getBonuses: ''
      }
    })
  })
})

// Link objects in the OAS allow OpenAPI-to-GraphQL to create nested GraphQL objects that resolve on different API calls
test('Get nested resource via link $response.body#/...', () => {
  const query = `{
    getUserByUsername (username: "arlene") {
      name
      employerCompany {
        legalForm
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          name: 'Arlene L McMahon',
          employerCompany: {
            legalForm: 'public'
          }
        }
      }
    })
  })
})

test('Get nested resource via link $request.path#/... and $request.query#/', () => {
  const query = `{
    get_product_with_id (product_id: "123" product_tag: "blah") {
      product_name
      reviews {
        text
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        get_product_with_id: {
          product_name: 'Super Product',
          reviews: [{ text: 'Great product' }, { text: 'I love it' }]
        }
      }
    })
  })
})

// Both an operationId and an operationRef can be used to create a link object
test('Get nested resource via link operationRef', () => {
  const query = `{
    get_product_with_id (product_id: "123" product_tag: "blah") {
      product_name
      reviewsWithOperationRef {
        text
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        get_product_with_id: {
          product_name: 'Super Product',
          reviewsWithOperationRef: [
            { text: 'Great product' },
            { text: 'I love it' }
          ]
        }
      }
    })
  })
})

test('Get nested lists of resources', () => {
  const query = `{
    getUserByUsername(username: "arlene") {
      name
      friends {
        name
        friends {
          name
          friends {
            name
          }
        }
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          name: 'Arlene L McMahon',
          friends: [
            {
              name: 'William B Ropp',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                }
              ]
            },
            {
              name: 'John C Barnes',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                }
              ]
            },
            {
              name: 'Heather J Tate',
              friends: [
                {
                  name: 'William B Ropp',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'John C Barnes',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                },
                {
                  name: 'Heather J Tate',
                  friends: [
                    {
                      name: 'William B Ropp'
                    },
                    {
                      name: 'John C Barnes'
                    },
                    {
                      name: 'Heather J Tate'
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    })
  })
})

// Links can be defined with some parameters as constants or variables
test('Link parameters as constants and variables', () => {
  const query = `{
    getScanner(query: "hello") {
      body
      basicLink{
        body
      }
      variableLink{
        body
      }
      constantLink{
        body
      }
      everythingLink{
        body
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getScanner: {
          body: 'hello',
          basicLink: {
            body: 'hello'
          },
          variableLink: {
            body: '_hello_hellohelloabchello123'
          },
          constantLink: {
            body: '123'
          },
          everythingLink: {
            body:
              'http://localhost:3002/api/scanner_GET_200_hello_application/json_close'
          }
        }
      }
    })
  })
})

test('Nested links with constants and variables', () => {
  const query = `{
    getScanner(query: "val") {
      body
      basicLink{
        body
        basicLink{
          body
          basicLink{
            body
          }
        }
      }
      variableLink{
        body
        constantLink{
          body
          everythingLink{
            body
            everythingLink{
              body
            }
          }
        }
      }
      constantLink{
        body
      }
      everythingLink{
        body
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getScanner: {
          body: 'val',
          basicLink: {
            body: 'val',
            basicLink: {
              body: 'val',
              basicLink: {
                body: 'val'
              }
            }
          },
          variableLink: {
            body: '_val_valvalabcval123',
            constantLink: {
              body: '123',
              everythingLink: {
                body:
                  'http://localhost:3002/api/copier_GET_200_123_application/json_close',
                everythingLink: {
                  body:
                    'http://localhost:3002/api/copier_GET_200_http://localhost:3002/api/copier_GET_200_123_application/json_close_application/json_close'
                }
              }
            }
          },
          constantLink: {
            body: '123'
          },
          everythingLink: {
            body:
              'http://localhost:3002/api/scanner_GET_200_val_application/json_close'
          }
        }
      }
    })
  })
})

test('Link parameters as constants and variables with request payload', () => {
  const query = `mutation {
    postScanner(query: "query", path: "path", input: "body") {
      body
      everythingLink2 {
        body
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        postScanner: {
          body: 'req.body: body, req.query.query: query, req.path.path: path',
          everythingLink2: {
            body:
              'http://localhost:3002/api/scanner/path_POST_200_body_query_path_application/json_req.body: body, req.query.query: query, req.path.path: path_query_path_close'
          }
        }
      }
    })
  })
})

test('Get response without providing parameter with default value', () => {
  const query = `{
    getProductReviews (id: "100") {
      text
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getProductReviews: [{ text: 'Great product' }, { text: 'I love it' }]
      }
    })
  })
})

test('Get response with header parameters', () => {
  const query = `{
    getSnack(snack_type: chips, snack_size: small)
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getSnack: 'Here is a small chips'
      }
    })
  })
})

/**
 * Content-type and accept headers should not change because they are
 * linked to GraphQL object types with static schemas
 */
test('Get JSON response even with non-JSON accept header', () => {
  const query = `{
    getOffice (id: 2) {
      employerId
      room_number,
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getOffice: {
          employerId: 'binsol',
          room_number: 102
        }
      }
    })
  })
})

test('Get response with cookies', () => {
  const query = `{
    getCookie (cookie_type: chocolate_chip, cookie_size: mega_sized)
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getCookie: `You ordered a mega-sized chocolate chip cookie!`
      }
    })
  })
})

/**
 * GraphQL (input) object type also consider the preferred name when generating
 * a name
 */
test('Ensure good naming for operations with duplicated schemas', () => {
  const query = `query {
    getNumberOfCleanDesks
    getNumberOfDirtyDesks
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getNumberOfCleanDesks: '5 clean desks',
        getNumberOfDirtyDesks: '5 dirty desks'
      }
    })
  })
})

/**
 * CASE: 64 bit int - return number instead of integer, leading to use of
 * GraphQLFloat, which can support 64 bits:
 */
test('Get response containing 64-bit integer (using GraphQLBigInt)', () => {
  const query = `{
    getProductReviews (id: "100") {
      timestamp
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getProductReviews: [
          { timestamp: BigInt('1502787600000000') },
          { timestamp: BigInt('1502787400000000') }
        ]
      }
    })
  })
})

test('Get array of strings', () => {
  const query = `{
    getUserByUsername (username: "arlene") {
      hobbies
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          hobbies: ['tap dancing', 'bowling']
        }
      }
    })
  })
})

test('Get array of objects', () => {
  const query = `{
    getCompanyById (id: "binsol") {
      offices{
        street
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getCompanyById: {
          offices: [
            {
              street: '122 Elk Rd Little'
            },
            {
              street: '124 Elk Rd Little'
            }
          ]
        }
      }
    })
  })
})

test('Get single resource', () => {
  const query = `{
    getUserByUsername(username: "arlene"){
      name
      address{
        street
      },
      address2{
        city
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          name: 'Arlene L McMahon',
          address: {
            street: '4656 Cherry Camp Road'
          },
          address2: {
            city: 'Macomb'
          }
        }
      }
    })
  })
})

test('Post resource', () => {
  const query = `mutation {
    postUser (input: {
      name: "Mr. New Guy"
      address: {
        street: "Home streeet 1"
        city: "Hamburg"
      }
      employerId: "binsol"
      hobbies: "soccer"
    }) {
      name
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        postUser: {
          name: 'Mr. New Guy'
        }
      }
    })
  })
})

test('Post resource and get nested resource back', () => {
  const query = `mutation {
    postUser (input: {
      name: "Mr. New Guy"
      address: {
        street: "Home streeet 1"
        city: "Hamburg"
      }
      employerId: "binsol"
      hobbies: "soccer"
    }) {
      name
      employerCompany {
        ceoUser {
          name
        }
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        postUser: {
          name: 'Mr. New Guy',
          employerCompany: {
            ceoUser: {
              name: 'John C Barnes'
            }
          }
        }
      }
    })
  })
})

test('Post resource with non-application/json content-type request and response bodies', () => {
  const query = `mutation {
    postPaper(input: "happy")
  }`
  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        postPaper: 'You sent the paper idea: happy'
      }
    })
  })
})

test(
  'Operation id is correctly sanitized, schema names and fields are ' +
    'correctly sanitized, path and query parameters are correctly sanitized, ' +
    'received data is correctly sanitized',
  () => {
    const query = `{
      get_product_with_id(product_id: "this-path", product_tag: "And a tag") {
        product_id
        product_tag
      }
    }`

    return graphql({ schema: createdSchema, source: query }).then((result) => {
      expect(result).toEqual({
        data: {
          get_product_with_id: {
            product_id: 'this-path',
            product_tag: 'And a tag'
          }
        }
      })
    })
  }
)

test('Request data is correctly de-sanitized to be sent', () => {
  const query = `mutation {
    post_product_with_id (input: {
      product_name: "Soccer ball"
      product_id: "ball123"
      product_tag:"sports"
    }) {
      product_name
      product_id
      product_tag
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        post_product_with_id: {
          product_name: 'Soccer ball',
          product_id: 'ball123',
          product_tag: 'sports'
        }
      }
    })
  })
})

test('Fields with arbitrary JSON (e.g., maps) can be returned', () => {
  // Testing additionalProperties field in schemas
  const query = `{
    getAllCars {
      tags
    }
  }`

  // Testing empty properties field
  const query2 = `{
    getAllCars {
      features
    }
  }`

  const promise = graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getAllCars: [
          {
            tags: null
          },
          {
            tags: {
              speed: 'extreme'
            }
          },
          {
            tags: {
              impression: 'decadent',
              condition: 'slightly beat-up'
            }
          },
          {
            tags: {
              impression: 'decadent'
            }
          }
        ]
      }
    })
  })

  const promise2 = graphql({ schema: createdSchema, source: query2, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getAllCars: [
          {
            features: {
              color: 'banana yellow to be specific'
            }
          },
          {
            features: null
          },
          {
            features: null
          },
          {
            features: null
          }
        ]
      }
    })
  })

  return Promise.all([promise, promise2])
})

test('Capitalized enum values can be returned', () => {
  const query = `{
    getUserCar (username: "arlene") {
      kind
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserCar: {
          kind: 'SEDAN'
        }
      }
    })
  })
})

test('Enum values that started as numbers in OAS can be returned as strings', () => {
  const query = `{
    getUserCar (username: "arlene") {
      rating
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserCar: {
          rating: '_100'
        }
      }
    })
  })
})

test('Define header and query options', () => {
  const options: Options<any, any, any> = {
    headers: {
      exampleHeader: 'some-value'
    },
    qs: {
      limit: '30'
    }
  }

  const query = `{
    get_Status (globalquery: "test")
  }`
  return openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      // validate that 'limit' parameter is covered by options:
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query}).then((result) => {
        expect(result).toEqual({
          data: {
            get_Status: 'Ok'
          }
        })
      })
    })
})

test('Resolve simple allOf', () => {
  const query = `{
    getUserByUsername (username: "arlene") {
      name
      nomenclature {
        genus
        species
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          name: 'Arlene L McMahon',
          nomenclature: {
            genus: 'Homo',
            species: 'sapiens'
          }
        }
      }
    })
  })
})

// The $ref is contained in the suborder field
test('Resolve ref in allOf', () => {
  const query = `{
    getUserByUsername (username: "arlene") {
      name
      nomenclature {
        suborder
        genus
        species
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          name: 'Arlene L McMahon',
          nomenclature: {
            suborder: 'Haplorhini',
            genus: 'Homo',
            species: 'sapiens'
          }
        }
      }
    })
  })
})

// The nested allOf is contained in the family field
test('Resolve nested allOf', () => {
  const query = `{
    getUserByUsername (username: "arlene") {
      name
      nomenclature {
        family
        genus
        species
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getUserByUsername: {
          name: 'Arlene L McMahon',
          nomenclature: {
            family: 'Hominidae',
            genus: 'Homo',
            species: 'sapiens'
          }
        }
      }
    })
  })
})

// The circular nested allOf is contained in the familyCircular field
test('Resolve circular allOf', () => {
  const query = `{
    __type(name: "familyObject") {
      fields {
        name
        type {
          name
        }
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(
      (result.data['__type'] as any)['fields'].find((field) => {
        return field.name === 'familyCircular'
      })
    ).toEqual({
      name: 'familyCircular',
      type: {
        name: 'familyObject'
      }
    })
  })
})

test('Resolve oneOf, which becomes a union type', () => {
  const query = `{
    __type(name: "query_getAllAssets_items") {
      kind
      possibleTypes {
        name
        description
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    type carType = {
      name: string
      description: string
    }

    // Sort result because the order of the possibleTypes can change depending on Node version
    const possibleTypes = result['data']['__type']['possibleTypes'] as carType[]
    possibleTypes.sort((a, b) => {
      return a.name.localeCompare(b.name)
    })

    expect(result).toEqual({
      data: {
        __type: {
          kind: 'UNION',
          possibleTypes: [
            {
              name: 'car',
              description: 'A car'
            },
            {
              name: 'trashcan',
              description: null
            },
            {
              name: 'user',
              description: 'A user represents a natural person'
            }
          ]
        }
      }
    })
  })
})

test('Union type', () => {
  const query = `{
    getAllAssets(companyId: "binsol") {
      ... on user {
        name
        address {
          city
        }
      }
      ... on trashcan {
        contents
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
    expect(result).toEqual({
      data: {
        getAllAssets: [
          {
            name: 'Arlene L McMahon',
            address: {
              city: 'Elk Grove Village'
            }
          },
          {},
          {
            contents: [
              {
                type: 'apple',
                message: 'Half-eaten'
              },
              {
                type: 'sock',
                message: 'Lost one'
              }
            ]
          },
          {
            name: 'William B Ropp',
            address: {
              city: 'Macomb'
            }
          },
          {},
          {
            contents: [
              {
                type: 'sock',
                message: 'Lost one'
              }
            ]
          },
          {
            name: 'John C Barnes',
            address: {
              city: 'Tucson'
            }
          },
          {},
          {
            contents: []
          }
        ]
      }
    })
  })
})

// Extensions provide more information about failed API calls
test('Error contains extension', () => {
  const query = `query {
    getUserByUsername(username: "abcdef") {
      name
    }
  }`

  return graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((error) => {
    const extensions = error.errors[0].extensions
    expect(extensions).toBeDefined()

    // Remove headers because it contains fields that may change from run to run
    delete extensions.responseHeaders
    expect(extensions).toEqual({
      method: 'GET',
      statusCode: 404,
      responseBody: {
        message: 'Wrong username'
      },
      statusText: 'Not Found',
      url: 'http://localhost:3002/api/users/abcdef'
    })
  })
})

test('Option provideErrorExtensions should prevent error extensions from being created', () => {
  const options: Options<any, any, any> = {
    provideErrorExtensions: false
  }

  const query = `query {
    getUserByUsername(username: "abcdef") {
      name
    }
  }`

  return openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query}).then((result) => {
        expect(result).toEqual({
          errors: [
            {
              message: 'Could not invoke operation GET /users/{username}',
              locations: [
                {
                  line: 2,
                  column: 5
                }
              ],
              path: ['user']
            }
          ],
          data: {
            user: null
          }
        })
      })
    })
})

test('Option customResolver', () => {
  const options: Options<any, any, any> = {
    customResolvers: {
      'Example API': {
        '/users/{username}': {
          get: () => {
            return {
              name: 'Jenifer Aldric'
            }
          }
        }
      }
    }
  }

  const query = `query {
    getUserByUsername(username: "abcdef") {
      name
    }
  }`

  return openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query}).then((result) => {
        expect(result).toEqual({
          data: {
            getUserByUsername: {
              name: 'Jenifer Aldric'
            }
          }
        })
      })
    })
})

test('Option customResolver with links', () => {
  const options: Options<any, any, any> = {
    customResolvers: {
      'Example API': {
        '/users/{username}': {
          get: () => {
            return {
              name: 'Jenifer Aldric',
              employerId: 'binsol'
            }
          }
        }
      }
    }
  }

  const query = `query {
    getUserByUsername(username: "abcdef") {
      name
      employerId
      employerCompany {
        name
        ceoUsername
        ceoUser {
          name
        }
      }
    }
  }`

  return openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query}).then((result) => {
        expect(result).toEqual({
          data: {
            getUserByUsername: {
              name: 'Jenifer Aldric',
              employerId: 'binsol',
              employerCompany: {
                name: 'Binary Solutions',
                ceoUsername: 'johnny',
                ceoUser: {
                  name: 'Jenifer Aldric'
                }
              }
            }
          }
        })
      })
    })
})

// NOTE: should be replaces with resolver composition
// test('Option customResolver using resolver arguments', () => {
//   const options: Options<any, any, any> = {
//     customResolvers: {
//       'Example API': {
//         '/users/{username}': {
//           get: (obj, args, context, info) => {
//             return {
//               name: args['username']
//             }
//           }
//         }
//       }
//     }
//   }

//   const query = `query {
//     user(username: "abcdef") {
//       name
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(result).toEqual({
//           data: {
//             user: {
//               name: 'abcdef'
//             }
//           }
//         })
//       })
//     })
// })

// NOTE: should be replaces with resolver composition
// test('Option customResolver using resolver arguments that are sanitized', () => {
//   const options: Options<any, any, any> = {
//     customResolvers: {
//       'Example API': {
//         '/products/{product-id}': {
//           get: (obj, args, context, info) => {
//             return {
//               // Note that the argument name is sanitized
//               productName: 'abcdef'
//             }
//           }
//         }
//       }
//     }
//   }

//   const query = `{
//     productWithId (productId: "123" productTag: "blah") {
//       productName
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(result).toEqual({
//           data: {
//             productWithId: {
//               productName: 'abcdef'
//             }
//           }
//         })
//       })
//     })
// })

// NOTE: should be replaces with resolver composition
// test('Option addLimitArgument', () => {
//   const options: Options<any, any, any> = {
//     addLimitArgument: true
//   }

//   const query = `query {
//     user(username: "arlene") {
//       name
//       friends (limit: 3) {
//         name
//         friends (limit: 2) {
//           name
//           friends (limit: 1) {
//             name
//           }
//         }
//       }
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(result).toEqual({
//           data: {
//             user: {
//               name: 'Arlene L McMahon',
//               friends: [
//                 {
//                   name: 'William B Ropp',
//                   friends: [
//                     {
//                       name: 'William B Ropp',
//                       friends: [
//                         {
//                           name: 'William B Ropp'
//                         }
//                       ]
//                     },
//                     {
//                       name: 'John C Barnes',
//                       friends: [
//                         {
//                           name: 'William B Ropp'
//                         }
//                       ]
//                     }
//                   ]
//                 },
//                 {
//                   name: 'John C Barnes',
//                   friends: [
//                     {
//                       name: 'William B Ropp',
//                       friends: [
//                         {
//                           name: 'William B Ropp'
//                         }
//                       ]
//                     },
//                     {
//                       name: 'John C Barnes',
//                       friends: [
//                         {
//                           name: 'William B Ropp'
//                         }
//                       ]
//                     }
//                   ]
//                 },
//                 {
//                   name: 'Heather J Tate',
//                   friends: [
//                     {
//                       name: 'William B Ropp',
//                       friends: [
//                         {
//                           name: 'William B Ropp'
//                         }
//                       ]
//                     },
//                     {
//                       name: 'John C Barnes',
//                       friends: [
//                         {
//                           name: 'William B Ropp'
//                         }
//                       ]
//                     }
//                   ]
//                 }
//               ]
//             }
//           }
//         })
//       })
//     })
// })

// NOTE: the new implementation doesn't support this approach (used to be coordinates instead of getNearestCoffeeMachine)
test('Content property in parameter object', () => {
  const query = `{
    getNearestCoffeeMachine(lat: 3, long: 5) {
      lat,
      long
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getNearestCoffeeMachine: {
          lat: 8,
          long: 10
        }
      }
    })
  })
})

test('Handle objects without defined properties with arbitrary GraphQL JSON type', () => {
  const query = `{
    getOfficeTrashCan(username:"arlene") {
      brand,
      contents
    }
    getAllTrashCans {
      contents
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        getOfficeTrashCan: {
          brand: 'Garbage Emporium',
          contents: [
            {
              type: 'apple',
              message: 'Half-eaten'
            },
            {
              type: 'sock',
              message: 'Lost one'
            }
          ]
        },
        getAllTrashCans: [
          {
            contents: [
              {
                type: 'apple',
                message: 'Half-eaten'
              },
              {
                type: 'sock',
                message: 'Lost one'
              }
            ]
          },
          {
            contents: [
              {
                type: 'sock',
                message: 'Lost one'
              }
            ]
          },
          {
            contents: []
          },
          {
            contents: [
              {
                type: 'tissue',
                message: 'Used'
              }
            ]
          }
        ]
      }
    })
  })
})

test('Handle input objects without defined properties with arbitrary GraphQL JSON type', () => {
  const query = `mutation {
    postOfficeTrashCan(input: {
      type: "sandwich",
      message: "moldy",
      tasteRating: 0
    }, username: "arlene") {
      brand
      contents
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        postOfficeTrashCan: {
          brand: 'Garbage Emporium',
          contents: [
            {
              type: 'apple',
              message: 'Half-eaten'
            },
            {
              type: 'sock',
              message: 'Lost one'
            },
            {
              type: 'sandwich',
              message: 'moldy',
              tasteRating: 0
            }
          ]
        }
      }
    })
  })
})

test('Operation returning arbitrary JSON type should not include _openAPIToGraphQL field', () => {
  const query = `{
    random
  }`

  /**
   * There should only be the random and status fields but no _openAPIToGraphQL
   * field.
   */
  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(result).toEqual({
      data: {
        random: {
          status: 'success'
        }
      }
    })
  })
})

// NOTE: we don't do the "Equivalent" addition
// test('Generate "Equivalent to..." messages', () => {
//   const options: Options<any, any, any> = {
//     // Used to simplify test. Otherwise viewers will polute query/mutation fields.
//     viewer: false
//   }

//   // Check if query/mutation fields have the message
//   const query = `query {
//     __schema {
//       queryType {
//         fields {
//           type {
//             name
//           }
//           description
//         }
//       }
//       mutationType {
//         fields {
//           type {
//             name
//           }
//           description
//         }
//       }
//     }
//   }`

//   const promise = openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         // Make sure all query fields have the message
//         expect(
//           (result.data['__schema'] as any)['queryType']['fields'].every((field) => {
//             return field.description.includes('\n\nEquivalent to GET ')
//           })
//         ).toBe(true)

//         // Make sure all mutation fields have the message
//         expect(
//           (result.data['__schema'] as any)['mutationType']['fields'].every((field) => {
//             return field.description.includes('\n\nEquivalent to ')
//           })
//         ).toBe(true)

//         // Check full message on a particular field
//         expect(
//           (result.data['__schema'] as any)['queryType']['fields'].find((field) => {
//             return field.type.name === 'Car'
//           })
//         ).toEqual({
//           type: {
//             name: 'Car'
//           },
//           description:
//             'Returns a car to test nesting of sub operations\n\nEquivalent to GET /users/{username}/car'
//         })
//       })
//     })

//   // Check link field description
//   const query2 = `query {
//     __type(name: "User") {
//       fields {
//         type {
//           name
//         }
//         description
//       }
//     }
//   }`

//   const promise2 = graphql({ schema: createdSchema, source: query2 }).then((result) => {
//     expect(
//       (result.data['__type'] as any)['fields'].find((field) => {
//         return field.type.name === 'Company'
//       })
//     ).toEqual({
//       type: {
//         name: 'Company'
//       },
//       description:
//         "Allows to fetch the user's employer company.\n\nEquivalent to GET /companies/{id}"
//     })
//   })

//   return Promise.all([promise, promise2])
// })

// NOTE: we don't do the "Equivalent" addition
test('Withhold "Equivalent to..." messages', () => {
  const options: Options<any, any, any> = {
    // Used to simplify test. Otherwise viewers will polute query/mutation fields.
    viewer: false,
    equivalentToMessages: false
  }

  // Check query/mutation field descriptions
  const query = `query {
    __schema {
      queryType {
        fields {
          type {
            name
          }
          description
        }
      }
      mutationType {
        fields {
          type {
            name
          }
          description
        }
      }
    }
  }`

  const promise = openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query}).then((result) => {
        expect(
          (result.data['__schema'] as any)['queryType']['fields'].every((field) => {
            return field.description.includes('\n\nEquivalent to GET ')
          })
        ).toBe(false)

        expect(
          (result.data['__schema'] as any)['mutationType']['fields'].every((field) => {
            return field.description.includes('\n\nEquivalent to ')
          })
        ).toBe(false)
      })
    })

  // Check link field description
  const query2 = `query {
    __type(name: "user") {
      fields {
        type {
          name
        }
        description
      }
    }
  }`

  const promise2 = openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query2 }).then((result) => {
        expect(
          (result.data['__type'] as any)['fields'].find((field) => {
            return field.type.name === 'company'
          })
        ).toEqual({
          type: {
            name: 'company'
          },
          description: "Allows to fetch the user's employer company."
        })
      })
    })

  return Promise.all([
    promise,
    promise2
  ])
})

test('UUID format becomes GraphQL ID type', () => {
  let query = `{
    __type(name: "company") {
      fields {
        name
        type {
          name
          kind
        }
      }
    }
  }`

  return graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(
      (result.data['__type'] as any).fields.find((field) => {
        return field.name === 'id'
      })
    ).toEqual({
      name: 'id',
      type: {
        name: 'UUID',
        kind: 'SCALAR'
      }
    })
  })
})

// NOTE: not available on new implementation
// test('Option idFormats', () => {
//   const options: Options<any, any, any> = {
//     idFormats: ['specialIdFormat']
//   }

//   // Check query/mutation field descriptions
//   const query = `{
//     __type(name: "PatentWithId") {
//       fields {
//         name
//         type {
//           kind
//           ofType {
//             name
//             kind
//           }
//         }
//       }
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(
//           (result.data['__type'] as any).fields.find((field) => {
//             return field.name === 'patentId'
//           })
//         ).toEqual({
//           name: 'patentId',
//           type: {
//             kind: 'NON_NULL',
//             ofType: {
//               name: 'ID',
//               kind: 'SCALAR'
//             }
//           }
//         })
//       })
//     })
// })

test('Required properties for input object types', () => {
  const userInputType = createdSchema.getType('user_Input')

  // The exclamation mark shows that it is a required (non-nullable) property
  expect((userInputType.toConfig() as GraphQLInputObjectTypeConfig).fields['address'].type.toString()).toEqual(
    'address_Input!'
  )
  expect((userInputType.toConfig() as GraphQLInputObjectTypeConfig).fields['address2'].type.toString()).toEqual(
    'address_Input'
  )
})

test('Option selectQueryOrMutationField', () => {
  const query = `{
    __schema {
      queryType {
        fields {
          name
          description
        }
      }
      mutationType {
        fields {
          name
          description
        }
      }
    }
  }`

  // The users field should exist as a Query field
  const promise = graphql({ schema: createdSchema, source: query }).then((result) => {
    expect(
      (result.data['__schema'] as any).queryType.fields.find((field) => {
        return field.name === 'getUserByUsername'
      })
    ).toEqual({
      name: 'getUserByUsername',
      description:
        'Returns a user from the system.'
    })

    expect(
      (result.data['__schema'] as any).mutationType.fields.find((field) => {
        return field.name === 'getUserByUsername'
      })
    ).toEqual(undefined)
  })

  const options: Options<any, any, any> = {
    selectQueryOrMutationField: {
      'Example API': {
        '/users/{username}': {
          get: OperationTypeNode.MUTATION
        }
      }
    }
  }

  // The users (now named getUserByUsername) field should exist as a Mutation field
  const promise2 = openAPIToGraphQL
    .createGraphQLSchema(oas, options)
    .then(({ schema }) => {
      const ast = parse(query)
      const errors = validate(schema, ast)
      expect(errors).toEqual([])
      return graphql({ schema, source: query}).then((result) => {
        expect(
          (result.data['__schema'] as any).queryType.fields.find((field) => {
            return field.name === 'getUserByUsername'
          })
        ).toEqual(undefined)
  
        expect(
          (result.data['__schema'] as any).mutationType.fields.find((field) => {
            return field.name === 'getUserByUsername'
          })
        ).toEqual({
          name: 'getUserByUsername',
          description:
            'Returns a user from the system.'
        })
      })
    })

  return Promise.all([promise, promise2])
})

// NOTE: new implementation does creat an optional argument, and overrides the options-provided header if argument is provided
// test('Header arguments are not created when they are provided through headers option', () => {
//   // The GET snack operation has a snack_type and snack_size header arguments
//   const options: Options<any, any, any> = {
//     headers: {
//       snack_type: 'chips',
//       snack_size: 'large'
//     }
//   }

//   const query = `{
//     __schema {
//       queryType {
//         fields {
//           name
//           args {
//             name
//           }
//         }
//       }
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(
//           (result.data['__schema'] as any).queryType.fields.find((field) => {
//             return field.name === 'snack'
//           })
//         ).toEqual({
//           name: 'snack',
//           args: [] // No arguments
//         })
//       })
//     })
// })

// NOTE: new implementation does creat an optional argument, and overrides the options-provided header if argument is provided
// test('Header arguments are not created when they are provided through requestOptions option', () => {
//   // The GET snack operation has a snack_type and snack_size header arguments
//   const options: Options<any, any, any> = {
//     requestOptions: {
//       headers: {
//         snack_type: 'chips',
//         snack_size: 'large'
//       }
//     }
//   }

//   const query = `{
//     __schema {
//       queryType {
//         fields {
//           name
//           args {
//             name
//           }
//         }
//       }
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(
//           (result.data['__schema'] as any).queryType.fields.find((field) => {
//             return field.name === 'snack'
//           })
//         ).toEqual({
//           name: 'snack',
//           args: [] // No arguments
//         })
//       })
//     })
// })

// NOTE: new implementation does creat an optional argument, and overrides the options-provided query param if argument is provided
// // NOTE: This only tests how requestOptions affects schema creation, not resolver creation
// test('Query string arguments are not created when they are provided through qs option', () => {
//   // The GET status operation has a limit query string parameter
//   const options: Options<any, any, any> = {
//     qs: {
//       limit: '10'
//     }
//   }

//   const query = `{
//     __schema {
//       queryType {
//         fields {
//           name
//           args {
//             name
//           }
//         }
//       }
//     }
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(
//           (result.data['__schema'] as any).queryType.fields.find((field) => {
//             return field.name === 'users'
//           })
//         ).toEqual({
//           name: 'users',
//           args: [] // No arguments
//         })
//       })
//     })
// })

// NOTE: new implementation does creat an optional argument, and overrides the options-provided query param if argument is provided
// test('Query string arguments are not created when they are provided through requestOptions option', () => {
//   const query = `{
//     users(limit: 10) {
//       name
//     }
//   }`

//   const promise = graphql({ schema: createdSchema, source: query, rootValue: null, contextValue: {} }).then((result) => {
//     expect(result).toEqual({
//       data: {
//         users: [
//           {
//             name: 'Arlene L McMahon'
//           },
//           {
//             name: 'William B Ropp'
//           },
//           {
//             name: 'John C Barnes'
//           },
//           {
//             name: 'Heather J Tate'
//           }
//         ]
//       }
//     })
//   })

//   // The GET status operation has a limit query string parameter
//   const options: Options<any, any, any> = {
//     requestOptions: {
//       qs: {
//         limit: '10'
//       }
//     }
//   }

//   const query2 = `{
//     users {
//       name
//     }
//   }`

//   const promise2 = openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query2)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query2 }).then((result) => {
//         expect(result).toEqual({
//           data: {
//             users: [
//               {
//                 name: 'Arlene L McMahon'
//               },
//               {
//                 name: 'William B Ropp'
//               },
//               {
//                 name: 'John C Barnes'
//               },
//               {
//                 name: 'Heather J Tate'
//               }
//             ]
//           }
//         })
//       })
//     })

//   return Promise.all([promise, promise2])
// })

// NOTE: new implementation does not handle function as header option
// test('Use headers option as function', () => {
//   const options: Options<any, any, any> = {
//     headers: (method, path, title) => {
//       if (method === 'get' && path === '/snack') {
//         return {
//           snack_type: 'chips',
//           snack_size: 'small'
//         }
//       }
//     }
//   }

//   const query = `{
//     snack
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(result).toEqual({
//           data: {
//             snack: 'Here is a small chips'
//           }
//         })
//       })
//     })
// })

// NOTE: new implementation does not handle function as header option
// test('Use requestOptions headers option as function', () => {
//   const options: Options<any, any, any> = {
//     requestOptions: {
//       headers: (method, path, title) => {
//         if (method === 'get' && path === '/snack') {
//           return {
//             snack_type: 'chips',
//             snack_size: 'small'
//           }
//         }
//       }
//     }
//   }

//   const query = `{
//     snack
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(result).toEqual({
//           data: {
//             snack: 'Here is a small chips'
//           }
//         })
//       })
//     })
// })

test('Non-nullable properties for object types', () => {
  const coordinates = createdSchema.getType('coordinates')

  // The exclamation mark shows that it is a required (non-nullable) property
  expect((coordinates.toConfig() as GraphQLObjectTypeConfig<any, any>).fields['lat'].type.toString()).toEqual('Float!')
  expect((coordinates.toConfig() as GraphQLObjectTypeConfig<any, any>).fields['long'].type.toString()).toEqual('Float!')
})

// NOTE: New implementation simply uses "input" for all cases
// test('Option genericPayloadArgName', () => {
//   const query = `{
//     __schema {
//       mutationType {
//         fields {
//           name
//           args {
//             name
//           }
//         }
//       }
//     }
//   }`

//   // The postUser field should have a userInput argument
//   const promise = graphql({ schema: createdSchema, source: query }).then((result) => {
//     expect(
//       (result.data['__schema'] as any).mutationType.fields.find((field) => {
//         return field.name === 'postUser'
//       })
//     ).toEqual({
//       name: 'postUser',
//       args: [
//         {
//           name: 'userInput'
//         }
//       ]
//     })
//   })

//   const options: Options<any, any, any> = {
//     genericPayloadArgName: true
//   }

//   // The postUser field should now have a requestPody argument
//   const promise2 = openAPIToGraphQL
//     .createGraphQLSchema(oas, options)
//     .then(({ schema }) => {
//       const ast = parse(query)
//       const errors = validate(schema, ast)
//       expect(errors).toEqual([])
//       return graphql({ schema, source: query}).then((result) => {
//         expect(
//           (result.data['__schema'] as any).mutationType.fields.find((field) => {
//             return field.name === 'postUser'
//           })
//         ).toEqual({
//           name: 'postUser',
//           args: [
//             {
//               name: 'requestBody'
//             }
//           ]
//         })
//       })
//     })

//   return Promise.all([promise, promise2])
// })

test('Non-nullable properties from nested allOf', () => {
  // Check query/mutation field descriptions
  const query = `{
    __type(name: "query_getUsers_items_nomenclature") {
      fields {
        name
        type {
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
  }`

  return openAPIToGraphQL.createGraphQLSchema(oas).then(({ schema }) => {
    const ast = parse(query)
    const errors = validate(schema, ast)
    expect(errors).toEqual([])
    return graphql({ schema, source: query}).then((result) => {
      expect(
        (result.data['__type'] as any).fields.find((field) => {
          return field.name === 'family'
        })
      ).toEqual({
        name: 'family',
        type: {
          kind: 'NON_NULL',
          ofType: {
            name: 'String',
            kind: 'SCALAR'
          }
        }
      })
    })
  })
})

test('Format the query params appropriately when style and explode are set to true', async () => {
  const LIMIT = 10
  const OFFSET = 0

  const query = `
    query {
      returnAllOffices(parameters: { limit: ${LIMIT}, offset: ${OFFSET} }) {
        room_number
        company {
          id
        }
      }
    }
  `

  await graphql({ schema: createdSchema, source: query }).then((result) => {
    // target error field because the corresponding server url is not implemented,
    // also we get the full request url as in failed request errors
    result.errors.forEach((error) => {
      expect(error.extensions?.url).toBeDefined();

      const url = new URL(error.extensions.url as string)

      expect(url.searchParams.has('limit')).toBe(true)
      expect(url.searchParams.get('limit')).toBe(String(LIMIT))
      expect(url.searchParams.has('offset')).toBe(true)
      expect(url.searchParams.get('offset')).toBe(String(OFFSET))
    })
  })
})
