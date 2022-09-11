// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: openapi-to-graphql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/**
 * Custom type definitions for GraphQL.
 */

export type SubscriptionContext = {
  pubsub: any
  [key: string]: any
}