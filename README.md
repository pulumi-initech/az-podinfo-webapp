# ARM to Pulumi Migration - Podinfo Web Application

This repository contains a Pulumi TypeScript program that manages the Azure infrastructure for the Podinfo web application, migrated from ARM templates.

## Architecture

The deployment includes the following Azure resources:

- **Azure Cosmos DB Account** (Serverless, SQL API)
- **Azure Cosmos DB SQL Database** (`appdb`)
- **Azure Cosmos DB SQL Container** (`items`)
- **Application Insights** (Application monitoring and telemetry)
- **Azure App Service Plan** (Linux, P1V2, 2 instances)
- **Azure Web App** (Containerized application running `stefanprodan/podinfo`)

## Migration Summary

This project was migrated from ARM templates to Pulumi TypeScript using the inline import approach. All existing Azure resources were imported without recreation, ensuring zero downtime.

### ARM Template Resources → Pulumi Resources

| ARM Resource Type | ARM Resource Name | Pulumi Resource Type | Pulumi Logical Name |
|-------------------|-------------------|----------------------|---------------------|
| Microsoft.DocumentDB/databaseAccounts | podinfo-cosmosdb-28525 | azure-native:cosmosdb:DatabaseAccount | cosmosDbAccount |
| Microsoft.DocumentDB/.../sqlDatabases | appdb | azure-native:cosmosdb:SqlResourceSqlDatabase | cosmosDbDatabase |
| Microsoft.DocumentDB/.../containers | items | azure-native:cosmosdb:SqlResourceSqlContainer | cosmosDbContainer |
| Microsoft.Insights/components | podinfo-webapp-28525-insights | azure-native:applicationinsights:Component | applicationInsights |
| Microsoft.Web/serverfarms | podinfo-webapp-28525-plan | azure-native:web:AppServicePlan | appServicePlan |
| Microsoft.Web/sites | podinfo-webapp-28525 | azure-native:web:WebApp | webApp |

### Import Approach

All resources were imported using Pulumi's inline `import` resource option with Azure Resource IDs. The import process achieved near-zero-diff with only one minor update:

- **Application Insights**: Added `flowType` and `requestSource` properties (non-breaking additions)

All other resources imported cleanly with no changes required.

## Prerequisites

- Node.js 18+ and npm
- Pulumi CLI
- Azure CLI (for credential management)
- Access to Pulumi ESC environment: `initech/shared/azure-dev`

## Configuration

The stack is configured with the following settings:

```yaml
config:
  arm-migration:appName: podinfo-webapp-28525
  arm-migration:location: eastus
  arm-migration:resourceGroupName: podinfo-webapp-rg
  arm-migration:cosmosDbAccountName: podinfo-cosmosdb-28525
  arm-migration:subscriptionId: 32b9cb2e-69be-4040-80a6-02cd6b2cc5ec
environment:
  - shared/azure-dev
```

The ESC environment `shared/azure-dev` provides Azure credentials via OIDC.

## Deployment

### Install Dependencies

```bash
npm install
```

### Preview Changes

```bash
pulumi preview --stack dev
```

### Deploy Changes

```bash
pulumi up --stack dev
```

## Outputs

The stack exports the following outputs:

- `webAppUrl`: The HTTPS URL of the web application
- `webAppName_output`: The name of the web app
- `cosmosDbEndpoint`: The Cosmos DB endpoint URL
- `applicationInsightsKey`: The Application Insights instrumentation key

## Application Configuration

The web application is configured with the following environment variables:

- `WEBSITES_ENABLE_APP_SERVICE_STORAGE`: false
- `DOCKER_REGISTRY_SERVER_URL`: https://index.docker.io
- `WEBSITES_PORT`: 9898
- `APPINSIGHTS_INSTRUMENTATIONKEY`: (from Application Insights)
- `APPLICATIONINSIGHTS_CONNECTION_STRING`: (from Application Insights)
- `COSMOS_DB_ENDPOINT`: (from Cosmos DB)
- `COSMOS_DB_KEY`: (from Cosmos DB)
- `COSMOS_DB_DATABASE`: appdb
- `COSMOS_DB_CONTAINER`: items

## Health Checks and Auto-Heal

The web application is configured with:

- **Health Check Path**: `/healthz`
- **Auto-Heal**: Enabled
  - Triggers: 10 HTTP 500 errors within 5 minutes
  - Action: Recycle the application

## Migration Notes

### Property Differences

Several Azure resource properties are managed with `ignoreChanges` to prevent unnecessary updates:

1. **Cosmos DB Account**: Default properties like backup policy, TLS version, and network settings
2. **Cosmos DB Container**: Conflict resolution policy (uses default)
3. **App Service Plan**: SKU details (family, size, tier) and scaling properties
4. **Web App**: Default properties like SSL states, client affinity, and various feature flags

These properties are set by Azure with sensible defaults and don't need to be explicitly managed in code.

### Behavioral Differences

- **ARM Templates**: Declarative, deployed via Azure CLI or Portal
- **Pulumi**: Imperative TypeScript code with full programming language features
- **Configuration**: ARM parameters → Pulumi config
- **Outputs**: ARM outputs → Pulumi exports
- **Dependencies**: ARM `dependsOn` → Implicit through property references

## Testing

After deployment, verify the application:

```bash
# Check the web app
curl https://podinfo-webapp-28525.azurewebsites.net

# Check health endpoint
curl https://podinfo-webapp-28525.azurewebsites.net/healthz
```

## Cleanup

To delete all resources:

```bash
pulumi destroy --stack dev
```

## Original ARM Template

The original ARM template is available in the source repository: `pulumi-initech/arm-podinfo-webapp`

## License

This Pulumi program is provided as-is for infrastructure management purposes.
