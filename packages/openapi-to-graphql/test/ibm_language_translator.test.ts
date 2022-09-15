// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { beforeAll, expect, test } from '@jest/globals'
import { readFileSync } from 'fs';
import { GraphQLObjectType, GraphQLSchema } from 'graphql'
import { join } from 'path';

import * as openAPIToGraphQL from '../src/index'

function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/ibm_language_translator.json'), 'utf8');
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

test('All IBM Language Translator query endpoints present', () => {
  const oas = getOas();
  let oasGetCount = 0
  for (let path in oas.paths) {
    for (let method in oas.paths[path]) {
      if (method === 'get') oasGetCount++
    }
  }
  const gqlTypes = Object.keys(
    createdSchema.getQueryType().getFields()
  ).length

  expect(gqlTypes).toEqual(oasGetCount)
})
