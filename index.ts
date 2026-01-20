import * as pulumi from "@pulumi/pulumi";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration
const config = new pulumi.Config();
const appName = config.require("appName");
const location = config.get("location") || "eastus";
const resourceGroupName = config.require("resourceGroupName");
const cosmosDbAccountName = config.require("cosmosDbAccountName");
const cosmosDbDatabaseName = config.get("cosmosDbDatabaseName") || "appdb";
const cosmosDbContainerName = config.get("cosmosDbContainerName") || "items";
const appServicePlanSku = config.get("appServicePlanSku") || "P1V2";
const appServicePlanCapacity = config.getNumber("appServicePlanCapacity") || 2;
const containerImage = config.get("containerImage") || "stefanprodan/podinfo:latest";
const containerPort = config.getNumber("containerPort") || 9898;

// Subscription ID for resource IDs
const subscriptionId = config.require("subscriptionId");

// Variables (matching ARM template)
const appServicePlanName = `${appName}-plan`;
const webAppName = appName;
const applicationInsightsName = `${appName}-insights`;

// Cosmos DB Account
const cosmosDbAccount = new cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "GlobalDocumentDB",
    databaseAccountOfferType: "Standard",
    consistencyPolicy: {
        defaultConsistencyLevel: "Session",
        maxIntervalInSeconds: 5,
        maxStalenessPrefix: 100,
    },
    locations: [{
        locationName: "East US",
        failoverPriority: 0,
        isZoneRedundant: false,
    }],
    capabilities: [{
        name: "EnableServerless",
    }],
    enableAutomaticFailover: false,
    enableMultipleWriteLocations: false,
}, {
    import: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}`,
    ignoreChanges: [
        "locations",
        "analyticalStorageConfiguration",
        "backupPolicy",
        "defaultIdentity",
        "disableKeyBasedMetadataWriteAccess",
        "disableLocalAuth",
        "enableAnalyticalStorage",
        "enableBurstCapacity",
        "enableFreeTier",
        "enablePartitionMerge",
        "enablePerRegionPerPartitionAutoscale",
        "identity",
        "isVirtualNetworkFilterEnabled",
        "minimalTlsVersion",
        "networkAclBypass",
        "publicNetworkAccess",
        "createMode",
    ],
});

// Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabaseName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}`,
});

// Cosmos DB SQL Container
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
    import: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}/containers/${cosmosDbContainerName}`,
    ignoreChanges: ["resource.conflictResolutionPolicy"],
});

// Application Insights
const applicationInsights = new insights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
    flowType: "Bluefield",
    requestSource: "rest",
}, {
    import: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Insights/components/${applicationInsightsName}`,
    ignoreChanges: ["workspaceResourceId"],
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroupName,
    location: location,
    sku: {
        name: "P1v2",
        capacity: appServicePlanCapacity,
    },
    kind: "linux",
    reserved: true,
}, {
    import: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Web/serverfarms/${appServicePlanName}`,
    ignoreChanges: [
        "elasticScaleEnabled",
        "isSpot",
        "maximumElasticWorkerCount",
        "targetWorkerCount",
        "targetWorkerSizeId",
        "sku.family",
        "sku.size",
        "sku.tier",
    ],
});

// Web App
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    resourceGroupName: resourceGroupName,
    location: location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    reserved: true,
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
                value: cosmosdb.listDatabaseAccountKeysOutput({
                    accountName: cosmosDbAccount.name,
                    resourceGroupName: resourceGroupName,
                }).primaryMasterKey,
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
    import: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Web/sites/${webAppName}`,
    ignoreChanges: [
        "siteConfig",
        "clientAffinityEnabled",
        "clientCertEnabled",
        "clientCertMode",
        "containerSize",
        "customDomainVerificationId",
        "dailyMemoryTimeQuota",
        "enabled",
        "endToEndEncryptionEnabled",
        "hostNameSslStates",
        "hostNamesDisabled",
        "ipMode",
        "keyVaultReferenceIdentity",
        "redundancyMode",
        "storageAccountRequired",
        "vnetBackupRestoreEnabled",
        "vnetContentShareEnabled",
        "vnetImagePullEnabled",
        "vnetRouteAllEnabled",
    ],
});

// Exports
export const webAppUrl = webApp.defaultHostName.apply(hostname => `https://${hostname}`);
export const webAppName_output = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
