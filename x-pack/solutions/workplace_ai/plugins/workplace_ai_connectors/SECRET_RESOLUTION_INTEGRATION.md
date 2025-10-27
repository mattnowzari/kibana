# Runtime Secret Resolution Integration Guide

## Overview

Workplace Connectors store API keys and other secrets encrypted via ESO. Workflows reference these secrets using the syntax `${workplace_connector:connector_id:secret_key}`, which must be resolved at runtime during workflow execution.

## Current Implementation Status

### ✅ Completed
1. **Encrypted Secret Storage**: Secrets stored in ESO-encrypted saved objects
2. **Secret Resolver Service**: Available via `workplaceAIConnectors.secretResolver`
3. **Workflow Templates**: Use secret reference syntax (not plaintext)
4. **Connector-Workflow Linking**: Workflows created automatically with proper references

### ⚠️ Needs Integration
**Runtime Secret Resolution**: The Workflows plugin needs to call the SecretResolver service before executing HTTP steps.

## Integration Points

### 1. SecretResolver Service API

The service is exposed through the Workplace AI Connectors plugin start contract:

```typescript
// Available via plugin contract
const workplaceAIConnectors = plugins.workplaceAIConnectors;
const secretResolver = workplaceAIConnectors.secretResolver;

// Resolve secrets in a string
const resolved = await secretResolver.resolveSecrets(
  'X-API-Key: ${workplace_connector:my-connector-id:api_key}',
  savedObjectsClient
);
// Returns: 'X-API-Key: actual-api-key-value'

// Resolve secrets in an object (recursively)
const resolvedObj = await secretResolver.resolveSecretsInObject(
  {
    headers: {
      'X-Subscription-Token': '${workplace_connector:brave-connector:api_key}'
    }
  },
  savedObjectsClient
);
// Returns: { headers: { 'X-Subscription-Token': 'actual-api-key-value' } }
```

### 2. Required Workflows Plugin Changes

The Workflows plugin needs to integrate secret resolution before HTTP step execution:

#### Option A: HTTP Step Preprocessor (Recommended)

Add a preprocessor hook that runs before each HTTP step:

```typescript
// In workflows HTTP step executor
async function executeHttpStep(step: HttpStep, context: ExecutionContext) {
  // Check if workplaceAIConnectors plugin is available
  const workplaceAIConnectors = context.plugins.workplaceAIConnectors;

  if (workplaceAIConnectors && workplaceAIConnectors.secretResolver) {
    // Resolve secrets in HTTP headers
    if (step.with.headers) {
      step.with.headers = await workplaceAIConnectors.secretResolver.resolveSecretsInObject(
        step.with.headers,
        context.savedObjectsClient
      );
    }

    // Resolve secrets in HTTP body
    if (step.with.body) {
      step.with.body = await workplaceAIConnectors.secretResolver.resolveSecretsInObject(
        step.with.body,
        context.savedObjectsClient
      );
    }

    // Resolve secrets in URL
    if (typeof step.with.url === 'string') {
      step.with.url = await workplaceAIConnectors.secretResolver.resolveSecrets(
        step.with.url,
        context.savedObjectsClient
      );
    }
  }

  // Execute HTTP request with resolved secrets
  return executeHttpRequest(step.with);
}
```

#### Option B: Global Workflow Preprocessor

Add a global preprocessor that resolves secrets in the entire workflow YAML before execution:

```typescript
// In workflows execution engine
async function executeWorkflow(workflow: Workflow, context: ExecutionContext) {
  const workplaceAIConnectors = context.plugins.workplaceAIConnectors;

  if (workplaceAIConnectors && workplaceAIConnectors.secretResolver) {
    // Parse workflow YAML
    const workflowObj = parseYAML(workflow.yaml);

    // Resolve all secrets in the workflow object
    const resolvedWorkflow = await workplaceAIConnectors.secretResolver.resolveSecretsInObject(
      workflowObj,
      context.savedObjectsClient
    );

    // Convert back to YAML or use object directly
    workflow = resolvedWorkflow;
  }

  // Execute workflow with resolved secrets
  return executeWorkflowSteps(workflow);
}
```

## Secret Reference Syntax

### Format
```
${workplace_connector:connector_identifier:secret_key}
```

### Examples

**By Connector ID:**
```yaml
headers:
  X-Subscription-Token: ${workplace_connector:abc123:api_key}
```

**By Connector Type (finds first connector of that type):**
```yaml
headers:
  Authorization: Bearer ${workplace_connector:brave_search:api_token}
```

## Security Considerations

1. **Scoped Resolution**: Secrets are resolved using the request's SavedObjectsClient, respecting namespace/space isolation
2. **No Logging**: Resolved secrets should never be logged or persisted
3. **ESO Decryption**: Secrets are decrypted automatically by ESO when fetching the connector
4. **Ephemeral**: Resolved secrets exist only in memory during workflow execution

## Testing the Integration

### 1. Create a Workplace Connector
```bash
POST /api/workplace_connectors
{
  "name": "Brave Search",
  "type": "brave_search",
  "secrets": {
    "api_key": "YOUR_BRAVE_API_KEY"
  }
}
```

### 2. Verify Workflow Creation
The workflow should be created automatically with secret reference:
```yaml
steps:
  - name: 'Search Brave'
    type: 'http'
    with:
      headers:
        X-Subscription-Token: ${workplace_connector:connector-id:api_key}
```

### 3. Execute Workflow
```bash
POST /api/workflows/{workflow-id}/execute
{
  "inputs": {
    "query": "test search"
  }
}
```

### 4. Verify Secret Resolution
- Check that the HTTP request includes the actual API key (not the reference)
- Verify that the Brave Search API returns results
- Confirm that secrets are not logged in workflow execution logs

## Implementation Checklist

- [x] Create SecretResolver service
- [x] Expose service via plugin start contract
- [x] Create workflow templates with secret references
- [x] Document integration requirements
- [ ] **Integrate SecretResolver with Workflows HTTP step execution**
- [ ] Add error handling for missing/invalid secret references
- [ ] Add telemetry for secret resolution metrics
- [ ] Add audit logging for secret access

## Next Steps

1. **Workflows Plugin Team**: Implement one of the integration options above
2. **Testing**: Create integration tests for secret resolution
3. **Documentation**: Update Workflows documentation with secret reference syntax
4. **Security Review**: Review implementation with security team
5. **Performance**: Monitor impact of secret resolution on workflow execution time
