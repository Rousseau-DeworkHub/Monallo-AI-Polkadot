// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MonalloIntentExecutor
 * @dev AI意图执行器 - 简化版
 * 
 * 功能:
 * - executeTransfer: 代币转账
 * - executeSwap: 兑换(记录意图)
 * - executeBridge: 跨链(记录意图)
 * - executeStake: 质押(记录意图)
 */
contract MonalloIntentExecutor {
    string public constant name = "MonalloIntentExecutor";
    string public constant version = "1.0.0";
    address public immutable owner;
    
    // 事件
    event IntentExecuted(
        address indexed user,
        string action,
        address token,
        uint256 amount,
        bytes32 intentId
    );
    
    // 已执行的意图
    mapping(bytes32 => bool) public executedIntents;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    /**
     * @dev 执行转账
     */
    function executeTransfer(
        address token,
        uint256 amount,
        address recipient,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must > 0");
        
        executedIntents[intentId] = true;
        
        if (token == address(0)) {
            // 原生代币(DOT)
            require(msg.value >= amount, "Insufficient value");
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            // ERC20 - 使用低级调用
            (bool success, ) = token.call(abi.encodeWithSelector(
                bytes4(keccak256("transfer(address,uint256)")),
                recipient,
                amount
            ));
            require(success, "Token transfer failed");
        }
        
        emit IntentExecuted(msg.sender, "transfer", token, amount, intentId);
    }
    
    /**
     * @dev 执行兑换(记录意图)
     */
    function executeSwap(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256, // minAmountOut (预留)
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        executedIntents[intentId] = true;
        emit IntentExecuted(msg.sender, "swap", fromToken, amountIn, intentId);
    }
    
    /**
     * @dev 执行跨链(记录意图)
     */
    function executeBridge(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        executedIntents[intentId] = true;
        emit IntentExecuted(msg.sender, "bridge", token, amount, intentId);
    }
    
    /**
     * @dev 执行质押(记录意图)
     */
    function executeStake(
        uint256 amount,
        address validator,
        bytes32 intentId
    ) external payable {
        require(!executedIntents[intentId], "Already executed");
        executedIntents[intentId] = true;
        emit IntentExecuted(msg.sender, "stake", address(0), amount, intentId);
    }
    
    /**
     * @dev 生成意图ID
     */
    function generateIntentId(
        address user,
        string calldata action,
        uint256 nonce
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, action, nonce, block.timestamp));
    }
    
    /**
     * @dev 获取nonce
     */
    mapping(address => uint256) public nonces;
    
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }
    
    // 接收原生代币
    receive() external payable {}
}
