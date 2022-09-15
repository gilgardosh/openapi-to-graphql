// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

import * as openAPIToGraphQL from '../src/index'
import { Options } from '../src/types'

function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/docusign.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  return oas;
}

test('Generate schema without problems', () => {
  const options: Options<any, any, any> = {
    strict: false
  }
  return openAPIToGraphQL
    .createGraphQLSchema(getOas(), options)
    .then(({ schema }) => {
      expect(schema).toBeTruthy()
    })
})
