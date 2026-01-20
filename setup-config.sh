#!/bin/bash

# Setup script for configuring Pulumi stack with Azure resource information

set -e

echo "Azure Podinfo Web Application - Pulumi Configuration Setup"
echo "==========================================================="
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "Error: Azure CLI is not installed. Please install it first."
    echo "Visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if user is logged in to Azure
if ! az account show &> /dev/null; then
    echo "You are not logged in to Azure. Please run 'az login' first."
    exit 1
fi

# Get subscription ID
echo "Fetching your Azure subscription ID..."
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "Found subscription ID: $SUBSCRIPTION_ID"
echo ""

# List resource groups
echo "Available resource groups:"
az group list --query "[].{Name:name, Location:location}" -o table
echo ""

# Prompt for resource group name
read -p "Enter the resource group name where your resources are deployed: " RESOURCE_GROUP_NAME

if [ -z "$RESOURCE_GROUP_NAME" ]; then
    echo "Error: Resource group name cannot be empty"
    exit 1
fi

# Verify resource group exists
if ! az group show --name "$RESOURCE_GROUP_NAME" &> /dev/null; then
    echo "Error: Resource group '$RESOURCE_GROUP_NAME' not found"
    exit 1
fi

echo ""
echo "Configuring Pulumi stack..."

# Set required configuration
pulumi config set resourceGroupName "$RESOURCE_GROUP_NAME"
pulumi config set subscriptionId "$SUBSCRIPTION_ID"

echo ""
echo "Configuration complete!"
echo ""
echo "Current configuration:"
pulumi config

echo ""
echo "Next steps:"
echo "1. Review the configuration above"
echo "2. Run 'pulumi preview' to see the import plan"
echo "3. Run 'pulumi up' to import the resources"
