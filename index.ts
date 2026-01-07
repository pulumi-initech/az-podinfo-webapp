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
const resourceGroupName = config.require("resourceGroupName");

// Variables (equivalent to ARM template variables)
const appServicePlanName = `${appName}-plan`;
const webAppLogicalName = appName;
const applicationInsightsName = `${appName}-insights`;

// Cosmos DB Account
const cosmosDbAccount = new azure_native.cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    location: location,
    resourceGroupName: resourceGroupName,
    databaseAccountOfferType: azure_native.cosmosdb.DatabaseAccountOfferType.Standard,
    consistencyPolicy: {
        defaultConsistencyLevel: azure_native.cosmosdb.DefaultConsistencyLevel.Session,
    },
    locations: [{
        locationName: "East US", // Match Azure's location name format
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
    ignoreChanges: [
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
        "publicNetworkAccess"
    ],
});

// Cosmos DB SQL Database
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

// Cosmos DB SQL Container
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
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb/containers/items",
    ignoreChanges: ["resource.conflictResolutionPolicy"],
});

// Application Insights
const applicationInsights = new azure_native.applicationinsights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    location: location,
    resourceGroupName: resourceGroupName,
    kind: "web",
    applicationType: azure_native.applicationinsights.ApplicationType.Web,
    retentionInDays: 90,
    publicNetworkAccessForIngestion: azure_native.applicationinsights.PublicNetworkAccessType.Enabled,
    publicNetworkAccessForQuery: azure_native.applicationinsights.PublicNetworkAccessType.Enabled,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights",
    ignoreChanges: ["flowType", "requestSource", "workspaceResourceId"],
});

// App Service Plan
const appServicePlan = new azure_native.web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    location: location,
    resourceGroupName: resourceGroupName,
    sku: {
        name: "P1v2", // Match Azure's actual SKU name format
        capacity: appServicePlanCapacity,
    },
    kind: "linux",
    reserved: true,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverFarms/podinfo-webapp-28525-plan",
    ignoreChanges: [
        "elasticScaleEnabled",
        "isSpot", 
        "maximumElasticWorkerCount",
        "targetWorkerCount",
        "targetWorkerSizeId",
        "sku.family",
        "sku.size", 
        "sku.tier"
    ],
});

// Web App
const webApp = new azure_native.web.WebApp("webApp", {
    name: webAppLogicalName,
    location: location,
    resourceGroupName: resourceGroupName,
    serverFarmId: appServicePlan.id,
    kind: "app,linux,container",
    httpsOnly: true,
    reserved: true,
    clientAffinityEnabled: true,
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
                }],
            },
            actions: {
                actionType: azure_native.web.AutoHealActionType.Recycle,
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
                    azure_native.cosmosdb.listDatabaseAccountKeys({
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
    ignoreChanges: [
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
        "siteConfig.acrUseManagedIdentityCreds",
        "siteConfig.appCommandLine",
        "siteConfig.defaultDocuments",
        "siteConfig.detailedErrorLoggingEnabled",
        "siteConfig.elasticWebAppScaleLimit",
        "siteConfig.functionsRuntimeScaleMonitoringEnabled",
        "siteConfig.httpLoggingEnabled",
        "siteConfig.ipSecurityRestrictions",
        "siteConfig.loadBalancing",
        "siteConfig.localMySqlEnabled",
        "siteConfig.logsDirectorySizeLimit",
        "siteConfig.managedPipelineMode",
        "siteConfig.minimumElasticInstanceCount",
        "siteConfig.netFrameworkVersion",
        "siteConfig.nodeVersion",
        "siteConfig.numberOfWorkers",
        "siteConfig.phpVersion",
        "siteConfig.powerShellVersion",
        "siteConfig.preWarmedInstanceCount",
        "siteConfig.publishingUsername",
        "siteConfig.pythonVersion",
        "siteConfig.remoteDebuggingEnabled",
        "siteConfig.requestTracingEnabled",
        "siteConfig.scmIpSecurityRestrictions",
        "siteConfig.scmIpSecurityRestrictionsUseMain",
        "siteConfig.scmMinTlsVersion",
        "siteConfig.scmType",
        "siteConfig.use32BitWorkerProcess",
        "siteConfig.virtualApplications",
        "siteConfig.vnetName",
        "siteConfig.vnetPrivatePortsCount",
        "siteConfig.webSocketsEnabled"
    ],
});

// Note: Health check and auto-heal configuration is included in the WebApp siteConfig above
// The ARM template's Microsoft.Web/sites/config resource is represented by the siteConfig properties

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;