// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { beforeAll, expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { GraphQLObjectType, GraphQLSchema, parse, validate } from 'graphql'
import { join } from 'path'

const openAPIToGraphQL = require('../src/index')
const Oas3Tools = require('../src/oas_3_tools')

// Set up the schema first
function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/government_social_work.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  return oas;
};

let createdSchema: GraphQLSchema
beforeAll(() => {
  return openAPIToGraphQL
    .createGraphQLSchema(getOas())
    .then(({ schema, report }) => {
      createdSchema = schema
    })
})

test('All query endpoints present', () => {
  const oas = getOas();
  let oasGetCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (method === 'get') oasGetCount++
    }
  }
  const gqlTypes = Object.keys((createdSchema.getTypeMap().Query as GraphQLObjectType).getFields()).length
  expect(gqlTypes).toEqual(oasGetCount)
})

test('All mutation endpoints present', () => {
  const oas = getOas();
  let oasMutCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (Oas3Tools.isHttpMethod(method) && method !== 'get') oasMutCount++
    }
  }
  const gqlTypes = Object.keys((createdSchema.getTypeMap().Mutation as GraphQLObjectType).getFields())
    .length
  expect(gqlTypes).toEqual(oasMutCount)
})

test('Get resource', () => {
  const query = `{
    getAssessmentTypes (
      Content_Type: ""
      Accept_Language: ""
      User_Agent:""
      Api_Version:"1.1.0"
      offset: "40"
      limit: "test"
    ) {
      ... on getAssessmentTypes_200_response {
        data {
          assessmentTypeId
        }
      }
    }
  }`
  const ast = parse(query)
  const errors = validate(createdSchema, ast)
  expect(errors).toEqual([])
})
