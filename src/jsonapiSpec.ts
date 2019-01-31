/**
 * Types modelling the [JSON:API](https://jsonapi.org/format/#document-structure) specification
 */

/** ignore */
import { XOR } from './typeHelpers';

export namespace Spec {
  /**
   * @see https://jsonapi.org/format/#document-meta
   */
  export type MetaObject = {
    links?: LinksObject;
    [propName: string]: any;
  };

  /**
   * @see https://jsonapi.org/format/#document-resource-object-attributes
   */
  export type AttributesObject = {
    [attrName: string]: any;
  };

  /**
   * @see https://jsonapi.org/format/#document-links
   */
  export type LinkObject = {
    href: string;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/#document-links
   */
  export type Link = string | LinkObject;

  /**
   * @see https://jsonapi.org/format/#document-links
   */
  export type LinksObject = {
    [linkName: string]: Link;
  };

  /**
   * @see https://jsonapi.org/format/#document-top-level
   */
  export type TopLevelLinksObject = {
    self?: Link;
    related?: Link;
    first?: Link | null;
    last?: Link | null;
    prev?: Link | null;
    next?: Link | null;
  };

  /**
   * @see https://jsonapi.org/format/#document-resource-identifier-objects
   */
  export type ResourceIdentifierObject = {
    id: string;
    type: string;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/#document-resource-object-relationships
   */
  export type RelationshipObject = {
    links?: LinksObject;
    data?: ResourceIdentifierObject | ResourceIdentifierObject[] | null;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/#document-resource-object-relationships
   */
  export type RelationshipsObject = {
    [relationshipName: string]: RelationshipObject;
  };

  /**
   * @see https://jsonapi.org/format/#document-resource-objects
   */
  export type ResourceObject = {
    id: string;
    type: string;
    attributes?: AttributesObject;
    relationships?: RelationshipsObject;
    links?: LinksObject;
    meta?: MetaObject;
  };

  /**
   * When sent by the client the id is not required
   *
   * @see https://jsonapi.org/format/#document-resource-objects
   */
  export type ClientResourceObject = {
    id?: string;
    type: string;
    attributes?: AttributesObject;
    relationships?: RelationshipsObject;
    links?: LinksObject;
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/#error-objects
   */
  export type ErrorObject = {
    id?: string;
    links?: LinksObject;
    status?: string;
    code?: string;
    title?: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
      [propName: string]: any;
    };
    meta?: MetaObject;
  };

  /**
   * @see https://jsonapi.org/format/#document-jsonapi-object
   */
  export type JsonApiObject = {
    version?: string;
    meta?: MetaObject;
  };

  /**
   * This type looks a bit more complicated, as we require either the `data` or `errors` property,
   * but not both at the same time.
   *
   * @see https://jsonapi.org/format/#document-top-level
   */
  export type JsonApiDocument = XOR<
    { data: ResourceObject | ResourceObject[] | ResourceIdentifierObject | ResourceIdentifierObject[] | null },
    { errors: ErrorObject[] }
  > & {
    meta?: MetaObject;
    jsonapi?: JsonApiObject;
    links?: TopLevelLinksObject;
    included?: ResourceObject[];
  };

  /**
   * Some aspects of an JSON API document which are usually sufficient for client requests
   *
   * @see https://jsonapi.org/format/#document-top-level
   */
  export type ClientJsonApiDocument = {
    data: ClientResourceObject;
    included?: ResourceObject[];
  };
}
