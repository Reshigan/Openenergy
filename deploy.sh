#!/bin/bash
# Cloudflare Pages Deployment Setup Script
# Run this script locally if you have wrangler installed

set -e

echo "Open Energy Platform - Cloudflare Setup"
echo "========================================"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI is not installed"
    echo "Install it with: npm install -g wrangler"
    exit 1
fi

# Build the frontend
echo ""
echo "Step 1: Building frontend..."
cd open-energy-platform/pages
npm run build

# Deploy to Cloudflare Pages
echo ""
echo "Step 2: Deploying to Cloudflare Pages..."
wrangler pages deploy pages/dist --project-name=open-energy-platform

echo ""
echo "Deployment complete!"
echo "Your site should be available at: https://open-energy-platform.pages.dev"