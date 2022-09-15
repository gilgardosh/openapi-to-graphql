// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { beforeAll, expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { GraphQLSchema, parse, validate } from 'graphql'
import { join } from 'path'

import * as openAPIToGraphQL from '../src/index'

function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/cloudfunction.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  return oas;
}

let createdSchema: GraphQLSchema

beforeAll(async () => {
  const { schema } = await openAPIToGraphQL.createGraphQLSchema(getOas(), {
    headers: {
      authorization: 'Basic {args.usernameAndPassword|base64}',
    }
  })
  createdSchema = schema
})

test('Get response', async () => {
  const query = `mutation {
    post_test_action_2 (input: {age: 27}, usernameAndPassword: "test:data") {
      ... on Response {
        payload
        age
      }
    }
  }`
  // validate that 'limit' parameter is covered by options:
  const ast = parse(query)
  const errors = validate(createdSchema, ast)
  expect(errors).toEqual([])
})
