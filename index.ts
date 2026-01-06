import * as pulumi from "@pulumi/pulumi";
import * as azure_native from "@pulumi/azure-native";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as applicationinsights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration
const config = new pulumi.Config();
const appName = config.require("appName");
const location = config.get("location") || "eastus";
const appServicePlanSku = config.get("appServicePlanSku") || "P1V2";
const appServicePlanCapacity = config.getNumber("appServicePlanCapacity") || 2;
const cosmosDbAccountName = config.require("cosmosDbAccountName");
const cosmosDbDatabaseName = config.get("cosmosDbDatabaseName") || "appdb";
const cosmosDbContainerName = config.get("cosmosDbContainerName") || "items";
const containerImage = config.get("containerImage") || "stefanprodan/podinfo:latest";
const containerPort = config.getNumber("containerPort") || 9898;
const resourceGroupName = config.require("resourceGroupName");

// Variables (equivalent to ARM template variables)
const appServicePlanName = `${appName}-plan`;
const webAppName = appName;
const applicationInsightsName = `${appName}-insights`;

// Create Cosmos DB Account
const cosmosDbAccount = new cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "GlobalDocumentDB",
    databaseAccountOfferType: "Standard",
    consistencyPolicy: {
        defaultConsistencyLevel: "Session",
    },
    locations: [{
        locationName: location,
        failoverPriority: 0,
        isZoneRedundant: false,
    }],
    capabilities: [{
        name: "EnableServerless",
    }],
    enableAutomaticFailover: false,
    enableMultipleWriteLocations: false,
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}`,
});

// Create Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabaseName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}`,
});

// Create Cosmos DB SQL Container
const cosmosDbContainer = new cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabase.name,
    containerName: cosmosDbContainerName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbContainerName,
        partitionKey: {
            paths: ["/id"],
            kind: "Hash",
        },
        indexingPolicy: {
            indexingMode: "consistent",
            automatic: true,
            includedPaths: [{
                path: "/*",
            }],
            excludedPaths: [{
                path: "/\"_etag\"/?",
            }],
        },
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}/containers/${cosmosDbContainerName}`,
});

// Create Application Insights
const applicationInsights = new applicationinsights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/${applicationInsightsName}`,
});

// Create App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroupName,
    location: location,
    sku: {
        name: appServicePlanSku,
        capacity: appServicePlanCapacity,
    },
    kind: "linux",
    reserved: true,
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/${appServicePlanName}`,
});

// Create Web App
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    resourceGroupName: resourceGroupName,
    location: location,
    serverFarmId: appServicePlan.id,
    kind: "app,linux,container",
    httpsOnly: true,
    siteConfig: {
        linuxFxVersion: `DOCKER|${containerImage}`,
        alwaysOn: true,
        http20Enabled: true,
        minTlsVersion: "1.2",
        ftpsState: "Disabled",
        healthCheckPath: "/healthz",
        autoHealEnabled: true,
        autoHealRules: {
            triggers: {
                statusCodes: [{
                    status: 500,
                    subStatus: 0,
                    count: 10,
                    timeInterval: "00:05:00",
                }],
            },
            actions: {
                actionType: "Recycle",
            },
        },
        appSettings: [
            {
                name: "WEBSITES_ENABLE_APP_SERVICE_STORAGE",
                value: "false",
            },
            {
                name: "DOCKER_REGISTRY_SERVER_URL",
                value: "https://index.docker.io",
            },
            {
                name: "WEBSITES_PORT",
                value: containerPort.toString(),
            },
            {
                name: "APPINSIGHTS_INSTRUMENTATIONKEY",
                value: applicationInsights.instrumentationKey,
            },
            {
                name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
                value: applicationInsights.connectionString,
            },
            {
                name: "COSMOS_DB_ENDPOINT",
                value: cosmosDbAccount.documentEndpoint,
            },
            {
                name: "COSMOS_DB_KEY",
                value: pulumi.all([cosmosDbAccount.name, resourceGroupName]).apply(([accountName, rgName]) =>
                    cosmosdb.listDatabaseAccountKeys({
                        accountName: accountName,
                        resourceGroupName: rgName,
                    }).then(keys => keys.primaryMasterKey!)
                ),
            },
            {
                name: "COSMOS_DB_DATABASE",
                value: cosmosDbDatabaseName,
            },
            {
                name: "COSMOS_DB_CONTAINER",
                value: cosmosDbContainerName,
            },
        ],
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/${webAppName}`,
});

// Note: Web App Configuration is handled within the WebApp resource's siteConfig
// The ARM template's Microsoft.Web/sites/config resource is merged into the WebApp above

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName_output = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;