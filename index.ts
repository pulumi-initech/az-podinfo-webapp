import * as pulumi from "@pulumi/pulumi";
import * as azure_native from "@pulumi/azure-native";

// Get configuration values
const config = new pulumi.Config();
const appName = config.require("appName");
const location = config.get("location") || "eastus";
// appServicePlanSku is hardcoded to match Azure's exact format
const appServicePlanCapacity = config.getNumber("appServicePlanCapacity") || 2;
const cosmosDbAccountName = config.require("cosmosDbAccountName");
const cosmosDbDatabaseName = config.get("cosmosDbDatabaseName") || "appdb";
const cosmosDbContainerName = config.get("cosmosDbContainerName") || "items";
const containerImage = config.get("containerImage") || "stefanprodan/podinfo:latest";
const containerPort = config.getNumber("containerPort") || 9898;
const resourceGroupName = config.require("resourceGroupName");

// Variables (equivalent to ARM template variables)
const appServicePlanName = `${appName}-plan`;
const applicationInsightsName = `${appName}-insights`;

// Create Cosmos DB Account
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
        locationName: "East US", // Use the exact format from Azure
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

// Create Cosmos DB SQL Database
const cosmosDbDatabase = new azure_native.cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
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
new azure_native.cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}/containers/${cosmosDbContainerName}`,
    ignoreChanges: [
        "resource.conflictResolutionPolicy"
    ],
});

// Create Application Insights
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/${applicationInsightsName}`,
    ignoreChanges: [
        "workspaceResourceId",
        "flowType",
        "requestSource"
    ],
});

// Create App Service Plan
const appServicePlan = new azure_native.web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    location: location,
    resourceGroupName: resourceGroupName,
    sku: {
        name: "P1v2", // Use the exact case from Azure
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/${appServicePlanName}`,
});

// Create Web App
const webApp = new azure_native.web.WebApp("webApp", {
    name: appName,
    location: location,
    resourceGroupName: resourceGroupName,
    serverFarmId: appServicePlan.id,
    kind: "app,linux,container",
    httpsOnly: true,
    reserved: true, // Required for Linux apps
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
        use32BitWorkerProcess: true,
        netFrameworkVersion: "v4.0",
        loadBalancing: azure_native.web.SiteLoadBalancing.LeastRequests,
        managedPipelineMode: azure_native.web.ManagedPipelineMode.Integrated,
        remoteDebuggingEnabled: false,
        requestTracingEnabled: false,
        httpLoggingEnabled: false,
        detailedErrorLoggingEnabled: false,
        publishingUsername: `$${appName}`,
        scmType: azure_native.web.ScmType.None,
        webSocketsEnabled: false,
        localMySqlEnabled: false,
        numberOfWorkers: 1,
        defaultDocuments: [
            "Default.htm",
            "Default.html", 
            "Default.asp",
            "index.htm",
            "index.html",
            "iisstart.htm",
            "default.aspx",
            "index.php",
            "hostingstart.html"
        ],
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/${appName}`,
    ignoreChanges: [
        "hostNames",
        "repositorySiteName", 
        "state",
        "customDomainVerificationId",
        "hostNameSslStates",
        "containerSize",
        "dailyMemoryTimeQuota",
        "endToEndEncryptionEnabled",
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
        "siteConfig.elasticWebAppScaleLimit",
        "siteConfig.functionsRuntimeScaleMonitoringEnabled",
        "siteConfig.ipSecurityRestrictions",
        "siteConfig.logsDirectorySizeLimit",
        "siteConfig.minimumElasticInstanceCount",
        "siteConfig.nodeVersion",
        "siteConfig.phpVersion",
        "siteConfig.powerShellVersion",
        "siteConfig.preWarmedInstanceCount",
        "siteConfig.pythonVersion",
        "siteConfig.scmIpSecurityRestrictions",
        "siteConfig.scmIpSecurityRestrictionsUseMain",
        "siteConfig.scmMinTlsVersion",
        "siteConfig.virtualApplications",
        "siteConfig.vnetName",
        "siteConfig.vnetPrivatePortsCount",
        "siteConfig.vnetRouteAllEnabled"
    ],
});

// Create Web App Application Settings (separate resource)
new azure_native.web.WebAppApplicationSettings("webAppSettings", {
    name: webApp.name,
    resourceGroupName: resourceGroupName,
    properties: {
        "WEBSITES_ENABLE_APP_SERVICE_STORAGE": "false",
        "DOCKER_REGISTRY_SERVER_URL": "https://index.docker.io",
        "WEBSITES_PORT": containerPort.toString(),
        "APPINSIGHTS_INSTRUMENTATIONKEY": applicationInsights.instrumentationKey,
        "APPLICATIONINSIGHTS_CONNECTION_STRING": applicationInsights.connectionString,
        "COSMOS_DB_ENDPOINT": cosmosDbAccount.documentEndpoint,
        "COSMOS_DB_KEY": cosmosDbAccount.name.apply(accountName => 
            azure_native.cosmosdb.listDatabaseAccountKeys({
                accountName: accountName,
                resourceGroupName: resourceGroupName,
            }).then(keys => keys.primaryMasterKey!)
        ),
        "COSMOS_DB_DATABASE": cosmosDbDatabaseName,
        "COSMOS_DB_CONTAINER": cosmosDbContainerName,
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/${appName}/config/appsettings`,
});

// Export outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;