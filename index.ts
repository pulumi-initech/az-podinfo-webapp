import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as insights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

// Configuration values from ARM template parameters
const config = new pulumi.Config();
const appName = "podinfo-webapp-28525";
const location = "eastus";
const appServicePlanSku = "P1v2";
const appServicePlanCapacity = 2;
const cosmosDbAccountName = "podinfo-cosmosdb-28525";
const cosmosDbDatabaseName = "appdb";
const cosmosDbContainerName = "items";
const containerImage = "stefanprodan/podinfo:latest";
const containerPort = 9898;

// Derived names matching ARM template variables
const appServicePlanName = `${appName}-plan`;
const webAppName = appName;
const applicationInsightsName = `${appName}-insights`;

// Resource Group (import existing)
const resourceGroup = new resources.ResourceGroup("resourceGroup", {
    resourceGroupName: "podinfo-webapp-rg",
    location: location,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg"
});

// Cosmos DB Account
const cosmosDbAccount = new cosmosdb.DatabaseAccount("cosmosDbAccount", {
    accountName: cosmosDbAccountName,
    resourceGroupName: resourceGroup.name,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525"
});

// Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    resourceGroupName: resourceGroup.name,
    databaseName: cosmosDbDatabaseName,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb"
});

// Cosmos DB SQL Container
const cosmosDbContainer = new cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccount.name,
    resourceGroupName: resourceGroup.name,
    databaseName: cosmosDbDatabase.name,
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
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb/containers/items"
});

// Application Insights
const applicationInsights = new insights.Component("applicationInsights", {
    resourceName: applicationInsightsName,
    resourceGroupName: resourceGroup.name,
    location: location,
    kind: "web",
    applicationType: "web",
    retentionInDays: 90,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
    workspaceResourceId: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/ai_podinfo-webapp-28525-insights_47a2489a-e91f-4077-8fe9-f03fe85f20cb_managed/providers/Microsoft.OperationalInsights/workspaces/managed-podinfo-webapp-28525-insights-ws",
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/podinfo-webapp-28525-insights",
    ignoreChanges: ["flowType", "requestSource"]
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroup.name,
    location: location,
    sku: {
        name: appServicePlanSku,
        capacity: appServicePlanCapacity,
        family: "Pv2",
        size: "P1v2",
        tier: "PremiumV2",
    },
    kind: "linux",
    reserved: true,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/podinfo-webapp-28525-plan"
});

// Get Cosmos DB keys for app settings
const cosmosDbKeys = pulumi.all([resourceGroup.name, cosmosDbAccount.name]).apply(([rgName, accountName]) =>
    cosmosdb.listDatabaseAccountKeys({
        resourceGroupName: rgName,
        accountName: accountName,
    })
);

// Web App
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    resourceGroupName: resourceGroup.name,
    location: location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    kind: "app,linux,container",
    reserved: true,
    clientAffinityEnabled: true,
    clientCertEnabled: false,
    clientCertMode: "Required",
    containerSize: 0,
    customDomainVerificationId: "A3C07EA0CA915FF776DB1D35222A030342D323D3C81A31711C8140114337F716",
    dailyMemoryTimeQuota: 0,
    enabled: true,
    endToEndEncryptionEnabled: false,
    hostNamesDisabled: false,
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
    storageAccountRequired: false,
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
        scmMinTlsVersion: "1.2",
        scmType: "None",
        use32BitWorkerProcess: true,
        vnetName: "",
        vnetPrivatePortsCount: 0,
        vnetRouteAllEnabled: false,
        webSocketsEnabled: false,
        ipSecurityRestrictions: [{
            action: "Allow",
            description: "Allow all access",
            ipAddress: "Any",
            name: "Allow all",
            priority: 2147483647,
        }],
        scmIpSecurityRestrictions: [{
            action: "Allow",
            description: "Allow all access",
            ipAddress: "Any",
            name: "Allow all",
            priority: 2147483647,
        }],
        scmIpSecurityRestrictionsUseMain: false,
        virtualApplications: [{
            physicalPath: "site\\wwwroot",
            preloadEnabled: true,
            virtualPath: "/",
        }],
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525"
});

// Web App Application Settings (managed separately)
const webAppSettings = new web.WebAppApplicationSettings("webAppSettings", {
    name: webApp.name,
    resourceGroupName: resourceGroup.name,
    properties: {
        "WEBSITES_ENABLE_APP_SERVICE_STORAGE": "false",
        "DOCKER_REGISTRY_SERVER_URL": "https://index.docker.io",
        "WEBSITES_PORT": containerPort.toString(),
        "APPINSIGHTS_INSTRUMENTATIONKEY": applicationInsights.instrumentationKey,
        "APPLICATIONINSIGHTS_CONNECTION_STRING": applicationInsights.connectionString,
        "COSMOS_DB_ENDPOINT": cosmosDbAccount.documentEndpoint,
        "COSMOS_DB_KEY": cosmosDbKeys.primaryMasterKey,
        "COSMOS_DB_DATABASE": cosmosDbDatabaseName,
        "COSMOS_DB_CONTAINER": cosmosDbContainerName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/podinfo-webapp-28525/config/appsettings"
});

// Outputs matching ARM template
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const webAppNameOutput = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;
