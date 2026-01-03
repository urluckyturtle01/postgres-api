#!/bin/bash

# Startup script for postgres-api services
# This script restarts all necessary services for the API to run

echo "================================================"
echo "Starting postgres-api services..."
echo "================================================"
echo ""

# Start PostgreSQL
echo "[1/3] Starting PostgreSQL 16..."
sudo systemctl start postgresql@16-main
if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL started successfully"
else
    echo "❌ Failed to start PostgreSQL"
    exit 1
fi
echo ""

# Start Nginx
echo "[2/3] Starting Nginx..."
sudo systemctl start nginx
if [ $? -eq 0 ]; then
    echo "✅ Nginx started successfully"
else
    echo "❌ Failed to start Nginx"
    exit 1
fi
echo ""

# Restart PM2 processes
echo "[3/3] Restarting PM2 processes..."
pm2 restart all
if [ $? -eq 0 ]; then
    echo "✅ PM2 processes restarted successfully"
else
    echo "❌ Failed to restart PM2 processes"
    exit 1
fi
echo ""

echo "================================================"
echo "All services started successfully!"
echo "================================================"
echo ""

# Display status
echo "Service Status:"
echo "---------------"
echo "PostgreSQL:"
sudo systemctl status postgresql@16-main | grep "Active:" | sed 's/^/  /'
echo ""
echo "Nginx:"
sudo systemctl status nginx | grep "Active:" | sed 's/^/  /'
echo ""
echo "PM2 Processes:"
pm2 list | grep "online\|stopped\|errored"
echo ""

# Test API endpoint
echo "Testing API endpoint..."
API_RESPONSE=$(curl -s http://localhost:9080/ 2>/dev/null)
if [ $? -eq 0 ] && [ ! -z "$API_RESPONSE" ]; then
    echo "✅ API is responding:"
    echo "$API_RESPONSE" | jq '.' 2>/dev/null || echo "$API_RESPONSE"
else
    echo "⚠️  API not responding on http://localhost:9080/"
fi
echo ""

echo "🎉 Startup complete!"

