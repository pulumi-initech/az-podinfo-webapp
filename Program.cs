using Pulumi;
using Pulumi.AzureNative.CosmosDB;
using Pulumi.AzureNative.CosmosDB.Inputs;
using Pulumi.AzureNative.ApplicationInsights;
using Pulumi.AzureNative.Web;
using Pulumi.AzureNative.Web.Inputs;
using System.Collections.Generic;

return await Pulumi.Deployment.RunAsync(() =>
{
    var config = new Config();
    
    // Get configuration values
    var appName = config.Require("appName");
    var location = config.Get("location") ?? "eastus";
    var resourceGroupName = config.Require("resourceGroupName");
    var appServicePlanSku = config.Get("appServicePlanSku") ?? "P1V2";
    var appServicePlanCapacity = config.GetInt32("appServicePlanCapacity") ?? 2;
    var cosmosDbAccountName = config.Require("cosmosDbAccountName");
    var cosmosDbDatabaseName = config.Get("cosmosDbDatabaseName") ?? "appdb";
    var cosmosDbContainerName = config.Get("cosmosDbContainerName") ?? "items";
    var containerImage = config.Get("containerImage") ?? "stefanprodan/podinfo:latest";
    var containerPort = config.GetInt32("containerPort") ?? 9898;
    
    // Derived names
    var appServicePlanName = $"{appName}-plan";
    var webAppName = appName;
    var applicationInsightsName = $"{appName}-insights";
    
    // Get subscription ID for resource IDs
    var subscriptionId = config.Require("subscriptionId");
    
    // Cosmos DB Account
    var cosmosDbAccount = new DatabaseAccount("cosmosDbAccount", new DatabaseAccountArgs
    {
        AccountName = cosmosDbAccountName,
        ResourceGroupName = resourceGroupName,
        Location = location,
        Kind = "GlobalDocumentDB",
        DatabaseAccountOfferType = DatabaseAccountOfferType.Standard,
        ConsistencyPolicy = new ConsistencyPolicyArgs
        {
            DefaultConsistencyLevel = DefaultConsistencyLevel.Session
        },
        Locations = new[]
        {
            new LocationArgs
            {
                LocationName = location,
                FailoverPriority = 0,
                IsZoneRedundant = false
            }
        },
        Capabilities = new[]
        {
            new Pulumi.AzureNative.CosmosDB.Inputs.CapabilityArgs
            {
                Name = "EnableServerless"
            }
        },
        EnableAutomaticFailover = false,
        EnableMultipleWriteLocations = false
    }, new CustomResourceOptions
    {
        Import = $"/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/{cosmosDbAccountName}"
    });
    
    // Cosmos DB SQL Database
    var cosmosDbDatabase = new SqlResourceSqlDatabase("cosmosDbDatabase", new SqlResourceSqlDatabaseArgs
    {
        AccountName = cosmosDbAccount.Name,
        ResourceGroupName = resourceGroupName,
        DatabaseName = cosmosDbDatabaseName,
        Resource = new SqlDatabaseResourceArgs
        {
            Id = cosmosDbDatabaseName
        }
    }, new CustomResourceOptions
    {
        Import = $"/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/{cosmosDbAccountName}/sqlDatabases/{cosmosDbDatabaseName}",
        DependsOn = { cosmosDbAccount }
    });
    
    // Cosmos DB SQL Container
    var cosmosDbContainer = new SqlResourceSqlContainer("cosmosDbContainer", new SqlResourceSqlContainerArgs
    {
        AccountName = cosmosDbAccount.Name,
        ResourceGroupName = resourceGroupName,
        DatabaseName = cosmosDbDatabase.Name,
        ContainerName = cosmosDbContainerName,
        Resource = new SqlContainerResourceArgs
        {
            Id = cosmosDbContainerName,
            PartitionKey = new ContainerPartitionKeyArgs
            {
                Paths = new[] { "/id" },
                Kind = "Hash"
            },
            IndexingPolicy = new IndexingPolicyArgs
            {
                IndexingMode = "consistent",
                Automatic = true,
                IncludedPaths = new[]
                {
                    new IncludedPathArgs
                    {
                        Path = "/*"
                    }
                },
                ExcludedPaths = new[]
                {
                    new ExcludedPathArgs
                    {
                        Path = "/\"_etag\"/?"
                    }
                }
            }
        }
    }, new CustomResourceOptions
    {
        Import = $"/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/{cosmosDbAccountName}/sqlDatabases/{cosmosDbDatabaseName}/containers/{cosmosDbContainerName}",
        DependsOn = { cosmosDbDatabase }
    });
    
    // Application Insights
    var applicationInsights = new Component("applicationInsights", new ComponentArgs
    {
        ResourceName = applicationInsightsName,
        ResourceGroupName = resourceGroupName,
        Location = location,
        Kind = "web",
        ApplicationType = "web",
        RetentionInDays = 90,
        PublicNetworkAccessForIngestion = "Enabled",
        PublicNetworkAccessForQuery = "Enabled"
    }, new CustomResourceOptions
    {
        Import = $"/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Insights/components/{applicationInsightsName}"
    });
    
    // App Service Plan
    var appServicePlan = new AppServicePlan("appServicePlan", new AppServicePlanArgs
    {
        Name = appServicePlanName,
        ResourceGroupName = resourceGroupName,
        Location = location,
        Kind = "linux",
        Reserved = true,
        Sku = new SkuDescriptionArgs
        {
            Name = appServicePlanSku,
            Capacity = appServicePlanCapacity
        }
    }, new CustomResourceOptions
    {
        Import = $"/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Web/serverfarms/{appServicePlanName}"
    });
    
    // Get Cosmos DB keys for app settings
    var cosmosDbKeys = ListDatabaseAccountKeys.Invoke(new ListDatabaseAccountKeysInvokeArgs
    {
        AccountName = cosmosDbAccount.Name,
        ResourceGroupName = resourceGroupName
    });
    
    // Web App
    var webApp = new WebApp("webApp", new WebAppArgs
    {
        Name = webAppName,
        ResourceGroupName = resourceGroupName,
        Location = location,
        Kind = "app,linux,container",
        ServerFarmId = appServicePlan.Id,
        HttpsOnly = true,
        SiteConfig = new SiteConfigArgs
        {
            LinuxFxVersion = $"DOCKER|{containerImage}",
            AlwaysOn = true,
            Http20Enabled = true,
            MinTlsVersion = "1.2",
            FtpsState = "Disabled",
            HealthCheckPath = "/healthz",
            AutoHealEnabled = true,
            AutoHealRules = new AutoHealRulesArgs
            {
                Triggers = new AutoHealTriggersArgs
                {
                    StatusCodes = new[]
                    {
                        new StatusCodesBasedTriggerArgs
                        {
                            Status = 500,
                            SubStatus = 0,
                            Count = 10,
                            TimeInterval = "00:05:00"
                        }
                    }
                },
                Actions = new AutoHealActionsArgs
                {
                    ActionType = AutoHealActionType.Recycle
                }
            },
            AppSettings = new[]
            {
                new NameValuePairArgs
                {
                    Name = "WEBSITES_ENABLE_APP_SERVICE_STORAGE",
                    Value = "false"
                },
                new NameValuePairArgs
                {
                    Name = "DOCKER_REGISTRY_SERVER_URL",
                    Value = "https://index.docker.io"
                },
                new NameValuePairArgs
                {
                    Name = "WEBSITES_PORT",
                    Value = containerPort.ToString()
                },
                new NameValuePairArgs
                {
                    Name = "APPINSIGHTS_INSTRUMENTATIONKEY",
                    Value = applicationInsights.InstrumentationKey
                },
                new NameValuePairArgs
                {
                    Name = "APPLICATIONINSIGHTS_CONNECTION_STRING",
                    Value = applicationInsights.ConnectionString
                },
                new NameValuePairArgs
                {
                    Name = "COSMOS_DB_ENDPOINT",
                    Value = cosmosDbAccount.DocumentEndpoint
                },
                new NameValuePairArgs
                {
                    Name = "COSMOS_DB_KEY",
                    Value = cosmosDbKeys.Apply(keys => keys.PrimaryMasterKey ?? "")
                },
                new NameValuePairArgs
                {
                    Name = "COSMOS_DB_DATABASE",
                    Value = cosmosDbDatabaseName
                },
                new NameValuePairArgs
                {
                    Name = "COSMOS_DB_CONTAINER",
                    Value = cosmosDbContainerName
                }
            }
        }
    }, new CustomResourceOptions
    {
        Import = $"/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Web/sites/{webAppName}",
        DependsOn = { appServicePlan, applicationInsights, cosmosDbAccount }
    });
    
    // Export outputs
    return new Dictionary<string, object?>
    {
        ["webAppUrl"] = webApp.DefaultHostName.Apply(hostname => $"https://{hostname}"),
        ["webAppName"] = webApp.Name,
        ["cosmosDbEndpoint"] = cosmosDbAccount.DocumentEndpoint,
        ["applicationInsightsKey"] = applicationInsights.InstrumentationKey
    };
});
