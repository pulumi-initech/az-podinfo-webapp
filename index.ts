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
        maxIntervalInSeconds: 5,
        maxStalenessPrefix: 100,
    },
    locations: [{
        locationName: "East US", // Match exact Azure format
        failoverPriority: 0,
        isZoneRedundant: false,
    }],
    capabilities: [{
        name: "EnableServerless",
    }],
    enableAutomaticFailover: false,
    enableMultipleWriteLocations: false,
    analyticalStorageConfiguration: {
        schemaType: cosmosdb.AnalyticalStorageSchemaType.WellDefined,
    },
    backupPolicy: {
        type: cosmosdb.BackupPolicyType.Periodic,
        periodicModeProperties: {
            backupIntervalInMinutes: 240,
            backupRetentionIntervalInHours: 8,
            backupStorageRedundancy: cosmosdb.BackupStorageRedundancy.Geo,
        },
    },
    createMode: cosmosdb.CreateMode.Default,
    defaultIdentity: "FirstPartyIdentity",
    disableKeyBasedMetadataWriteAccess: false,
    disableLocalAuth: false,
    enableAnalyticalStorage: false,
    enableBurstCapacity: false,
    enableFreeTier: false,
    enablePartitionMerge: false,
    enablePerRegionPerPartitionAutoscale: false,
    identity: {
        type: cosmosdb.ResourceIdentityType.None,
    },
    isVirtualNetworkFilterEnabled: false,
    minimalTlsVersion: cosmosdb.MinimalTlsVersion.Tls12,
    networkAclBypass: cosmosdb.NetworkAclBypass.None,
    publicNetworkAccess: cosmosdb.PublicNetworkAccess.Enabled,
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
        conflictResolutionPolicy: {
            mode: cosmosdb.ConflictResolutionMode.LastWriterWins,
            conflictResolutionPath: "/_ts",
            conflictResolutionProcedure: "",
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
    flowType: applicationinsights.FlowType.Bluefield,
    requestSource: applicationinsights.RequestSource.Rest,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights",
    ignoreChanges: ["workspaceResourceId", "flowType", "requestSource"], // Computed properties
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    location: location,
    resourceGroupName: resourceGroupName,
    sku: {
        name: "P1v2", // Match exact Azure case
        capacity: appServicePlanCapacity,
        family: "Pv2",
        size: "P1v2",
        tier: "PremiumV2",
    },
    kind: "linux",
    reserved: true,
    elasticScaleEnabled: false,
    isSpot: false,
    maximumElasticWorkerCount: 2,
    targetWorkerCount: 0,
    targetWorkerSizeId: 0,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverFarms/podinfo-webapp-28525-plan",
});

// Web App
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    location: location,
    resourceGroupName: resourceGroupName,
    serverFarmId: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/podinfo-webapp-28525-plan",
    kind: "app,linux,container",
    httpsOnly: true,
    reserved: true, // Linux apps must have reserved=true
    clientAffinityEnabled: true,
    clientCertEnabled: false,
    clientCertMode: web.ClientCertMode.Required,
    containerSize: 0,
    dailyMemoryTimeQuota: 0,
    enabled: true,
    endToEndEncryptionEnabled: false,
    hostNamesDisabled: false,
    ipMode: web.IPMode.IPv4,
    keyVaultReferenceIdentity: "SystemAssigned",
    redundancyMode: web.RedundancyMode.None,
    storageAccountRequired: false,
    vnetBackupRestoreEnabled: false,
    vnetContentShareEnabled: false,
    vnetImagePullEnabled: false,
    vnetRouteAllEnabled: false,
    // Note: siteConfig is managed separately to avoid import conflicts
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525",
    ignoreChanges: ["customDomainVerificationId", "hostNameSslStates", "siteConfig"], // Computed properties and complex siteConfig
});

// Web App Application Settings (separate resource)
const webAppSettings = new web.WebAppApplicationSettings("webAppSettings", {
    name: webApp.name,
    resourceGroupName: resourceGroupName,
    properties: {
        "WEBSITES_ENABLE_APP_SERVICE_STORAGE": "false",
        "DOCKER_REGISTRY_SERVER_URL": "https://index.docker.io",
        "WEBSITES_PORT": containerPort.toString(),
        "APPINSIGHTS_INSTRUMENTATIONKEY": "0021a90f-64d8-4891-be8d-2432dc2414fd",
        "APPLICATIONINSIGHTS_CONNECTION_STRING": "InstrumentationKey=0021a90f-64d8-4891-be8d-2432dc2414fd;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=47a2489a-e91f-4077-8fe9-f03fe85f20cb",
        "COSMOS_DB_ENDPOINT": "https://podinfo-cosmosdb-28525.documents.azure.com:443/",
        "COSMOS_DB_KEY": "DhUF75BguyrxdXc2lfwDStOtgk6HxZbluB0gyzzDFqJU90u1rMbiXznvO2dczZEJpNg0A93cDv09ACDbKOIRbA==",
        "COSMOS_DB_DATABASE": cosmosDbDatabaseName,
        "COSMOS_DB_CONTAINER": cosmosDbContainerName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525/config/appsettings",
});

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName_output = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
export const cosmosDbContainerId = cosmosDbContainer.id;