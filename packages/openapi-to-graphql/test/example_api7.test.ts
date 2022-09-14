// Copyright IBM Corp. 2017,2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict'

import { createServer, YogaNodeServerInstance } from '@graphql-yoga/node';
import { afterAll, beforeAll, expect, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

import * as openAPIToGraphQL from '../src/index'
import { startServers, stopServers, pubsub } from './example_api7_server'

const TEST_PORT = 3009
const HTTP_PORT = 3008

function getOas() {
  const oasStr = readFileSync(join(__dirname, './fixtures/example_oas7.json'), 'utf8');
  const oas = JSON.parse(oasStr);
  // update PORT for this test case:
  oas.servers[0].variables.port.default = String(HTTP_PORT)
  return oas;
};

let subscriptionServer: YogaNodeServerInstance<any, any, any>;

// Set up the schema first and run example API servers
beforeAll(async () => {
  const {schema} = await openAPIToGraphQL
    .createGraphQLSchema(getOas(), {
      fillEmptyResponses: true,
      // createSubscriptionsFromCallbacks: true
    })

  subscriptionServer = createServer({
    schema,
    port: TEST_PORT,
    context: { pubsub },
    maskedErrors: false,
    logging: false,
  });
  
  await Promise.all([subscriptionServer.start(),
    startServers(HTTP_PORT)
  ])
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Shut down API servers
 */
afterAll(async () => {
  /**
   * TODO: There seems to be some trouble closing the servers and connections.
   * The timeout allows these to close properly but is there a better way?
   */
  await sleep(500)
  await Promise.all([
    subscriptionServer.stop(),
    stopServers()
  ])
})

test('Receive data from the subscription after creating a new instance', async () => {
  const userName = 'Carlos'
  const deviceName = 'Bot'

  const query = `subscription watchDevice($method: String!, $userName: String!) {
    devicesEventListener(method: $method, userName: $userName) {
      name
      status
    }
  }`

  const query2 = `mutation triggerEvent($deviceInput: Device_Input!) {
    createDevice(input: $deviceInput) {
      ... on Device {
        name
        userName
        status
      }
    }
  }`

  const baseUrl = `http://127.0.0.1:${TEST_PORT}/graphql`;
  const url = new URL(baseUrl);

  url.searchParams.append('query', query);
  url.searchParams.append(
    'variables',
    JSON.stringify({
      method: 'POST',
      userName,
    })
  );

  setTimeout(async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query2,
        variables: {
          deviceInput: {
            name: `${deviceName}`,
            userName: `${userName}`,
            status: false,
          },
        },
      }),
    });
    const result = await response.json();
    expect(result.errors).toBeFalsy();
  }, 300);

  const abortCtrl = new AbortController();

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
    },
    signal: abortCtrl.signal,
  });

  for await (const chunk of response.body) {
    const data = Buffer.from(chunk).toString('utf-8');
    expect(data.trim()).toBe(
      `data: ${JSON.stringify({
        data: {
          devicesEventListener: {
            name: deviceName,
            status: false,
          },
        },
      })}`
    );
    break;
  }

  abortCtrl.abort();
})
