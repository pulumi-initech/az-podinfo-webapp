import * as pulumi from "@pulumi/pulumi";
import * as azure_native from "@pulumi/azure-native";

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

// Get the resource group name from config
const resourceGroupName = config.require("resourceGroupName");

// Variables (equivalent to ARM template variables)
const appServicePlanName = `${appName}-plan`;
const webAppLogicalName = appName;
const applicationInsightsName = `${appName}-insights`;

// 1. Cosmos DB Account
const cosmosDbAccount = new azure_native.cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    location: location,
    databaseAccountOfferType: azure_native.cosmosdb.DatabaseAccountOfferType.Standard,
    consistencyPolicy: {
        defaultConsistencyLevel: azure_native.cosmosdb.DefaultConsistencyLevel.Session,
        maxIntervalInSeconds: 5,
        maxStalenessPrefix: 100,
    },
    locations: [{
        locationName: "East US", // Match Azure's location format
        failoverPriority: 0,
        isZoneRedundant: false,
    }],
    capabilities: [{
        name: "EnableServerless",
    }],
    enableAutomaticFailover: false,
    enableMultipleWriteLocations: false,
    createMode: azure_native.cosmosdb.CreateMode.Default,
    backupPolicy: {
        type: azure_native.cosmosdb.BackupPolicyType.Periodic,
        periodicModeProperties: {
            backupIntervalInMinutes: 240,
            backupRetentionIntervalInHours: 8,
            backupStorageRedundancy: azure_native.cosmosdb.BackupStorageRedundancy.Geo,
        },
    },
    minimalTlsVersion: azure_native.cosmosdb.MinimalTlsVersion.Tls12,
    publicNetworkAccess: azure_native.cosmosdb.PublicNetworkAccess.Enabled,
    networkAclBypass: azure_native.cosmosdb.NetworkAclBypass.None,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525",
    ignoreChanges: ["analyticalStorageConfiguration", "defaultIdentity", "disableKeyBasedMetadataWriteAccess", "disableLocalAuth", "enableAnalyticalStorage", "enableBurstCapacity", "enableFreeTier", "enablePartitionMerge", "enablePerRegionPerPartitionAutoscale", "identity", "isVirtualNetworkFilterEnabled"],
});

// 2. Cosmos DB SQL Database
const cosmosDbDatabase = new azure_native.cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabaseName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb",
});

// 3. Cosmos DB SQL Container
const cosmosDbContainer = new azure_native.cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabase.name,
    containerName: cosmosDbContainerName,
    resourceGroupName: resourceGroupName,
    resource: {
        id: cosmosDbContainerName,
        partitionKey: {
            paths: ["/id"],
            kind: azure_native.cosmosdb.PartitionKind.Hash,
        },
        indexingPolicy: {
            indexingMode: azure_native.cosmosdb.IndexingMode.Consistent,
            automatic: true,
            includedPaths: [{
                path: "/*",
            }],
            excludedPaths: [{
                path: "/\"_etag\"/?",
            }],
        },
        conflictResolutionPolicy: {
            mode: azure_native.cosmosdb.ConflictResolutionMode.LastWriterWins,
            conflictResolutionPath: "/_ts",
            conflictResolutionProcedure: "",
        },
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb/containers/items",
});

// 4. Application Insights
const applicationInsights = new azure_native.applicationinsights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "web",
    applicationType: azure_native.applicationinsights.ApplicationType.Web,
    retentionInDays: 90,
    publicNetworkAccessForIngestion: azure_native.applicationinsights.PublicNetworkAccessType.Enabled,
    publicNetworkAccessForQuery: azure_native.applicationinsights.PublicNetworkAccessType.Enabled,
    flowType: azure_native.applicationinsights.FlowType.Bluefield,
    requestSource: azure_native.applicationinsights.RequestSource.Rest,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights",
    ignoreChanges: ["workspaceResourceId"],
});

// 5. App Service Plan
const appServicePlan = new azure_native.web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroupName,
    location: location,
    sku: {
        name: "P1v2", // Match Azure's actual SKU name format
        capacity: appServicePlanCapacity,
        family: "Pv2",
        size: "P1v2",
        tier: "PremiumV2",
    },
    kind: "linux",
    reserved: true,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverFarms/podinfo-webapp-28525-plan",
    ignoreChanges: ["elasticScaleEnabled", "isSpot", "maximumElasticWorkerCount", "targetWorkerCount", "targetWorkerSizeId"],
});

// 6. Web App
const webApp = new azure_native.web.WebApp("webApp", {
    name: webAppLogicalName,
    resourceGroupName: resourceGroupName,
    location: location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    kind: "app,linux,container",
    reserved: true, // Match Azure's actual value for Linux apps
    clientAffinityEnabled: true,
    clientCertEnabled: false,
    clientCertMode: azure_native.web.ClientCertMode.Required,
    enabled: true,
    siteConfig: {
        linuxFxVersion: `DOCKER|${containerImage}`,
        alwaysOn: true,
        http20Enabled: true,
        minTlsVersion: "1.2",
        ftpsState: azure_native.web.FtpsState.Disabled,
        healthCheckPath: "/healthz",
        autoHealEnabled: true,
        autoHealRules: {
            triggers: {
                statusCodes: [{
                    status: 500,
                    subStatus: 0,
                    count: 10,
                    timeInterval: "00:05:00",
                    win32Status: 0,
                    path: "",
                }],
                privateBytesInKB: 0,
            },
            actions: {
                actionType: azure_native.web.AutoHealActionType.Recycle,
                minProcessExecutionTime: "00:00:00",
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
                    azure_native.cosmosdb.listDatabaseAccountKeysOutput({
                        accountName: accountName,
                        resourceGroupName: rgName,
                    }).primaryMasterKey
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
    ignoreChanges: ["containerSize", "customDomainVerificationId", "dailyMemoryTimeQuota", "endToEndEncryptionEnabled", "hostNameSslStates", "hostNamesDisabled", "ipMode", "keyVaultReferenceIdentity", "redundancyMode", "storageAccountRequired", "vnetBackupRestoreEnabled", "vnetContentShareEnabled", "vnetImagePullEnabled", "vnetRouteAllEnabled"],
});

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;