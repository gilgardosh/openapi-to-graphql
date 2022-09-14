// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

/// <reference lib="dom" />

import { createServer, YogaNodeServerInstance } from '@graphql-yoga/node'
import { afterAll, beforeAll, expect, test } from '@jest/globals'
import { fetch, File, FormData } from '@whatwg-node/fetch';
import { readFileSync } from 'fs'
import { graphql, GraphQLObjectType, GraphQLSchema } from 'graphql'
import { join } from 'path'

import * as openAPIToGraphQL from '../src/index'
import * as Oas3Tools from '../src/oas_3_tools'
import { startServer as startAPIServer, stopServer as stopAPIServer } from './file_upload_api_server'

const PORT = 3010
const GRAPHQL_PORT = 3011

// Set up the schema first
function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/file_upload.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  // update PORT for this test case:
  oas.servers[0].variables.port.default = String(PORT);
  return oas;
};

let createdSchema: GraphQLSchema
type NewType_1 = YogaNodeServerInstance<any, any, any>

type NewType = NewType_1

let yoga: NewType;

beforeAll(async () => {
  const {schema} = await openAPIToGraphQL.createGraphQLSchema(getOas())
  createdSchema = schema
  
  yoga = createServer({
    schema: createdSchema,
    port: GRAPHQL_PORT,
    maskedErrors: false,
    logging: false,
  });

  await Promise.all([
    yoga.start(),
    startAPIServer(PORT)
  ])
})

afterAll(async () => {
  await Promise.all([stopAPIServer(), yoga.stop()]);
})

test('All mutation endpoints are found to be present', () => {
  const oas = getOas();
  let oasMutCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (Oas3Tools.isHttpMethod(method) && method !== 'get') oasMutCount++
    }
  }
  const gqlTypes = Object.keys((createdSchema.getTypeMap().Mutation as GraphQLObjectType).getFields()).length
  expect(gqlTypes).toEqual(oasMutCount)
})

test('Registers the File scalar type', async () => {
  const query = `{
    __type(name: "File") {
      name
      kind
    }
  }`

  const result = await graphql({schema: createdSchema, source: query})
  expect(result).toEqual({
    data: {
      __type: {
        name: 'File',
        kind: 'SCALAR'
      }
    }
  })
})

test('Introspection for mutations returns a mutation matching the custom field specified for the multipart API definition', async () => {
  const query = `{
    __schema {
      mutationType {
        fields {
          name
          args {
            name
            type {
              name
              kind
            }
          }
          type {
            name
            kind
          }
        }
      }
    }
  }`

  const result = await graphql({schema: createdSchema, source: query})

  expect(result).toEqual({
    data: {
      __schema: {
        mutationType: {
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: 'fileUploadTest',
              args: expect.arrayContaining([
                expect.objectContaining({
                  name: 'input'
                })
              ])
            })
          ])
        }
      }
    }
  })
})

test('Upload completes without any error', async () => {
  // Setup GraphQL for integration test
  const graphqlServer = createServer({
    schema: createdSchema,
    port: 9864,
    maskedErrors: false,
    logging: false,
  });

  await graphqlServer.start();

  // Prepare request to match GraphQL multipart request spec
  // Reference: https://github.com/jaydenseric/graphql-multipart-request-spec
  const form = new FormData();
  const query = /* GraphQL */ `
    mutation FileUploadTest($file: File!) {
      fileUploadTest(input: { file: $file }) {
        name
        content
      }
    }
  `;
  form.append('operations', JSON.stringify({ query, variables: { file: null } }));
  form.append('map', JSON.stringify({ 0: ['variables.file'] }));
  form.append('0', new File(['Hello World!'], 'hello.txt', { type: 'text/plain' }));

  // @ts-ignore
  const response = await fetch(`http://127.0.0.1:${GRAPHQL_PORT}/graphql`, { method: 'POST', body: form });
  const uploadResult: any = await response.json();

  expect(uploadResult).toEqual({
    data: {
      fileUploadTest: {
        name: 'hello.txt',
        content: 'Hello World!',
      },
    },
  });

  await graphqlServer.stop();
});

