import * as pulumi from "@pulumi/pulumi";
import * as azure_native from "@pulumi/azure-native";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as applicationinsights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";

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
const webAppName = appName;
const applicationInsightsName = `${appName}-insights`;

// Create Cosmos DB Account
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
        locationName: "East US", // Match Azure's format
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}`,
});

// Create Cosmos DB SQL Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
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
        conflictResolutionPolicy: {
            mode: "LastWriterWins",
            conflictResolutionPath: "/_ts",
            conflictResolutionProcedure: "",
        },
    },
}, {
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosDbAccountName}/sqlDatabases/${cosmosDbDatabaseName}/containers/${cosmosDbContainerName}`,
});

// Create Application Insights
const applicationInsights = new applicationinsights.Component("applicationInsights", {
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Insights/components/${applicationInsightsName}`,
    ignoreChanges: ["flowType", "requestSource"],
});

// Create App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroupName,
    location: location,
    sku: {
        name: "P1v2", // Match Azure's actual case
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
const webApp = new web.WebApp("webApp", {
    name: webAppName,
    resourceGroupName: resourceGroupName,
    location: location,
    serverFarmId: appServicePlan.id,
    kind: "app,linux,container",
    httpsOnly: true,
    reserved: true, // Linux app service plan
    clientAffinityEnabled: true,
    clientCertEnabled: false,
    clientCertMode: "Required",
    containerSize: 0,
    dailyMemoryTimeQuota: 0,
    enabled: true,
    endToEndEncryptionEnabled: false,
    hostNamesDisabled: false,
    ipMode: "IPv4",
    keyVaultReferenceIdentity: "SystemAssigned",
    redundancyMode: "None",
    storageAccountRequired: false,
    vnetBackupRestoreEnabled: false,
    vnetContentShareEnabled: false,
    vnetImagePullEnabled: false,
    vnetRouteAllEnabled: false,
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
            "hostingstart.html"
        ],
        detailedErrorLoggingEnabled: false,
        elasticWebAppScaleLimit: 0,
        functionsRuntimeScaleMonitoringEnabled: false,
        httpLoggingEnabled: false,
        ipSecurityRestrictions: [{
            action: "Allow",
            description: "Allow all access",
            ipAddress: "Any",
            name: "Allow all",
            priority: 2147483647,
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
            action: "Allow",
            description: "Allow all access",
            ipAddress: "Any",
            name: "Allow all",
            priority: 2147483647,
        }],
        scmIpSecurityRestrictionsUseMain: false,
        scmMinTlsVersion: "1.2",
        scmType: "None",
        use32BitWorkerProcess: true,
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
    import: `/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/sites/${webAppName}`,
    ignoreChanges: ["customDomainVerificationId"],
});

// Note: Web App Configuration is handled within the WebApp resource's siteConfig
// The ARM template's Microsoft.Web/sites/config resource is merged into the WebApp above

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => 
    hostname ? `https://${hostname}` : ""
);
export const webAppName_output = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;