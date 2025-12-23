import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration values from ARM parameters
const config = new pulumi.Config();
const appName = "podinfo-webapp-28525";
const location = "eastus";
const resourceGroupName = "podinfo-webapp-rg";
const cosmosDbAccountName = "podinfo-cosmosdb-28525";
const cosmosDbDatabaseName = "appdb";
const cosmosDbContainerName = "items";
const containerImage = "stefanprodan/podinfo:latest";
const containerPort = 9898;
const appServicePlanSku = "P1V2";
const appServicePlanCapacity = 2;

// Derived names (matching ARM template variables)
const appServicePlanName = `${appName}-plan`;
const applicationInsightsName = `${appName}-insights`;

// Reference existing resource group
const resourceGroup = azure.resources.ResourceGroup.get("resourceGroup", 
    `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}`);

// Cosmos DB Account
const cosmosAccount = new cosmosdb.DatabaseAccount("cosmosAccount", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "GlobalDocumentDB",
    databaseAccountOfferType: "Standard",
    consistencyPolicy: {
        defaultConsistencyLevel: "Session",
    },
    locations: [{
        locationName: "East US",  // Match actual Azure location name
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
        "createMode",
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
        "consistencyPolicy.maxIntervalInSeconds",
        "consistencyPolicy.maxStalenessPrefix",
    ],
});

// Cosmos DB SQL Database
const cosmosDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDatabase", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    databaseName: cosmosDbDatabaseName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    dependsOn: [cosmosAccount],
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb",
});

// Cosmos DB SQL Container
const cosmosContainer = new cosmosdb.SqlResourceSqlContainer("cosmosContainer", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    databaseName: cosmosDbDatabaseName,
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
    dependsOn: [cosmosDatabase],
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb/containers/items",
    ignoreChanges: [
        "resource.conflictResolutionPolicy",
    ],
});

// Application Insights
const appInsights = new insights.Component("appInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights",
    ignoreChanges: [
        "flowType",
        "requestSource",
        "workspaceResourceId",
    ],
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroupName,
    location: location,
    sku: {
        name: "P1v2",  // Match actual SKU name format
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
        "sku.tier",
    ],
});

// Web App
const webApp = new web.WebApp("webApp", {
    name: appName,
    resourceGroupName: resourceGroupName,
    location: location,
    serverFarmId: appServicePlan.id,
    kind: "app,linux,container",
    httpsOnly: true,
    reserved: true,  // Must be true for Linux apps
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
                value: appInsights.instrumentationKey,
            },
            {
                name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
                value: appInsights.connectionString,
            },
            {
                name: "COSMOS_DB_ENDPOINT",
                value: cosmosAccount.documentEndpoint,
            },
            {
                name: "COSMOS_DB_KEY",
                value: pulumi.secret(cosmosAccount.id.apply((id: string) => 
                    cosmosdb.listDatabaseAccountKeys({
                        accountName: cosmosDbAccountName,
                        resourceGroupName: resourceGroupName,
                    }).then((keys: any) => keys.primaryMasterKey!)
                )),
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
    dependsOn: [appServicePlan, appInsights, cosmosAccount],
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525",
    ignoreChanges: [
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
        "siteConfig.vnetRouteAllEnabled",
        "siteConfig.webSocketsEnabled",
    ],
});

// Outputs
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const webAppName = webApp.name;
export const cosmosDbEndpoint = cosmosAccount.documentEndpoint;
export const applicationInsightsKey = appInsights.instrumentationKey;
