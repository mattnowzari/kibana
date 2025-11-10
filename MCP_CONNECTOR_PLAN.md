# MCP Connector Implementation Plan

## Overview
Create an MCP (Model Context Protocol) Stack Connector that connects to external MCP servers, and an Agent Builder tool type that references this connector to import MCP capabilities as Agent Builder tools.

## Requirements
1. **Stack Connector** (in Stack Management > Connectors):
   - Accept a URL for the MCP server
   - Accept credentials (API key support initially, stored encrypted)
   - Can execute MCP tool calls via connector executor

2. **Agent Builder Tool Type** (`ToolType.mcp`):
   - References an MCP Stack Connector
   - Discovers available capabilities from the MCP server
   - Allows users to select which capabilities to import
   - Creates Agent Builder tools that map one-to-one to selected MCP capabilities
   - Each tool calls the MCP connector, which calls the MCP server

## Architecture

### Key Components

1. **MCP Stack Connector** (Stack Connectors Plugin)
   - Located in `x-pack/platform/plugins/shared/stack_connectors/`
   - Similar to Webhook, Slack, etc. connectors
   - Configuration: URL, API key (encrypted in secrets)
   - Executor: Implements MCP JSON-RPC 2.0 protocol
   - Can be used by alerts, workflows, and Agent Builder

2. **MCP Tool Type** (`ToolType.mcp`) (Agent Builder)
   - New tool type in the Agent Builder system
   - Similar structure to `workflow` and `esql` tool types
   - Configuration: `connector_id`, `selected_capabilities[]`
   - References the MCP Stack Connector

3. **MCP Client** (in Stack Connector)
   - HTTP client to communicate with external MCP servers
   - Implements MCP JSON-RPC 2.0 protocol
   - Handles initialization, tool discovery, and tool execution
   - Used by connector executor

4. **Dynamic Tool Generation** (in Agent Builder Tool Type)
   - For each selected MCP capability, create a corresponding Agent Builder tool
   - Tools are dynamically generated based on MCP server's tool definitions
   - Each tool maps directly to an MCP server capability
   - Tool execution calls the MCP connector executor

## Implementation Steps

### Phase 1: MCP Stack Connector

#### 1.1 Create MCP Connector Schema
**File:** `src/platform/packages/shared/kbn-connector-schemas/mcp/constants.ts`
- Define `CONNECTOR_ID = '.mcp'`
- Define `CONNECTOR_NAME = 'MCP'`

**File:** `src/platform/packages/shared/kbn-connector-schemas/mcp/schema.ts`
- Define `ConfigSchema`:
  ```typescript
  z.object({
    url: z.string().url(),
  })
  ```
- Define `SecretsSchema`:
  ```typescript
  z.object({
    apiKey: z.string().optional(),
  })
  ```
- Define `ParamsSchema`:
  ```typescript
  z.object({
    method: z.enum(['initialize', 'tools/list', 'tools/call']),
    params: z.record(z.any()).optional(),
  })
  ```

#### 1.2 Create MCP Client Utility
**File:** `x-pack/platform/plugins/shared/stack_connectors/server/connector_types/mcp/mcp_client.ts`
- Implement MCP client class:
  ```typescript
  class McpClient {
    constructor(url: string, apiKey?: string)
    async initialize(): Promise<void>
    async listTools(): Promise<McpToolDefinition[]>
    async callTool(name: string, args: Record<string, any>): Promise<any>
  }
  ```
- Use JSON-RPC 2.0 protocol
- Handle HTTP transport with proper headers
- Support MCP protocol version negotiation

#### 1.3 Create MCP Connector Executor
**File:** `x-pack/platform/plugins/shared/stack_connectors/server/connector_types/mcp/index.ts`
- Implement `getConnectorType()` function
- Executor handles:
  - `initialize`: Initialize MCP connection
  - `tools/list`: List available tools
  - `tools/call`: Call a specific tool
- Register connector type in `stack_connectors/server/connector_types/index.ts`

#### 1.4 Create MCP Connector UI Components
**File:** `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/mcp/mcp.tsx`
- Main connector type definition
- Icon, select message, action type title
- Lazy-loaded connector fields and params fields
- Form serializer/deserializer

**File:** `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/mcp/mcp_connectors.tsx`
- Form component for MCP connector configuration
- Fields:
  - URL input (required, validated)
  - API Key input (optional, masked/secret field)
- Uses `UseField` from `@kbn/es-ui-shared-plugin`
- Validation for URL format

**File:** `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/mcp/mcp_params.tsx`
- Form component for MCP action parameters
- Fields for MCP method selection (initialize, tools/list, tools/call)
- Dynamic params based on selected method
- Used when connector is used in alerts/workflows

**File:** `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/mcp/translations.ts`
- i18n translation strings
- Labels, error messages, help text

**File:** `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/lib/mcp/form_serialization.ts`
- Form serializer: transforms form data to connector config/secrets
- Form deserializer: transforms connector config/secrets to form data
- Handles API key encryption/decryption

- Register in `stack_connectors/public/connector_types/index.ts`

