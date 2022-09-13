import type { JSONSchemaLoaderOptions } from "@omnigraph/json-schema";
import { OperationTypeNode } from "graphql";
import type { OpenAPIV3 } from 'openapi-types';
import type { OasTitlePathMethodObject } from "./options";

export interface OpenAPILoaderOptions extends Partial<JSONSchemaLoaderOptions> {
    source: OpenAPIV3.Document;
    selectQueryOrMutationField?: OasTitlePathMethodObject<OperationTypeNode>;
  }

export interface OpenAPILoaderSelectQueryOrMutationFieldConfig {
    type: 'query' | 'mutation';
    fieldName: string;
  }