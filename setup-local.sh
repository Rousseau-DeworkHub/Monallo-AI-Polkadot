#!/bin/bash
# Monallo Local Development Network Starter

echo "🛠️  Starting Monallo Local Development Network"
echo "=============================================="

cd /Users/htx/Desktop/Monallo

# Create a local Hardhat network script
cat > start-local-chain.sh << 'EOF'
#!/bin/bash
npx hardhat node --hostname 0.0.0.0 --port 8545
EOF

chmod +x start-local-chain.sh

# Start the local node in background
echo "📡 Starting local EVM node on port 8545..."
npx hardhat node --hostname 0.0.0.0 --port 8545 &
HARDHAT_PID=$!

echo "⏳ Waiting for node to start..."
sleep 5

# Check if node is running
if curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 > /dev/null 2>&1; then
    echo "✅ Local node started successfully!"
    echo ""
    echo "Network Details:"
    echo "  RPC URL: http://192.168.31.175:8545"
    echo "  Chain ID: 31337"
    echo "  Network Name: Hardhat"
    echo ""
    echo "Test Accounts (with 10000 ETH each):"
    echo "  Account 1: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    echo "  Account 2: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    echo ""
    echo "Press Ctrl+C to stop the network"
    
    # Keep running
    wait $HARDHAT_PID
else
    echo "❌ Failed to start local node"
    kill $HARDHAT_PID 2>/dev/null
fi
EOF

chmod +x start-local-chain.sh
echo "✅ Script created: start-local-chain.sh"
