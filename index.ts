import * as pulumi from "@pulumi/pulumi";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as applicationinsights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration
const config = new pulumi.Config();
const appName = config.require("appName");
const location = config.get("location") || "eastus";
const resourceGroupName = config.require("resourceGroupName");
const appServicePlanSku = config.get("appServicePlanSku") || "P1V2";
const appServicePlanCapacity = config.getNumber("appServicePlanCapacity") || 2;
const cosmosDbAccountName = config.require("cosmosDbAccountName");
const cosmosDbDatabaseName = config.get("cosmosDbDatabaseName") || "appdb";
const cosmosDbContainerName = config.get("cosmosDbContainerName") || "items";
const containerImage = config.get("containerImage") || "stefanprodan/podinfo:latest";
const containerPort = config.getNumber("containerPort") || 9898;

// Variables (equivalent to ARM template variables)
const appServicePlanName = `${appName}-plan`;
const webAppName = appName;
const applicationInsightsName = `${appName}-insights`;

// Cosmos DB Account
const cosmosDbAccount = new cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    location: location,
    resourceGroupName: resourceGroupName,
    databaseAccountOfferType: cosmosdb.DatabaseAccountOfferType.Standard,
    consistencyPolicy: {
        defaultConsistencyLevel: cosmosdb.DefaultConsistencyLevel.Session,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525",
});

// Cosmos DB Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabaseName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb",
});

// Cosmos DB Container
const cosmosDbContainer = new cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabase.name,
    containerName: cosmosDbContainerName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbContainerName,
        partitionKey: {
            paths: ["/id"],
            kind: cosmosdb.PartitionKind.Hash,
        },
        indexingPolicy: {
            indexingMode: cosmosdb.IndexingMode.Consistent,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb/containers/items",
});

// Application Insights
const applicationInsights = new applicationinsights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    location: location,
    resourceGroupName: resourceGroupName,
    kind: "web",
    applicationType: applicationinsights.ApplicationType.Web,
    retentionInDays: 90,
    publicNetworkAccessForIngestion: applicationinsights.PublicNetworkAccessType.Enabled,
    publicNetworkAccessForQuery: applicationinsights.PublicNetworkAccessType.Enabled,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights",
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    location: location,
    resourceGroupName: resourceGroupName,
    sku: {
        name: appServicePlanSku,
        capacity: appServicePlanCapacity,
    },
    kind: "linux",
    reserved: true,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverFarms/podinfo-webapp-28525-plan",
});

// Web App
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    location: location,
    resourceGroupName: resourceGroupName,
    serverFarmId: appServicePlan.id,
    kind: "app,linux,container",
    httpsOnly: true,
    siteConfig: {
        linuxFxVersion: `DOCKER|${containerImage}`,
        alwaysOn: true,
        http20Enabled: true,
        minTlsVersion: "1.2",
        ftpsState: web.FtpsState.Disabled,
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
                actionType: web.AutoHealActionType.Recycle,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525",
});

// Note: Web App Configuration is integrated into the WebApp siteConfig above
// The healthCheckPath and autoHeal settings need to be added to the siteConfig

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName_output = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
export const cosmosDbContainerId = cosmosDbContainer.id;