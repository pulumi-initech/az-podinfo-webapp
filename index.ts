import * as pulumi from "@pulumi/pulumi";
import * as azure_native from "@pulumi/azure-native";
import * as cosmosdb from "@pulumi/azure-native/cosmosdb";
import * as applicationinsights from "@pulumi/azure-native/applicationinsights";
import * as web from "@pulumi/azure-native/web";
import * as resources from "@pulumi/azure-native/resources";

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

// Variables (equivalent to ARM template variables)
const appServicePlanName = `${appName}-plan`;
const webAppResourceName = appName;
const applicationInsightsName = `${appName}-insights`;

// Create Resource Group (assuming it exists, we'll import it)
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
    // Add missing properties that Azure sets as defaults
    enableAnalyticalStorage: false,
    enableFreeTier: false,
    enablePartitionMerge: false,
    enablePerRegionPerPartitionAutoscale: false,
    enableBurstCapacity: false,
    disableKeyBasedMetadataWriteAccess: false,
    disableLocalAuth: false,
    isVirtualNetworkFilterEnabled: false,
    minimalTlsVersion: "Tls12",
    networkAclBypass: "None",
    publicNetworkAccess: "Enabled",
    defaultIdentity: "FirstPartyIdentity",
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
    identity: {
        type: "None",
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525",
    ignoreChanges: ["createMode"], // This is computed by Azure
});

// Cosmos DB Database
const cosmosDbDatabase = new cosmosdb.SqlResourceSqlDatabase("cosmosDbDatabase", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabaseName,
    resourceGroupName: resourceGroup.name,
    resource: {
        id: cosmosDbDatabaseName,
    },
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.DocumentDB/databaseAccounts/podinfo-cosmosdb-28525/sqlDatabases/appdb"
});

// Cosmos DB Container
const cosmosDbContainer = new cosmosdb.SqlResourceSqlContainer("cosmosDbContainer", {
    accountName: cosmosDbAccount.name,
    databaseName: cosmosDbDatabase.name,
    containerName: cosmosDbContainerName,
    resourceGroupName: resourceGroup.name,
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
        // Add missing conflict resolution policy
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
const applicationInsights = new applicationinsights.Component("applicationInsights", {
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
    ignoreChanges: ["flowType", "requestSource"], // These are computed by Azure
});

// App Service Plan
const appServicePlan = new web.AppServicePlan("appServicePlan", {
    name: appServicePlanName,
    resourceGroupName: resourceGroup.name,
    location: location,
    sku: {
        name: "P1v2", // Match Azure's exact format
        capacity: appServicePlanCapacity,
        family: "Pv2",
        size: "P1v2",
        tier: "PremiumV2",
    },
    kind: "linux",
    reserved: true,
    // Add missing properties that Azure sets as defaults
    elasticScaleEnabled: false,
    isSpot: false,
    maximumElasticWorkerCount: 2,
    targetWorkerCount: 0,
    targetWorkerSizeId: 0,
}, {
    import: "/subscriptions/32b9cb2e-69be-4040-80a6-02cd6b2cc5ec/resourceGroups/podinfo-webapp-rg/providers/Microsoft.Web/serverfarms/podinfo-webapp-28525-plan"
});

// Get Cosmos DB keys using the listDatabaseAccountKeys function
const cosmosDbKeys = cosmosdb.listDatabaseAccountKeysOutput({
    accountName: cosmosDbAccount.name,
    resourceGroupName: resourceGroup.name,
});

// Web App
const webApp = new web.WebApp("webApp", {
    name: webAppResourceName,
    resourceGroupName: resourceGroup.name,
    location: location,
    serverFarmId: appServicePlan.id,
    httpsOnly: true,
    kind: "app,linux,container",
    reserved: true, // Match Azure's actual value
    // Add missing properties that Azure sets as defaults
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
    siteConfig: {
        linuxFxVersion: `DOCKER|${containerImage}`,
        alwaysOn: true,
        http20Enabled: true,
        minTlsVersion: "1.2",
        ftpsState: "Disabled",
        // Add missing siteConfig properties that Azure sets as defaults
        acrUseManagedIdentityCreds: false,
        appCommandLine: "",
        autoHealEnabled: true,
        autoHealRules: {
            actions: {
                actionType: "Recycle",
                minProcessExecutionTime: "00:00:00",
            },
            triggers: {
                privateBytesInKB: 0,
                statusCodes: [{
                    count: 10,
                    path: "",
                    status: 500,
                    subStatus: 0,
                    timeInterval: "00:05:00",
                    win32Status: 0,
                }],
            },
        },
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
        healthCheckPath: "/healthz",
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
                value: cosmosDbKeys.primaryMasterKey,
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
        "customDomainVerificationId", // Computed by Azure
        "hostNameSslStates", // Computed by Azure
    ],
});

// Outputs (equivalent to ARM template outputs)
export const webAppUrl = webApp.defaultHostName.apply(hostname => `https://${hostname}`);
export const webAppName = webApp.name;
export const cosmosDbEndpoint = cosmosDbAccount.documentEndpoint;
export const applicationInsightsKey = applicationInsights.instrumentationKey;