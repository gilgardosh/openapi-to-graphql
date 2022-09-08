import type { JSONSchemaLoaderOptions } from "@omnigraph/json-schema";
import type { OpenAPIV3 } from 'openapi-types';
import type { GraphQLOperationType } from "./graphql";
import type { OasTitlePathMethodObject } from "./options";

export interface OpenAPILoaderOptions extends Partial<JSONSchemaLoaderOptions> {
    source: OpenAPIV3.Document;
    selectQueryOrMutationField?: OasTitlePathMethodObject<GraphQLOperationType>;
  }

export interface OpenAPILoaderSelectQueryOrMutationFieldConfig {
    type: 'query' | 'mutation';
    fieldName: string;
  }