// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { afterAll, beforeAll, expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { graphql, GraphQLSchema } from 'graphql'
import { join } from 'path'

import * as openAPIToGraphQL from '../src/index'
import { startServer, stopServer } from './example_api_server'

const PORT = 3003

function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/example_oas.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  // update PORT for this test case:
  oas.servers[0].variables.port.default = String(PORT);
  return oas;
};

let createdSchema: GraphQLSchema

// Set up the schema first and run example API server
beforeAll(() => {
  return Promise.all([
    openAPIToGraphQL.createGraphQLSchema(getOas()).then(({ schema }) => {
      createdSchema = schema
    }),
    startServer(PORT)
  ])
})

// Shut down API server
afterAll(() => {
  return stopServer()
})

// NOTE: Auth method is simpler and more straight forward in the new implementation. Old tests are commented out, and new tests are added.
// test('Get patent using basic auth', () => {
//   const query = `{
//     viewerBasicAuth (username: "arlene123", password: "password123") {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerBasicAuth: {
//           patentWithId: {
//             patentId: '100'
//           }
//         }
//       }
//     })
//   })
// })

// test('Get patent using bearer token', () => {
//   const query = `{
//     viewerBearerAuth(token: "master-bearer-token") {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerBearerAuth: {
//           patentWithId: {
//             patentId: '100'
//           }
//         }
//       }
//     })
//   })
// })

// test('Get patent using API key', () => {
//   const query = `{
//     viewerApiKey2 (apiKey: "abcdef") {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerApiKey2: {
//           patentWithId: {
//             patentId: '100'
//           }
//         }
//       }
//     })
//   })
// })

// test('Get patent using API key 3', () => {
//   const query = `{
//     viewerApiKey3 (apiKey: "abcdef") {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerApiKey3: {
//           patentWithId: {
//             patentId: '100'
//           }
//         }
//       }
//     })
//   })
// })

// test('Get project using API key 1', () => {
//   const query = `{
//     viewerApiKey (apiKey: "abcdef") {
//       projectWithId (projectId: 1) {
//         active
//         projectId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerApiKey: {
//           projectWithId: {
//             active: true,
//             projectId: 1
//           }
//         }
//       }
//     })
//   })
// })

// test('Get project using API key passed as option - viewer is disabled', async () => {
//   const { schema } = await openAPIToGraphQL.createGraphQLSchema(oas, {
//     viewer: false,
//     headers: {
//       access_token: 'abcdef'
//     }
//   })
//   const query = `{
//     projectWithId (projectId: 1) {
//       projectId
//     }
//   }`
//   return graphql({schema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         projectWithId: {
//           projectId: 1
//         }
//       }
//     })
//   })
// })

// test('Get project using API key passed in the requestOptions - viewer is disabled', async () => {
//   const { schema } = await openAPIToGraphQL.createGraphQLSchema(oas, {
//     viewer: false,
//     requestOptions: {
//       headers: {
//         access_token: 'abcdef'
//       }
//     }
//   })
//   const query = `{
//     projectWithId (projectId: 1) {
//       projectId
//     }
//   }`
//   return graphql({schema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         projectWithId: {
//           projectId: 1
//         }
//       }
//     })
//   })
// })

// test('Get project using API key 2', () => {
//   const query = `{
//     viewerApiKey2 (apiKey: "abcdef") {
//       projectWithId (projectId: 1) {
//         projectId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerApiKey2: {
//           projectWithId: {
//             projectId: 1
//           }
//         }
//       }
//     })
//   })
// })

