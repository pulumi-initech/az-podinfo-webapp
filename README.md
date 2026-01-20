# Azure Podinfo Web Application - Pulumi TypeScript

This Pulumi project manages an Azure web application infrastructure converted from ARM templates. It includes:

- **Azure Cosmos DB**: NoSQL database with serverless configuration
- **Azure App Service**: Linux-based containerized web application
- **Application Insights**: Application monitoring and telemetry
- **App Service Plan**: Hosting plan with configurable SKU and capacity

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [Node.js](https://nodejs.org/) (v18 or later)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- An active Azure subscription

## Configuration

Before running Pulumi commands, you need to configure the following required settings:

```bash
# Required configuration
pulumi config set resourceGroupName <your-resource-group-name>
pulumi config set subscriptionId <your-azure-subscription-id>

# Already configured from ARM template parameters
pulumi config set appName "podinfo-webapp-28525"
pulumi config set cosmosDbAccountName "podinfo-cosmosdb-28525"
pulumi config set location "eastus"
pulumi config set appServicePlanSku "P1V2"
pulumi config set appServicePlanCapacity 2
pulumi config set cosmosDbDatabaseName "appdb"
pulumi config set cosmosDbContainerName "items"
pulumi config set containerImage "stefanprodan/podinfo:latest"
pulumi config set containerPort 9898
```

### Finding Your Azure Subscription ID and Resource Group

To find your Azure subscription ID:
```bash
az account show --query id -o tsv
```

To list your resource groups:
```bash
az group list --query "[].{Name:name, Location:location}" -o table
```

## Importing Existing Resources

This project is configured to import existing Azure resources that were deployed via ARM templates. The import IDs are automatically constructed using the configuration values.

To import the resources:

1. Ensure all configuration values are set (see Configuration section above)
2. Run a Pulumi preview to see the import plan:
   ```bash
   pulumi preview
   ```
3. If the preview looks correct, run:
   ```bash
   pulumi up
   ```

The first `pulumi up` will import the existing resources into Pulumi state without making any changes to the actual infrastructure.

## Project Structure

- `index.ts` - Main Pulumi program defining all Azure resources
- `Pulumi.yaml` - Pulumi project configuration
- `Pulumi.dev.yaml` - Stack-specific configuration for the dev stack
- `package.json` - Node.js dependencies

## Resources Managed

### Cosmos DB
- **Database Account**: Serverless Cosmos DB with SQL API
- **SQL Database**: Database named from configuration (default: "appdb")
- **SQL Container**: Container with partition key on `/id`

### Application Insights
- **Component**: Web application monitoring with 90-day retention

### App Service
- **App Service Plan**: Linux-based plan with configurable SKU
- **Web App**: Containerized application with:
  - Docker container from Docker Hub
  - HTTPS enforcement
  - Health checks at `/healthz`
  - Auto-heal rules for 500 errors
  - Environment variables for Cosmos DB and Application Insights

## Outputs

After deployment, the following outputs are available:

- `webAppUrl`: The HTTPS URL of the deployed web application
- `webAppName`: The name of the web app
- `cosmosDbEndpoint`: The Cosmos DB endpoint URL
- `applicationInsightsKey`: The Application Insights instrumentation key

View outputs with:
```bash
pulumi stack output
```

## Development

### Type Checking

Run TypeScript type checking:
```bash
npm run build
```

### Installing Dependencies

```bash
npm install
```

## Deployment

### Preview Changes

```bash
pulumi preview
```

### Apply Changes

```bash
pulumi up
```

### Destroy Resources

```bash
pulumi destroy
```

## Migration from ARM Templates

This project was converted from ARM templates located in the `arm-podinfo-webapp` repository. The conversion includes:

1. All resources from `azuredeploy.json`
2. Parameters from `azuredeploy.parameters.json` as Pulumi config
3. Import resource options to adopt existing infrastructure

## Security Notes

- Cosmos DB keys are retrieved dynamically and passed as environment variables
- HTTPS is enforced on the web app
- Minimum TLS version is set to 1.2
- FTPS is disabled

## Support

For issues or questions about this Pulumi project, please refer to:
- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Azure Native Provider Documentation](https://www.pulumi.com/registry/packages/azure-native/)
