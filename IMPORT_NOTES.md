# Import Notes

## About the Import Process

This Pulumi project is configured to import existing Azure resources that were deployed using ARM templates. Each resource in `index.ts` includes an `import` option with the Azure resource ID.

## Resource Import IDs

The following resources will be imported:

1. **Cosmos DB Account**: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/{cosmosDbAccountName}`

2. **Cosmos DB SQL Database**: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/{cosmosDbAccountName}/sqlDatabases/{databaseName}`

3. **Cosmos DB SQL Container**: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/{cosmosDbAccountName}/sqlDatabases/{databaseName}/containers/{containerName}`

4. **Application Insights**: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Insights/components/{appName}-insights`

5. **App Service Plan**: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Web/serverfarms/{appName}-plan`

6. **Web App**: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Web/sites/{appName}`

## Prerequisites for Import

Before running `pulumi preview` or `pulumi up`:

1. **Azure Authentication**: You must be logged in to Azure CLI
   ```bash
   az login
   ```

2. **Configuration**: Set the required configuration values
   ```bash
   ./setup-config.sh
   ```

3. **Verify Resources Exist**: Ensure all resources exist in Azure with the exact names specified in the configuration

## Expected Behavior

### First Preview/Up

When you run `pulumi preview` for the first time:
- Pulumi will attempt to read the existing resources from Azure
- It will show an import operation for each resource
- No changes should be made to the actual infrastructure

When you run `pulumi up` for the first time:
- Pulumi will import the resources into its state
- The resources will now be managed by Pulumi
- No modifications will be made to the actual Azure resources

### Subsequent Previews/Ups

After the initial import:
- `pulumi preview` will show any differences between your code and the actual Azure resources
- Ideally, there should be zero differences (zero-diff)
- If there are differences, you may need to adjust the code to match the actual resource configuration

## Troubleshooting

### Authentication Errors

If you see "Please run 'az login' to setup account":
- Run `az login` and authenticate with your Azure account
- Ensure you have the correct subscription selected: `az account set --subscription <subscription-id>`

### Resource Not Found Errors

If Pulumi cannot find a resource during import:
- Verify the resource exists in Azure Portal
- Check that the resource name in configuration matches exactly
- Verify the resource group name and subscription ID are correct
- Ensure you have permissions to read the resource

### Configuration Mismatches

If the preview shows unexpected changes after import:
- The Pulumi code may not exactly match the ARM template deployment
- Review the differences and adjust the code as needed
- Some properties may have different default values between ARM and Pulumi

## Next Steps After Import

1. **Verify Zero-Diff**: Run `pulumi preview` to ensure no changes are detected
2. **Test Changes**: Make a small, safe change to verify the workflow
3. **Set Up CI/CD**: Configure automated deployments using Pulumi
4. **Remove ARM Templates**: Once confident, you can archive the ARM template repository
