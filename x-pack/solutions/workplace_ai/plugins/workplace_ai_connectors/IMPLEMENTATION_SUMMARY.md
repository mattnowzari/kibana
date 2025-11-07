# Workplace Connectors with Encrypted Secrets - Implementation Summary

## Overview

This POC implements secure secret storage for Workplace Connectors using Encrypted Saved Objects (ESO), allowing Workflows to reference secrets at execution time without storing them in plaintext.

## What Was Implemented

### 1. Backend - Encrypted Saved Objects (ESO)

**Files Created:**
- [server/saved_objects/mappings.ts](server/saved_objects/mappings.ts) - Defines the saved object mappings for `workplace_connector`
- [server/saved_objects/index.ts](server/saved_objects/index.ts) - Registers the saved object type with ESO encryption

**Key Features:**
- Saved object type: `workplace_connector`
- Encrypted field: `secrets` (contains API keys, tokens, etc.)
- Non-encrypted fields: `name`, `type`, `config`, `workflowId`, `createdAt`, `updatedAt`
- Uses ESO's `attributesToEncrypt` to encrypt secrets at rest

### 2. Backend - REST API for Connector Management

**Files Created:**
- [server/routes/schemas.ts](server/routes/schemas.ts) - Request/response schemas
- [server/routes/connectors.ts](server/routes/connectors.ts) - CRUD route handlers
- [common/types.ts](common/types.ts) - TypeScript types for connectors

**API Endpoints:**
- `POST /api/workplace_connectors` - Create a new connector (auto-creates workflow)
- `GET /api/workplace_connectors` - List all connectors
- `GET /api/workplace_connectors/{id}` - Get a specific connector
- `PUT /api/workplace_connectors/{id}` - Update a connector
- `DELETE /api/workplace_connectors/{id}` - Delete a connector

### 3. Backend - Secret Resolution Service

**Files Created:**
- [server/services/secret_resolver.ts](server/services/secret_resolver.ts)

**Features:**
- Resolves secret references in workflow YAML at execution time
- Pattern: `${workplace_connector:connector_id:secret_key}`
- Supports both ID and type-based lookups
- Recursive resolution in complex objects
- Exposed through plugin's start contract for use by Workflows

**Example Usage in Workflow:**
```yaml
headers:
  X-Subscription-Token: '${workplace_connector:brave_search_connector_id:api_key}'
```

### 4. Backend - Workflow Creation

**Files Created:**
- [server/workflows/brave_search_template.ts](server/workflows/brave_search_template.ts) - Workflow template for Brave Search
- [server/services/workflow_creator.ts](server/services/workflow_creator.ts) - Service to create workflows

**Features:**
- Automatically creates a workflow when a connector is created
- Workflow contains secret references (not plaintext)
- Stores workflow ID in the connector for reference
- Template-based approach for easy addition of new connector types

**Example Workflow Template:**
```yaml
version: '1'
name: 'Brave Search'
description: 'Search using Brave Search API'
triggers:
  - type: 'manual'
steps:
  - name: 'Search Brave'
    type: 'http'
    with:
      url: 'https://api.search.brave.com/res/v1/web/search'
      method: 'GET'
      headers:
        X-Subscription-Token: '${workplace_connector:connector_id:api_key}'
```

### 5. Frontend - UI Components

**Files Created:**
- [public/components/connector_flyout.tsx](public/components/connector_flyout.tsx) - Flyout for configuring connectors
- [public/hooks/use_connectors.ts](public/hooks/use_connectors.ts) - React hook for connector management

**Files Modified:**
- [public/pages/connectors_landing.tsx](public/pages/connectors_landing.tsx) - Updated to use Brave Search instead of Google

**Features:**
- Brave Search connector card with connection status
- Flyout for entering API key (password field for security)
- "Connected" badge when connector is configured
- Automatic workflow creation on connector save

## Flow Diagram

