import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

const config = new pulumi.Config();
const location = config.require("azure-native:location");

// Parameters from ARM template
const appName = "podinfo-webapp-28525";
const cosmosDbAccountName = "podinfo-cosmosdb-28525";
const cosmosDbDatabaseName = "appdb";
const cosmosDbContainerName = "items";
const resourceGroupName = "podinfo-webapp-rg";

// Cosmos DB Account
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}`,
});

// Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccountName,
    databaseName: cosmosDbDatabaseName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}`,
    dependsOn: [cosmosDbAccount],
});

// Cosmos DB SQL Container
const cosmosDbContainer = new cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccountName,
    databaseName: cosmosDbDatabaseName,
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
                path: '/\\"_etag\\"/?',
            }],
        },
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}/containers/${cosmosDbContainerName}`,
    dependsOn: [cosmosDbDatabase],
});

// Application Insights
const applicationInsightsName = `${appName}-insights`;
const applicationInsights = new insights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.Insights/components/${applicationInsightsName}`,
});

// App Service Plan
const appServicePlanName = `${appName}-plan`;
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "linux",
    reserved: true,
    sku: {
        name: "P1V2",
        capacity: 2,
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.Web/serverFarms/${appServicePlanName}`,
});

// Web App
const webAppName = appName;
const containerImage = "stefanprodan/podinfo:latest";
const containerPort = 9898;

const webApp = new web.WebApp("webApp", {
    name: webAppName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "app,linux,container",
    serverFarmId: appServicePlan.id,
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
                value: pulumi.secret(cosmosdb.listDatabaseAccountKeysOutput({
                    accountName: cosmosDbAccountName,
                    resourceGroupName: resourceGroupName,
                }).primaryMasterKey),
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.Web/sites/${webAppName}`,
    dependsOn: [appServicePlan, applicationInsights, cosmosDbAccount],
});

// Export Cosmos DB endpoint, Application Insights key, and Web App URL
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