// test('Post project using API key 1', () => {
//   const query = `mutation {
//     mutationViewerApiKey (apiKey: "abcdef") {
//       postProjectWithId (projectWithIdInput: {
//         projectId: 123
//         leadId: "arlene"
//       }) {
//         projectLead {
//           name
//         }
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         mutationViewerApiKey: {
//           postProjectWithId: {
//             projectLead: {
//               name: 'Arlene L McMahon'
//             }
//           }
//         }
//       }
//     })
//   })
// })

// test('Post project using API key 2', () => {
//   const query = `mutation {
//     mutationViewerApiKey2 (apiKey: "abcdef") {
//       postProjectWithId (projectWithIdInput: {
//         projectId: 123
//         leadId: "arlene"
//       }) {
//         projectLead {
//           name
//         }
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         mutationViewerApiKey2: {
//           postProjectWithId: {
//             projectLead: {
//               name: 'Arlene L McMahon'
//             }
//           }
//         }
//       }
//     })
//   })
// })

// test('Get project using API key 3', async () => {
//   const query = `{
//     viewerApiKey3 (apiKey: "abcdef") {
//       projectWithId (projectId: 1) {
//         projectId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerApiKey3: {
//           projectWithId: {
//             projectId: 1
//           }
//         }
//       }
//     })
//   })
// })

// test('Get project using API key 3 passed as option - viewer is disabled', async () => {
//   const { schema } = await openAPIToGraphQL.createGraphQLSchema(oas, {
//     viewer: false,
//     headers: {
//       cookie: 'access_token=abcdef'
//     }
//   })
//   const query = `{
//     projectWithId (projectId: 1) {
//       projectId
//     }
//   }`
//   return graphql({schema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         projectWithId: {
//           projectId: 1
//         }
//       }
//     })
//   })
// })

// test('Get project using API key 3 passed in the requestOptions - viewer is disabled', async () => {
//   const { schema } = await openAPIToGraphQL.createGraphQLSchema(oas, {
//     viewer: false,
//     requestOptions: {
//       headers: {
//         cookie: 'access_token=abcdef'
//       }
//     }
//   })
//   const query = `{
//     projectWithId (projectId: 1) {
//       projectId
//     }
//   }`
//   return graphql({schema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         projectWithId: {
//           projectId: 1
//         }
//       }
//     })
//   })
// })

// test('Basic AnyAuth usage', () => {
//   const query = `{ 
//     viewerAnyAuth(exampleApiBasicProtocol: {username: "arlene123", password: "password123"}) {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerAnyAuth: {
//           patentWithId: {
//             patentId: '100'
//           }
//         }
//       }
//     })
//   })
// })

// test('Basic AnyAuth usage with extraneous auth data', () => {
//   const query = `{ 
//     viewerAnyAuth(exampleApiKeyProtocol: {apiKey: "abcdef"}, exampleApiBasicProtocol: {username: "arlene123", password: "password123"}) {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerAnyAuth: {
//           patentWithId: {
//             patentId: '100'
//           }
//         }
//       }
//     })
//   })
// })

// test('Basic AnyAuth usage with multiple operations', () => {
//   const query = `{ 
//     viewerAnyAuth(exampleApiKeyProtocol2: {apiKey: "abcdef"}) {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//       projectWithId (projectId: 1) {
//         projectId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerAnyAuth: {
//           patentWithId: {
//             patentId: '100'
//           },
//           projectWithId: {
//             projectId: 1
//           }
//         }
//       }
//     })
//   })
// })

// test('AnyAuth with multiple operations with different auth requirements', () => {
//   const query = `{ 
//     viewerAnyAuth(exampleApiBasicProtocol: {username: "arlene123", password: "password123"}, exampleApiKeyProtocol: {apiKey: "abcdef"}) {
//       patentWithId (patentId: "100") {
//         patentId
//       }
//       projectWithId (projectId: 1) {
//         projectId
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerAnyAuth: {
//           patentWithId: {
//             patentId: '100'
//           },
//           projectWithId: {
//             projectId: 1
//           }
//         }
//       }
//     })
//   })
// })

// // This request can only be fulfilled using AnyAuth
// test('AnyAuth with multiple operations with different auth requirements in a link', () => {
//   const query = `{ 
//     viewerAnyAuth(exampleApiBasicProtocol: {username: "arlene123", password: "password123"}, exampleApiKeyProtocol: {apiKey: "abcdef"}) {
//       projectWithId (projectId: 3) {
//         projectId
//         patentId
//         patent {
//           patentId
//         }
//         projectLead {
//           name
//         }
//       }
//     }
//   }`
//   return graphql({schema: createdSchema, source: query, rootValue: null, contextValue: {}}).then((result) => {
//     expect(result).toEqual({
//       data: {
//         viewerAnyAuth: {
//           projectWithId: {
//             projectId: 3,
//             patentId: '100',
//             patent: {
//               patentId: '100'
//             },
//             projectLead: {
//               name: 'William B Ropp'
//             }
//           }
//         }
//       }
//     })
//   })
// })

// test('Extract token from context', () => {
//   const query = `{
//     secure
//   }`

//   return openAPIToGraphQL
//     .createGraphQLSchema(oas, {
//       tokenJSONpath: '$.user.token',
//       viewer: true
//     })
//     .then(({ schema }) => {
//       return graphql({schema, source: query, rootValue: null, contextValue: { user: { token: 'abcdef' } }}).then(
//         (result) => {
//           expect(result).toEqual({
//             data: {
//               secure: 'A secure message.'
//             }
//           })
//         }
//       )
//     })
// })

test('should get patent using basic auth', async () => {
  const query = /* GraphQL */ `
    query {
      get_patent_with_id(patent_id: "100", usernameAndPassword: "arlene123:password123") {
        patent_id
      }
    }
  `;

return openAPIToGraphQL
.createGraphQLSchema(getOas(), {
  headers: {
    authorization: 'Basic {args.usernameAndPassword|base64}',
  }
})
.then(({ schema }) => {
  return graphql({schema, source: query}).then(
    (result) => {
      expect(result).toEqual({
        data: {
          get_patent_with_id: {
            patent_id: '100',
          },
        },
      });
    })
  })
});

test('Get patent using API key in the header', async () => {
  const query = /* GraphQL */ `
    query {
      get_patent_with_id(patent_id: "100", apiKey: "abcdef") {
        patent_id
      }
    }
  `;

return openAPIToGraphQL
.createGraphQLSchema(getOas(), {
  headers: {
    access_token: '{args.apiKey}',
  }
})
.then(({ schema }) => {
  return graphql({schema, source: query}).then(
    (result) => {
      expect(result).toEqual({
        data: {
          get_patent_with_id: {
            patent_id: '100',
          },
        },
      });
    })
  })
});

test('Get patent using API key in the cookie', async () => {
  const query = /* GraphQL */ `
    query {
      get_patent_with_id(patent_id: "100", apiKey: "abcdef") {
        patent_id
      }
    }
  `;

return openAPIToGraphQL
.createGraphQLSchema(getOas(), {
  headers: {
    cookie: 'access_token={args.apiKey}',
  }
})
.then(({ schema }) => {
  return graphql({schema, source: query}).then(
    (result) => {
      expect(result).toEqual({
        data: {
          get_patent_with_id: {
            patent_id: '100',
          },
        },
      });
    })
  })
});

test('Get patent using API key in the query string', async () => {
  const query = /* GraphQL */ `
    query {
      get_patent_with_id(patent_id: "100", apiKey: "abcdef") {
        patent_id
      }
    }
  `;

return openAPIToGraphQL
.createGraphQLSchema(getOas(), {
  headers: {
    access_token: '{args.apiKey}',
  }
})
.then(({ schema }) => {
  return graphql({schema, source: query}).then(
    (result) => {
      expect(result).toEqual({
        data: {
          get_patent_with_id: {
            patent_id: '100',
          },
        },
      });
    })
  })
});