```
User clicks "Select" on Brave connector
         ↓
Flyout opens with API key input
         ↓
User enters API key and clicks "Connect"
         ↓
Frontend calls POST /api/workplace_connectors
         ↓
Backend creates workplace_connector saved object (secrets encrypted via ESO)
         ↓
Backend creates workflow using template with secret references
         ↓
Backend updates connector with workflow ID
         ↓
Frontend shows "Connected" status
```

## Secret Resolution at Runtime

When a workflow executes:

```
Workflow execution starts
         ↓
HTTP step encounters: ${workplace_connector:id:api_key}
         ↓
Calls Secret Resolver Service
         ↓
Fetches connector from saved objects (ESO decrypts secrets)
         ↓
Extracts api_key from secrets
         ↓
Replaces reference with actual value
         ↓
HTTP request sent with real API key
         ↓
Secret never stored in workflow or logs
```

## Current Implementation Status

### ✅ Completed
1. **ESO Secret Storage**: Secrets encrypted at rest in saved objects
2. **Connector CRUD API**: Full API for managing workplace connectors
3. **Secret Resolver Service**: Service exposed via plugin start contract
4. **Workflow Templates**: Templates use secret references (not plaintext)
5. **UI Components**: Complete UI for connector configuration
6. **Automatic Workflow Creation**: Workflows created with proper secret references

### ⚠️ Requires Integration
**Runtime Secret Resolution**: The Workflows plugin needs to call the SecretResolver service during HTTP step execution.

**See**: [SECRET_RESOLUTION_INTEGRATION.md](SECRET_RESOLUTION_INTEGRATION.md) for detailed integration guide.

### How It Should Work

1. User creates a Brave Search connector with API key
2. Connector stores API key encrypted via ESO
3. Workflow is created with secret reference: `${workplace_connector:id:api_key}`
4. **[NEEDS INTEGRATION]** When workflow executes:
   - Workflows plugin calls `secretResolver.resolveSecretsInObject()` before HTTP step
   - Secret reference is replaced with actual decrypted API key
   - HTTP request sent with resolved secret
   - Secret never persisted or logged

## Security Features

1. **Encryption at Rest**: Secrets stored using ESO encryption
2. **Never in Plaintext**: Workflows only contain references, never actual secrets
3. **Runtime Resolution**: Secrets only decrypted at execution time
4. **Namespace Isolation**: Connectors are namespace-aware for multi-tenancy
5. **No Logging**: Resolved secrets are not logged or persisted
6. **Password Input**: UI uses password field to prevent shoulder surfing

## Adding New Connector Types

To add a new connector type (e.g., "Google Search"):

1. Add type to [common/types.ts](common/types.ts):
   ```typescript
   GOOGLE_SEARCH: 'google_search'
   ```

2. Create template in `server/workflows/google_search_template.ts`:
   ```typescript
   export function createGoogleSearchWorkflowTemplate(connectorId: string): string {
     return `...workflow YAML with ${workplace_connector:${connectorId}:api_key}...`;
   }
   ```

3. Update [server/services/workflow_creator.ts](server/services/workflow_creator.ts) to handle the new type

4. Add card to [public/pages/connectors_landing.tsx](public/pages/connectors_landing.tsx)

## Testing the Implementation

1. Start Kibana with the plugin enabled
2. Navigate to Workplace AI Connectors page
3. Click "Select" on Brave Search connector
4. Enter a Brave Search API key
5. Click "Connect"
6. Verify:
   - Connector shows "Connected" status
   - Workflow is created (check Workflows UI)
   - Workflow YAML contains secret reference, not plaintext
   - Connector saved object has encrypted secrets field

## Future Enhancements

- Integration with Workflows HTTP step to automatically resolve secrets
- Support for multiple secrets per connector
- Secret rotation/update UI
- Audit logging for secret access
- Support for additional authentication methods (OAuth, JWT, etc.)
- Secret expiration and refresh

## Dependencies Added

- `encryptedSavedObjects` - For secret encryption
- `workflowsManagement` - For workflow creation and management
