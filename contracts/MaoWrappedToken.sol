// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MaoWrappedToken
 * @dev 目标链上的 wrapped 资产：命名 maoXXX.SourceChain（如 maoPAS.Polkadot-Hub、maoETH.Sepolia）。
 *      仅 relayer 通过签名可铸造，带重放防护。
 */
contract MaoWrappedToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    address public immutable relayer;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // 重放防护：(sourceChainId, sourceTxHash, nonce) -> 是否已使用
    mapping(bytes32 => bool) public usedProof;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount, uint256 sourceChainId, bytes32 sourceTxHash, uint256 nonce);
    event UnlockRequested(address indexed sender, address indexed recipient, uint256 amount, uint256 destinationChainId, uint256 indexed nonce);

    uint256 public nonceUnlock;

    constructor(string memory name_, string memory symbol_, address relayer_) {
        name = name_;
        symbol = symbol_;
        relayer = relayer_;
    }

    /**
     * @dev 中继签名后的铸造。消息哈希 = keccak256(abi.encodePacked(recipient, amount, sourceChainId, sourceTxHash, nonce))
     */
    function mint(
        address recipient,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 sourceTxHash,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        bytes32 proofId = keccak256(abi.encodePacked(sourceChainId, sourceTxHash, nonce));
        require(!usedProof[proofId], "Proof already used");
        usedProof[proofId] = true;

        bytes32 messageHash = keccak256(
            abi.encodePacked(recipient, amount, sourceChainId, sourceTxHash, nonce)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        address signer = ecrecover(ethSignedHash, v, r, s);
        require(signer == relayer, "Invalid relayer signature");

        totalSupply += amount;
        balanceOf[recipient] += amount;
        emit Transfer(address(0), recipient, amount);
        emit Mint(recipient, amount, sourceChainId, sourceTxHash, nonce);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Invalid to");
        uint256 b = balanceOf[msg.sender];
        require(b >= amount, "Insufficient balance");
        balanceOf[msg.sender] = b - amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Invalid to");
        uint256 b = balanceOf[from];
        require(b >= amount, "Insufficient balance");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "Insufficient allowance");
        balanceOf[from] = b - amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] = a - amount;
        emit Transfer(from, to, amount);
        return true;
    }

    /**
     * @dev 跨链回去：销毁 wrapped 代币并发出 UnlockRequested；中继在目标链 Bridge 合约上调用 release 释放原生资产。
     */
    function unlock(address recipient, uint256 amount, uint256 destinationChainId) external {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(destinationChainId != 0, "Invalid destination chain");
        uint256 b = balanceOf[msg.sender];
        require(b >= amount, "Insufficient balance");

        uint256 currentNonce = nonceUnlock;
        nonceUnlock = currentNonce + 1;

        balanceOf[msg.sender] = b - amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
        emit UnlockRequested(msg.sender, recipient, amount, destinationChainId, currentNonce);
    }
}
