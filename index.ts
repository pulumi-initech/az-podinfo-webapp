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
        maxIntervalInSeconds: 5,
        maxStalenessPrefix: 100,
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
    // Add properties that exist in Azure to match actual state
    analyticalStorageConfiguration: {
        schemaType: azure_native.cosmosdb.AnalyticalStorageSchemaType.WellDefined,
    },
    backupPolicy: {
        type: azure_native.cosmosdb.BackupPolicyType.Periodic,
        periodicModeProperties: {
            backupIntervalInMinutes: 240,
            backupRetentionIntervalInHours: 8,
            backupStorageRedundancy: azure_native.cosmosdb.BackupStorageRedundancy.Geo,
        },
    },
    defaultIdentity: "FirstPartyIdentity",
    disableKeyBasedMetadataWriteAccess: false,
    disableLocalAuth: false,
    enableAnalyticalStorage: false,
    enableBurstCapacity: false,
    enableFreeTier: false,
    enablePartitionMerge: false,
    enablePerRegionPerPartitionAutoscale: false,
    identity: {
        type: azure_native.cosmosdb.ResourceIdentityType.None,
    },
    isVirtualNetworkFilterEnabled: false,
    minimalTlsVersion: azure_native.cosmosdb.MinimalTlsVersion.Tls12,
    networkAclBypass: azure_native.cosmosdb.NetworkAclBypass.None,
    publicNetworkAccess: azure_native.cosmosdb.PublicNetworkAccess.Enabled,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525",
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
    // These properties are computed by Azure, so we ignore them
    ignoreChanges: ["workspaceResourceId", "flowType", "requestSource"],
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
    // Add properties that exist in Azure (shown as removed in diff)
    elasticScaleEnabled: false,
    isSpot: false,
    maximumElasticWorkerCount: 2,
    targetWorkerCount: 0,
    targetWorkerSizeId: 0,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverFarms/podinfo-webapp-28525-plan",
    // Ignore computed properties that Azure sets automatically
    ignoreChanges: ["sku.family", "sku.size", "sku.tier"],
});

// Web App
const webApp = new azure_native.web.WebApp("webApp", {
    name: webAppLogicalName,
    location: location,
    resourceGroupName: resourceGroupName,
    serverFarmId: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/podinfo-webapp-28525-plan",
    kind: "app,linux,container",
    httpsOnly: true,
    reserved: true,
    clientAffinityEnabled: true,
    // Add properties that exist in Azure to match actual state
    clientCertEnabled: false,
    clientCertMode: azure_native.web.ClientCertMode.Required,
    containerSize: 0,
    dailyMemoryTimeQuota: 0,
    enabled: true,
    endToEndEncryptionEnabled: false,
    hostNamesDisabled: false,
    storageAccountRequired: false,
    // Add VNet properties that exist in Azure (shown as removed in diff)
    vnetBackupRestoreEnabled: false,
    vnetContentShareEnabled: false,
    vnetImagePullEnabled: false,
    vnetRouteAllEnabled: false,
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
                privateBytesInKB: 0,
                statusCodes: [{
                    status: 500,
                    subStatus: 0,
                    count: 10,
                    timeInterval: "00:05:00",
                    path: "",
                    win32Status: 0,
                }],
            },
            actions: {
                actionType: azure_native.web.AutoHealActionType.Recycle,
                minProcessExecutionTime: "00:00:00",
            },
        },
        netFrameworkVersion: "v4.0",
        // Add properties that exist in Azure to match actual state
        acrUseManagedIdentityCreds: false,
        appCommandLine: "",
        detailedErrorLoggingEnabled: false,
        elasticWebAppScaleLimit: 0,
        functionsRuntimeScaleMonitoringEnabled: false,
        httpLoggingEnabled: false,
        loadBalancing: azure_native.web.SiteLoadBalancing.LeastRequests,
        localMySqlEnabled: false,
        logsDirectorySizeLimit: 35,
        managedPipelineMode: azure_native.web.ManagedPipelineMode.Integrated,
        minimumElasticInstanceCount: 0,
        nodeVersion: "",
        numberOfWorkers: 1,
        phpVersion: "",
        powerShellVersion: "",
        preWarmedInstanceCount: 0,
        pythonVersion: "",
        remoteDebuggingEnabled: false,
        requestTracingEnabled: false,
        scmIpSecurityRestrictionsUseMain: false,
        scmMinTlsVersion: "1.2",
        scmType: azure_native.web.ScmType.None,
        use32BitWorkerProcess: true,
        vnetName: "",
        vnetPrivatePortsCount: 0,
        vnetRouteAllEnabled: false,
        webSocketsEnabled: false,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525",
    // Only ignore truly computed properties that Azure generates automatically
    ignoreChanges: [
        "customDomainVerificationId", // Generated by Azure
        "hostNameSslStates", // Managed by Azure
        "ipMode", // Computed by Azure
        "keyVaultReferenceIdentity", // Computed by Azure
        "redundancyMode", // Computed by Azure

        // Only ignore siteConfig properties that are truly computed/managed by Azure
        "siteConfig.defaultDocuments", // Azure default list
        "siteConfig.ipSecurityRestrictions", // Default security rules
        "siteConfig.publishingUsername", // Generated by Azure
        "siteConfig.scmIpSecurityRestrictions", // Default SCM security rules
        "siteConfig.virtualApplications", // Default virtual app config
    ],
});

// Web App Application Settings (separate resource as per ARM template structure)
const webAppSettings = new azure_native.web.WebAppApplicationSettings("webAppSettings", {
    name: webApp.name,
    resourceGroupName: resourceGroupName,
    properties: {
        "WEBSITES_ENABLE_APP_SERVICE_STORAGE": "false",
        "DOCKER_REGISTRY_SERVER_URL": "https://index.docker.io",
        "WEBSITES_PORT": containerPort.toString(),
        "APPINSIGHTS_INSTRUMENTATIONKEY": applicationInsights.instrumentationKey,
        "APPLICATIONINSIGHTS_CONNECTION_STRING": applicationInsights.connectionString,
        "COSMOS_DB_ENDPOINT": cosmosDbAccount.documentEndpoint,
        "COSMOS_DB_KEY": pulumi.all([cosmosDbAccount.name, resourceGroupName]).apply(([accountName, rgName]) =>
            azure_native.cosmosdb.listDatabaseAccountKeys({
                accountName: accountName,
                resourceGroupName: rgName,
            }).then(keys => keys.primaryMasterKey!)
        ),
        "COSMOS_DB_DATABASE": cosmosDbDatabaseName,
        "COSMOS_DB_CONTAINER": cosmosDbContainerName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525/config/appsettings",
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