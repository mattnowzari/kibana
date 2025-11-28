# Connector Metadata Approach

## Overview

This demonstrates how to extend stack connectors with workplace-specific metadata **without creating a separate registry**. Instead, we leverage the actions plugin's registry which preserves all properties.

## Key Insight

The actions plugin's `ActionTypeRegistry` stores connector types using:

```typescript
this.actionTypes.set(actionType.id, { ...actionType } as unknown as ActionType);
```

The spread operator (`...`) means **ALL properties are preserved**, not just the ones in the `ActionType` interface!

## Architecture

```
┌─────────────────────────────────────────────┐
│     Actions Plugin Registry                 │
│                                              │
│  .notion → {                                 │
│    id: '.notion',                            │
│    name: 'Notion',                           │
│    getService: ...,                          │
│    workplaceMetadata: {  ← OUR METADATA!    │
│      oauth: {...},                           │
│      workflowTemplates: {...},               │
│      toolGeneration: {...}                   │
│    }                                         │
│  }                                           │
└─────────────────────────────────────────────┘
```

## How It Works

### Step 1: Define Extended Type

```typescript
// types/extended_connector_type.ts
export interface WorkplaceConnectorMetadata {
  workplaceMetadata?: {
    oauth?: { ... };
    workflowTemplates?: { ... };
    toolGeneration?: { ... };
  };
}

export type ExtendedConnectorType<Config, Secrets> =
  SubActionConnectorType<Config, Secrets> & WorkplaceConnectorMetadata;
```

### Step 2: Register with Metadata

```typescript
// connector_types/notion.ts
export function getNotionConnectorWithMetadata(): ExtendedConnectorType {
  return {
    ...getNotionStackConnector(), // Base from stack_connectors
    workplaceMetadata: {
      oauth: { ... },
      workflowTemplates: { ... },
      toolGeneration: { ... }
    }
  };
}

// plugin.ts
actions.registerSubActionConnectorType(
  getNotionConnectorWithMetadata() as any  // Cast to bypass TypeScript
);
```

### Step 3: Retrieve Metadata

```typescript
// utils/get_connector_metadata.ts
export function getConnectorMetadata(actions, connectorTypeId) {
  const connectorTypes = actions.listTypes();
  const connectorType = connectorTypes.find(ct => ct.id === connectorTypeId);

  // Cast to access our custom metadata
  return (connectorType as any).workplaceMetadata;
}
```

## Benefits Over Separate Registry

### ✅ Advantages

1. **Single Source of Truth**: One registry (actions plugin)
2. **No Sync Issues**: Metadata always travels with connector registration
3. **Atomic Registration**: Can't register connector without metadata
4. **Built-in APIs**: Use existing `actions.listTypes()` API
5. **Less Code**: No need to build/maintain separate registry

### ⚠️ Trade-offs

1. **TypeScript Casting**: Need `as any` when registering
2. **Implicit Contract**: Metadata structure not enforced by actions plugin
3. **Discovery**: Requires knowing to look for `workplaceMetadata` key

## Usage Examples

### Generate Workflows for a Connector

```typescript
const metadata = getConnectorMetadata(actions, '.notion');
const workflows = Object.entries(metadata.workflowTemplates).map(
  ([id, generator]) => ({
    id,
    yaml: generator(stackConnectorId)
  })
);
```

### Check OAuth Support

```typescript
const supportsOAuth = getConnectorMetadata(actions, '.notion')?.oauth !== undefined;
```

### Get Tool Configurations

```typescript
const toolConfigs = getConnectorMetadata(actions, '.notion')?.toolGeneration?.toolConfigs || [];
```

## Adding New Connectors

1. Create connector definition in `connector_types/{name}.ts`
2. Include `workplaceMetadata` with OAuth, workflows, tools
3. Register in `plugin.ts` with `actions.registerSubActionConnectorType()`
4. Access metadata anywhere using `getConnectorMetadata()`

## Testing

You can verify metadata is preserved:

```typescript
// After registration
const types = actions.listTypes();
const notion = types.find(t => t.id === '.notion');
console.log((notion as any).workplaceMetadata); // Your metadata!
```

## Migration from dataSourcesRegistry

**Before:**
```typescript
// Two registrations
actions.registerSubActionConnectorType(notionConnector);
dataSourcesRegistry.register(notionDataSource);

// Two lookups
const connector = actions.getType('.notion');
const metadata = dataSourcesRegistry.get('.notion');
```

**After:**
```typescript
// One registration
actions.registerSubActionConnectorType(notionConnectorWithMetadata);

// One lookup
const connector = actions.getType('.notion');
const metadata = (connector as any).workplaceMetadata;
```

## Conclusion

This approach **eliminates the need for a separate registry** while still storing all necessary metadata. The actions plugin's registry acts as our single source of truth for both connector execution logic and workplace-specific configuration.