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
import { startServer, stopServer } from './example_api5_server'

const PORT = 3007
function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/example_oas5.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  // update PORT for this test case:
  oas.servers[0].variables.port.default = String(PORT);
  return oas;
};

// Testing the new naming convention

let createdSchema: GraphQLSchema

// Set up the schema first and run example API server
beforeAll(() => {
  return Promise.all([
    openAPIToGraphQL
      .createGraphQLSchema(getOas(), {
        simpleNames: true
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

/**
 * Because of the naming convention, 'o_d_d___n_a_m_e' will be left as-is.
 */
test('Naming convention test', () => {
  const query = `{
    o_d_d___n_a_m_e {
      data
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        o_d_d___n_a_m_e: {
          data: 'odd name'
        }
      }
    })
  })
})

/**
 * 'w-e-i-r-d___n-a-m-e' contains GraphQL unsafe characters.
 *
 * Because of the naming convention, 'w-e-i-r-d___n-a-m-e' will be turned into
 * 'w_e_i_r_d___n_a_m_e'.
 */
test('Naming convention test with GraphQL unsafe values', () => {
  const query = `{
    w_e_i_r_d___n_a_m_e {
      data
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        w_e_i_r_d___n_a_m_e: {
          data: 'weird name'
        }
      }
    })
  })
})

/**
 * 'w-e-i-r-d___n-a-m-e2' contains GraphQL unsafe characters.
 *
 * Because of the naming convention, 'w-e-i-r-d___n-a-m-e2' will be turned into
 * 'w_e_i_r_d___n_a_m_e2_by_f_u_n_k_y___p_a_r_a_m_e_t_e_r'.
 */
test('Naming convention test with GraphQL unsafe values and a parameter', () => {
  const query = `{
    w_e_i_r_d___n_a_m_e2_by_f_u_n_k_y___p_a_r_a_m_e_t_e_r (f_u_n_k_y___p_a_r_a_m_e_t_e_r: "Arnold") {
      data
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        w_e_i_r_d___n_a_m_e2_by_f_u_n_k_y___p_a_r_a_m_e_t_e_r: {
          data: 'weird name 2 param: Arnold'
        }
      }
    })
  })
})

/**
 * Because of the naming convention, 'w-e-i-r-d___n-a-m-e___l-i-n-k' will be
 * turned into 'w_e_i_r_d___n_a_m_e___l_i_n_k'.
 */
test('Naming convention test with a link', () => {
  const query = `{
    o_d_d___n_a_m_e {
      w_e_i_r_d___n_a_m_e___l_i_n_k {
        data
      }
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        o_d_d___n_a_m_e: {
          w_e_i_r_d___n_a_m_e___l_i_n_k: {
            data: 'weird name'
          }
        }
      }
    })
  })
})

/**
 * Because of the naming convention, 'w-e-i-r-d___n-a-m-e2___l-i-n-k' will be
 * turned into 'w_e_i_r_d___n_a_m_e2___l_i_n_k'.
 */
test('Naming convention test with a link that has parameters', () => {
  const query = `{
    o_d_d___n_a_m_e {
      w_e_i_r_d___n_a_m_e2___l_i_n_k {
        data
      }
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        o_d_d___n_a_m_e: {
          w_e_i_r_d___n_a_m_e2___l_i_n_k: {
            data: 'weird name 2 param: Charles'
          }
        }
      }
    })
  })
})

/**
 * Because of the naming convention, 'w-e-i-r-d___n-a-m-e3___l-i-n-k' will be
 * turned into 'w_e_i_r_d___n_a_m_e3___l_i_n_k'.
 */
test('Naming convention test with a link that has exposed parameters', () => {
  const query = `{
    o_d_d___n_a_m_e {
      w_e_i_r_d___n_a_m_e3___l_i_n_k (f_u_n_k_y___p_a_r_a_m_e_t_e_r: "Brittany") {
        data
      }
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        o_d_d___n_a_m_e: {
          w_e_i_r_d___n_a_m_e3___l_i_n_k: {
            data: 'weird name 3 param: Brittany'
          }
        }
      }
    })
  })
})

/**
 * 'a-m-b-e-r' will be sanitized to 'a_m_b_e_r' (Replacing GraphQL illegal
 * characters with underscores).
 */
test('Basic simpleEnumValues option test', () => {
  const query = `{
    getEnum {
      data
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        getEnum: {
          data: 'a_m_b_e_r'
        }
      }
    })
  })
})

/**
   * A GraphQL name cannot begin with a number, therefore 3 will be sanitized
   * to '_3'
   */
test('Basic simpleEnumValues option test on numerical enum', () => {
  const query = `{
    getNumericalEnum {
      data
    }
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        getNumericalEnum: {
          data: '_3'
        }
      }
    })
  })
})

  /**
   * Will translate an object enum to an arbitrary JSON type
   */
test('Basic simpleEnumValues option test on object enum', () => {
  const query = `{
    __type(name: "getObjectEnum_200_response") {
      name
      kind
    } 
  }`

  return graphql({schema: createdSchema, source: query}).then((result) => {
    expect(result).toEqual({
      data: {
        __type: {
          name: 'getObjectEnum_200_response',
          kind: 'OBJECT'
        }
      }
    })
  })
})
