# ARM to Pulumi Migration - Podinfo Web Application

This Pulumi TypeScript project is a migration from Azure Resource Manager (ARM) templates to Pulumi Infrastructure as Code. It manages the existing Azure infrastructure for the podinfo web application.

## Architecture

The infrastructure includes:

- **Azure Cosmos DB**: NoSQL database (Serverless) with SQL API
  - Database: `appdb`
  - Container: `items` with partition key `/id`
- **Application Insights**: Application monitoring and telemetry
- **App Service Plan**: Linux-based hosting (P1V2, 2 instances)
- **Web App**: Containerized application running `stefanprodan/podinfo:latest`
  - HTTPS enforced
  - Health checks at `/healthz`
  - Auto-heal enabled for 500 errors

## Migration Notes

This project was converted from ARM templates and imports existing Azure resources without recreating them. The code uses:

- **Import resource options**: All resources specify `import` to adopt existing infrastructure
- **ignoreChanges**: Properties that are computed or don't exist in the SDK are ignored to prevent unnecessary updates

## Prerequisites

- Node.js (LTS) installed
- Pulumi CLI installed and configured
- Access to the `initech/shared/azure-dev` ESC environment for Azure credentials

## Usage

### Preview Changes

```bash
pulumi preview
```

### Deploy Changes

```bash
pulumi up
```

### View Outputs

```bash
pulumi stack output webAppUrl
pulumi stack output cosmosDbEndpoint
```

## Configuration

The stack uses the `initech/shared/azure-dev` ESC environment for Azure authentication via OIDC.

Stack configuration is stored in `Pulumi.dev.yaml`.

## Resources

All resources are deployed in the `podinfo-webapp-rg` resource group in the `eastus` region.

## Outputs

- `webAppUrl`: The HTTPS URL of the web application
- `webAppName`: The name of the web app
- `cosmosDbEndpoint`: The Cosmos DB connection endpoint
- `applicationInsightsKey`: The Application Insights instrumentation key
