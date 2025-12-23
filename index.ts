import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

const config = new pulumi.Config("azure-native");
const location = config.get("location") || "eastus";

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
    createMode: "Default",
    analyticalStorageConfiguration: {
        schemaType: "WellDefined",
    },
    backupPolicy: {
        type: "Periodic",
        periodicModeProperties: {
            backupIntervalInMinutes: 240,
            backupRetentionIntervalInHours: 8,
            backupStorageRedundancy: "Geo",
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
        type: "None",
    },
    isVirtualNetworkFilterEnabled: false,
    minimalTlsVersion: "Tls12",
    networkAclBypass: "None",
    publicNetworkAccess: "Enabled",
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
    workspaceResourceId: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/ai_podinfo-webapp-28525-insights_47a2489a-e91f-4077-8fe9-f03fe85f20cb_managed/providers/Microsoft.OperationalInsights/workspaces/managed-podinfo-webapp-28525-insights-ws",
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/${resourceGroupName}/providers/Microsoft.Insights/components/${applicationInsightsName}`,
    ignoreChanges: ["flowType", "requestSource"],
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
        name: "P1v2",
        tier: "PremiumV2",
        size: "P1v2",
        family: "Pv2",
        capacity: 2,
    },
    elasticScaleEnabled: false,
    isSpot: false,
    maximumElasticWorkerCount: 2,
    targetWorkerCount: 0,
    targetWorkerSizeId: 0,
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
    reserved: true,
    clientAffinityEnabled: true,
    clientCertEnabled: false,
    clientCertMode: "Required",
    containerSize: 0,
    customDomainVerificationId: "A3C07EA0CA915FF776DB1D35222A030342D323D3C81A31711C8140114337F716",
    dailyMemoryTimeQuota: 0,
    enabled: true,
    endToEndEncryptionEnabled: false,
    hostNameSslStates: [
        {
            name: "podinfo-webapp-28525.azurewebsites.net",
            sslState: "Disabled",
            hostType: "Standard",
        },
        {
            name: "podinfo-webapp-28525.scm.azurewebsites.net",
            sslState: "Disabled",
            hostType: "Repository",
        },
    ],
    hostNamesDisabled: false,
    ipMode: "IPv4",
    keyVaultReferenceIdentity: "SystemAssigned",
    redundancyMode: "None",
    storageAccountRequired: false,
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
                actionType: "Recycle",
                minProcessExecutionTime: "00:00:00",
            },
        },
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
        detailedErrorLoggingEnabled: false,
        elasticWebAppScaleLimit: 0,
        functionsRuntimeScaleMonitoringEnabled: false,
        httpLoggingEnabled: false,
        ipSecurityRestrictions: [{
            ipAddress: "Any",
            action: "Allow",
            priority: 2147483647,
            name: "Allow all",
            description: "Allow all access",
        }],
        loadBalancing: "LeastRequests",
        localMySqlEnabled: false,
        logsDirectorySizeLimit: 35,
        managedPipelineMode: "Integrated",
        minimumElasticInstanceCount: 0,
        netFrameworkVersion: "v4.0",
        nodeVersion: "",
        numberOfWorkers: 1,
        phpVersion: "",
        powerShellVersion: "",
        preWarmedInstanceCount: 0,
        publishingUsername: "$podinfo-webapp-28525",
        pythonVersion: "",
        remoteDebuggingEnabled: false,
        requestTracingEnabled: false,
        scmIpSecurityRestrictions: [{
            ipAddress: "Any",
            action: "Allow",
            priority: 2147483647,
            name: "Allow all",
            description: "Allow all access",
        }],
        scmIpSecurityRestrictionsUseMain: false,
        scmMinTlsVersion: "1.2",
        scmType: "None",
        use32BitWorkerProcess: true,
        virtualApplications: [{
            virtualPath: "/",
            physicalPath: "site\\wwwroot",
            preloadEnabled: true,
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
