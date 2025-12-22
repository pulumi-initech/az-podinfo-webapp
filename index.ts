import * as pulumi from "@pulumi/pulumi";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration values from ARM template parameters
const config = new pulumi.Config();
const appName = "podinfo-webapp-28525";
const location = "eastus";
const cosmosDbAccountName = "podinfo-cosmosdb-28525";
const cosmosDbDatabaseName = "appdb";
const cosmosDbContainerName = "items";
const containerImage = "stefanprodan/podinfo:latest";
const containerPort = 9898;
const appServicePlanSku = "P1v2";
const appServicePlanCapacity = 2;

// Resource Group (existing)
const resourceGroupName = "podinfo-webapp-rg";

// Cosmos DB Account with serverless capability
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
    publicNetworkAccess: "Enabled",
    disableLocalAuth: false,
    backupPolicy: {
        type: "Periodic",
        periodicModeProperties: {
            backupIntervalInMinutes: 240,
            backupRetentionIntervalInHours: 8,
            backupStorageRedundancy: "Geo",
        },
    },
    analyticalStorageConfiguration: {
        schemaType: "WellDefined",
    },
    defaultIdentity: "FirstPartyIdentity",
    disableKeyBasedMetadataWriteAccess: false,
    enableAnalyticalStorage: false,
    enableBurstCapacity: false,
    enableFreeTier: false,
    enablePartitionMerge: false,
    enablePerRegionPerPartitionAutoscale: false,
    identity: {
        type: "None",
    },
    isVirtualNetworkFilterEnabled: false,
    minimalTlsVersion: "Tls12",
    networkAclBypass: "None",
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}`,
});

// Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroupName,
    databaseName: cosmosDbDatabaseName,
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
        conflictResolutionPolicy: {
            mode: "LastWriterWins",
            conflictResolutionPath: "/_ts",
            conflictResolutionProcedure: "",
        },
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}/containers/${cosmosDbContainerName}`,
    dependsOn: [cosmosDbDatabase],
});

// Application Insights
const applicationInsights = new insights.Component("applicationInsights", {
    resourceName: `${appName}-insights`,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
    workspaceResourceId: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/ai_podinfo-webapp-28525-insights_47a2489a-e91f-4077-8fe9-f03fe85f20cb_managed/providers/Microsoft.OperationalInsights/workspaces/managed-podinfo-webapp-28525-insights-ws",
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/microsoft.insights/components/${appName}-insights`,
    ignoreChanges: ["flowType", "requestSource"],
});

// App Service Plan (Linux)
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: `${appName}-plan`,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "linux",
    reserved: true,
    sku: {
        name: appServicePlanSku,
        capacity: appServicePlanCapacity,
        tier: "PremiumV2",
        size: appServicePlanSku,
        family: "Pv2",
    },
    elasticScaleEnabled: false,
    isSpot: false,
    maximumElasticWorkerCount: 2,
    targetWorkerCount: 0,
    targetWorkerSizeId: 0,
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.Web/serverfarms/${appName}-plan`,
});

// Web App with container configuration
const webApp = new web.WebApp("webApp", {
    name: appName,
    resourceGroupName: resourceGroupName,
    location: location,
    kind: "app,linux,container",
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    reserved: true,
    enabled: true,
    clientAffinityEnabled: true,
    clientCertEnabled: false,
    clientCertMode: "Required",
    containerSize: 0,
    hostNamesDisabled: false,
    storageAccountRequired: false,
    customDomainVerificationId: "A3C07EA0CA915FF776DB1D35222A030342D323D3C81A31711C8140114337F716",
    dailyMemoryTimeQuota: 0,
    endToEndEncryptionEnabled: false,
    hostNameSslStates: [
        {
            hostType: "Standard",
            name: "podinfo-webapp-28525.azurewebsites.net",
            sslState: "Disabled",
        },
        {
            hostType: "Repository",
            name: "podinfo-webapp-28525.scm.azurewebsites.net",
            sslState: "Disabled",
        },
    ],
    ipMode: "IPv4",
    keyVaultReferenceIdentity: "SystemAssigned",
    redundancyMode: "None",
    vnetBackupRestoreEnabled: false,
    vnetContentShareEnabled: false,
    vnetImagePullEnabled: false,
    vnetRouteAllEnabled: false,
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
                actionType: "Recycle",
                minProcessExecutionTime: "00:00:00",
            },
        },
        numberOfWorkers: 1,
        netFrameworkVersion: "v4.0",
        phpVersion: "",
        pythonVersion: "",
        nodeVersion: "",
        powerShellVersion: "",
        requestTracingEnabled: false,
        remoteDebuggingEnabled: false,
        httpLoggingEnabled: false,
        detailedErrorLoggingEnabled: false,
        scmType: "None",
        use32BitWorkerProcess: true,
        localMySqlEnabled: false,
        managedPipelineMode: "Integrated",
        loadBalancing: "LeastRequests",
        acrUseManagedIdentityCreds: false,
        appCommandLine: "",
        defaultDocuments: [
            "Default.htm",
            "Default.html",
            "Default.asp",
            "index.htm",
            "index.html",
            "iisstart.htm",
            "default.aspx",
            "index.php",
            "hostingstart.html",
        ],
        elasticWebAppScaleLimit: 0,
        functionsRuntimeScaleMonitoringEnabled: false,
        ipSecurityRestrictions: [{
            action: "Allow",
            description: "Allow all access",
            ipAddress: "Any",
            name: "Allow all",
            priority: 2147483647,
        }],
        logsDirectorySizeLimit: 35,
        minimumElasticInstanceCount: 0,
        preWarmedInstanceCount: 0,
        publishingUsername: "$podinfo-webapp-28525",
        scmIpSecurityRestrictions: [{
            action: "Allow",
            description: "Allow all access",
            ipAddress: "Any",
            name: "Allow all",
            priority: 2147483647,
        }],
        scmIpSecurityRestrictionsUseMain: false,
        scmMinTlsVersion: "1.2",
        virtualApplications: [{
            physicalPath: "site\\wwwroot",
            preloadEnabled: true,
            virtualPath: "/",
        }],
        vnetName: "",
        vnetPrivatePortsCount: 0,
        vnetRouteAllEnabled: false,
        webSocketsEnabled: false,
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.Web/sites/${appName}`,
    dependsOn: [appServicePlan, applicationInsights, cosmosDbAccount],
});

// Export outputs
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const webAppName = webApp.name;
