import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration values from ARM template parameters
const config = new pulumi.Config();
const appName = "podinfo-webapp-28525";
const location = "eastus";
const appServicePlanSku = "P1V2";
const appServicePlanCapacity = 2;
const cosmosDbAccountName = "podinfo-cosmosdb-28525";
const cosmosDbDatabaseName = "appdb";
const cosmosDbContainerName = "items";
const containerImage = "stefanprodan/podinfo:latest";
const containerPort = 9898;

// Derived names matching ARM template variables
const appServicePlanName = `${appName}-plan`;
const webAppName = appName;
const applicationInsightsName = `${appName}-insights`;

// Resource Group (import existing)
const resourceGroup = new resources.ResourceGroup("resourceGroup", {
    resourceGroupName: "podinfo-webapp-rg",
    location: location,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg"
});

// Cosmos DB Account
const cosmosDbAccount = new cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroup.name,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525"
});

// Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    resourceGroupName: resourceGroup.name,
    databaseName: cosmosDbDatabaseName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb"
});

// Cosmos DB SQL Container
const cosmosDbContainer = new cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccount.name,
    resourceGroupName: resourceGroup.name,
    databaseName: cosmosDbDatabase.name,
    containerName: cosmosDbContainerName,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb/containers/items"
});

// Application Insights
const applicationInsights = new insights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroup.name,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights"
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroup.name,
    location: location,
    sku: {
        name: appServicePlanSku,
        capacity: appServicePlanCapacity,
    },
    kind: "linux",
    reserved: true,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/podinfo-webapp-28525-plan"
});

// Get Cosmos DB keys for app settings
const cosmosDbKeys = pulumi.all([resourceGroup.name, cosmosDbAccount.name]).apply(([rgName, accountName]) =>
    cosmosdb.listDatabaseAccountKeys({
        resourceGroupName: rgName,
        accountName: accountName,
    })
);

// Web App
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    resourceGroupName: resourceGroup.name,
    location: location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    kind: "app,linux,container",
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
                value: cosmosDbKeys.primaryMasterKey,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525"
});

// Outputs matching ARM template
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const webAppNameOutput = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