### Phase 2: Agent Builder MCP Tool Type

#### 2.1 Add MCP Tool Type Enum
**File:** `x-pack/platform/packages/shared/onechat/onechat-common/tools/definition.ts`
- Add `mcp = 'mcp'` to `ToolType` enum

#### 2.2 Create MCP Tool Type Types
**File:** `x-pack/platform/packages/shared/onechat/onechat-common/tools/types/mcp.ts`
- Define `McpToolConfig` type:
  ```typescript
  export type McpToolConfig = {
    connector_id: string;  // Reference to MCP Stack Connector
    selected_capabilities: string[];  // Array of MCP tool names to import
  };
  ```
- Create type guards (`isMcpTool`)

#### 2.3 Create MCP Tool Type Definition
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/mcp/tool_type.ts`
- Implement `getMcpToolType()` function
- Define `getDynamicProps` that:
  - Gets MCP connector from actions client
  - Calls connector to discover available tools
  - Generates dynamic tools for each selected capability
- Return tool type definition with:
  - `getSchema()`: Returns schema for selected MCP tool
  - `getHandler()`: Executes MCP tool call via connector

#### 2.4 Create Configuration Schemas
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/mcp/schemas.ts`
- Define `configurationSchema` (for create):
  ```typescript
  schema.object({
    connector_id: schema.string(),
    selected_capabilities: schema.arrayOf(schema.string()),
  })
  ```
- Define `configurationUpdateSchema` (for update)

#### 2.5 Create Tool Discovery Handler
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/mcp/discover_tools.ts`
- Function to call MCP connector's `tools/list` action
- Returns list of tool definitions with:
  - Name
  - Description
  - Input schema

### Phase 3: Dynamic Tool Generation

#### 3.1 Create Tool Generator
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/mcp/generate_tools.ts`
- Function that takes MCP tool definitions and creates Agent Builder tools
- For each selected capability:
  - Create tool with unique ID (e.g., `mcp_{connector_id}_{tool_name}`)
  - Map MCP tool schema to Zod schema
  - Create handler that calls MCP connector executor

#### 3.2 Schema Conversion
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/mcp/schema_converter.ts`
- Convert MCP tool input schema (JSON Schema) to Zod schema
- Handle type mappings (string, number, boolean, object, array, etc.)

#### 3.3 Create Tool Execution Handler
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/mcp/execute_tool.ts`
- Handler that:
  - Gets MCP connector from actions client
  - Calls connector executor with `tools/call` method
  - Passes tool name and arguments
  - Returns result

### Phase 4: Agent Builder UI Components

#### 4.1 Create MCP Tool Type Registry Entry
**File:** `x-pack/platform/plugins/shared/onechat/public/application/components/tools/form/registry/tool_types/mcp.tsx`
- Tool type registry entry (similar to `workflow.tsx`)
- Defines:
  - Label for tool type selector
  - Configuration component (lazy-loaded)
  - Default values
  - Form data transformation functions
  - Validation resolver

#### 4.2 Create MCP Tool Configuration Component
**File:** `x-pack/platform/plugins/shared/onechat/public/application/components/tools/sections/configuration_fields/mcp_configuration_fields.tsx`
- Main configuration component for MCP tools
- Fields:
  - Connector selector (dropdown of available MCP connectors)
    - Fetches list of MCP connectors from actions API
    - Filters to only show `.mcp` connector type
  - Capability selector (multi-select with discovery)
    - Shows "Discover Tools" button
    - Displays loading state during discovery
    - Shows error messages if discovery fails
- Uses form hooks from `@kbn/es-ui-shared-plugin`

#### 4.3 Create Capability Selector Component
**File:** `x-pack/platform/plugins/shared/onechat/public/application/components/tools/sections/configuration_fields/mcp_capability_selector.tsx`
- Component to display and select MCP capabilities
- Features:
  - Multi-select checkbox list or EuiSelectable
  - Shows tool name, description, and schema preview
  - Search/filter capabilities
  - Loading states
  - Empty states (no tools found, no connector selected)
  - Error states (discovery failed)
- Calls discovery service to fetch tools

#### 4.4 Create Tool Discovery Service
**File:** `x-pack/platform/plugins/shared/onechat/public/application/services/mcp_discovery.ts`
- Service to discover tools from MCP connector
- Functions:
  - `discoverMcpTools(connectorId: string): Promise<McpToolDefinition[]>`
  - Makes API call to execute connector's `tools/list` action
  - Handles errors and retries
  - Returns list of available capabilities with schemas

#### 4.5 Create Form Transformation Utilities
**File:** `x-pack/platform/plugins/shared/onechat/public/application/utils/transform_mcp_form_data.ts`
- `transformMcpToolToFormData`: Converts tool definition to form data
- `transformMcpFormDataForCreate`: Converts form data to create payload
- `transformMcpFormDataForUpdate`: Converts form data to update payload

#### 4.6 Create Validation Schema
**File:** `x-pack/platform/plugins/shared/onechat/public/application/components/tools/validation/mcp_tool_form_validation.ts`
- Zod validation schema for MCP tool form
- Validates:
  - Connector ID is required and exists
  - Selected capabilities is array of strings
  - At least one capability must be selected

### Phase 6: Registration

#### 6.1 Register MCP Tool Type
**File:** `x-pack/platform/plugins/shared/onechat/server/services/tools/tool_types/get_tool_types.ts`
- Add `getMcpToolType()` to tool type definitions

#### 6.2 Register UI Form Component
**File:** `x-pack/platform/plugins/shared/onechat/public/application/components/tools/form/registry/tools_form_registry.tsx`
- Add MCP tool type to form registry
- Map to UI component

## Technical Details

### MCP Protocol Implementation

The MCP client needs to:
1. **Initialize**: Send `initialize` request with protocol version
2. **List Tools**: Send `tools/list` request to get available tools
3. **Call Tool**: Send `tools/call` request with tool name and arguments

Example JSON-RPC messages:
```json
// Initialize
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "kibana-agent-builder",
      "version": "1.0.0"
    }
  }
}

// List Tools
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}

// Call Tool
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { ... }
  }
}
```

### Tool ID Generation

For each imported MCP capability, generate a unique tool ID:
- Format: `mcp_{connector_id}_{tool_name}`
- Example: `mcp_abc123_get_weather`

### Tool Execution Flow

1. Agent Builder tool is called with parameters
2. Tool handler gets MCP connector from actions client
3. Handler calls connector executor with:
   - Method: `tools/call`
   - Params: `{ name: tool_name, arguments: tool_params }`
4. Connector executor uses MCP client to send JSON-RPC request
5. MCP server responds with result
6. Result is returned to Agent Builder tool
7. Tool returns result to agent

### Error Handling

- Connection errors: Show user-friendly message
- Authentication errors: Prompt for valid credentials
- Tool discovery errors: Show which tools failed
- Tool execution errors: Return error result to agent

### Security Considerations

- Store API keys encrypted (use Kibana's encrypted saved objects - handled by Stack Connectors)
- Validate MCP server URLs (prevent SSRF) - in connector validation
- Sanitize tool names and arguments - in connector executor
- Rate limiting for MCP server calls - handled by connector framework
- Connector access control - users must have access to connector to use tools

## File Structure

```
x-pack/platform/plugins/shared/stack_connectors/
├── server/
│   └── connector_types/
│       └── mcp/
│           ├── index.ts              # Connector type definition & executor
│           ├── mcp_client.ts          # MCP client implementation
│           └── types.ts               # MCP connector types
├── public/
│   └── connector_types/
│       └── mcp/
│           ├── mcp.tsx                # Main connector type definition
│           ├── mcp_connectors.tsx     # Connector configuration form
│           ├── mcp_params.tsx         # Action parameters form
│           ├── translations.ts        # i18n strings
│           └── lib/
│               └── mcp/
│                   └── form_serialization.ts  # Form serialization
└── ...

src/platform/packages/shared/kbn-connector-schemas/
└── mcp/
    ├── constants.ts                   # CONNECTOR_ID, CONNECTOR_NAME
    └── schema.ts                     # Config, Secrets, Params schemas

x-pack/platform/plugins/shared/onechat/
├── server/
│   └── services/tools/tool_types/mcp/
│       ├── tool_type.ts              # Main tool type definition
│       ├── schemas.ts                 # Configuration schemas
│       ├── discover_tools.ts          # Tool discovery via connector
│       ├── generate_tools.ts          # Dynamic tool generation
│       ├── execute_tool.ts            # Tool execution via connector
│       └── schema_converter.ts        # JSON Schema to Zod conversion
├── public/
│   └── application/
│       ├── components/tools/
│       │   ├── form/registry/tool_types/
│       │   │   └── mcp.tsx           # MCP tool type registry entry
│       │   ├── sections/configuration_fields/
│       │   │   ├── mcp_configuration_fields.tsx  # Main config component
│       │   │   └── mcp_capability_selector.tsx    # Capability selector
│       │   └── validation/
│       │       └── mcp_tool_form_validation.ts     # Validation schema
│       ├── services/
│       │   └── mcp_discovery.ts      # Frontend discovery service
│       └── utils/
│           └── transform_mcp_form_data.ts  # Form data transformations
└── ...

x-pack/platform/packages/shared/onechat/
└── onechat-common/
    └── tools/
        ├── definition.ts              # Add ToolType.mcp
        └── types/
            └── mcp.ts                 # MCP tool types
```

## Testing Strategy

1. **Unit Tests**
   - MCP client protocol handling
   - Schema conversion
   - Tool generation

2. **Integration Tests**
   - End-to-end tool creation
   - Tool execution
   - Error handling

3. **E2E Tests**
   - UI flow for creating MCP connector
   - Selecting capabilities
   - Using tools in agent

## Future Enhancements

- Support for OAuth2 authentication
- Support for other MCP transports (SSE, WebSocket)
- Caching of tool definitions
- Tool versioning
- Support for MCP resources and prompts

