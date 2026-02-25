// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MonalloBridge
 * @dev 源链锁定合约：用户转入原生代币（ETH/PAS），发出 Locked 事件供中继在目标链铸造 maoXXX.SourceChain。
 *      中继也可在本地链调用 release()，凭签名将锁定的原生资产释放给用户（跨链回去）。
 */
contract MonalloBridge {
    uint256 public nonce;

    address public immutable relayer;

    mapping(bytes32 => bool) public usedReleaseProof;

    event Locked(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 destinationChainId,
        uint256 indexed nonce
    );
    event Released(address indexed recipient, uint256 amount, uint256 sourceChainId, bytes32 sourceTxHash, uint256 nonce);

    constructor(address relayer_) {
        relayer = relayer_;
    }

    /**
     * @dev 锁定原生代币并发出事件；中继监听后于目标链铸造 wrapped 资产（maoXXX.SourceChain）。
     */
    function lock(address recipient, uint256 destinationChainId) external payable {
        require(recipient != address(0), "Invalid recipient");
        require(msg.value > 0, "Amount must be > 0");
        require(destinationChainId != 0, "Invalid destination chain");

        uint256 currentNonce = nonce;
        nonce = currentNonce + 1;

        emit Locked(msg.sender, recipient, msg.value, destinationChainId, currentNonce);
    }

    /**
     * @dev 中继签名后释放原生资产（跨链回去）。消息哈希 = keccak256(abi.encodePacked(recipient, amount, sourceChainId, sourceTxHash, nonce))
     */
    function release(
        address recipient,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 sourceTxHash,
        uint256 releaseNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(address(this).balance >= amount, "Insufficient bridge balance");

        bytes32 proofId = keccak256(abi.encodePacked(sourceChainId, sourceTxHash, releaseNonce));
        require(!usedReleaseProof[proofId], "Proof already used");
        usedReleaseProof[proofId] = true;

        bytes32 messageHash = keccak256(
            abi.encodePacked(recipient, amount, sourceChainId, sourceTxHash, releaseNonce)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        address signer = ecrecover(ethSignedHash, v, r, s);
        require(signer == relayer, "Invalid relayer signature");

        emit Released(recipient, amount, sourceChainId, sourceTxHash, releaseNonce);
        (bool ok, ) = payable(recipient).call{ value: amount }("");
        require(ok, "Transfer failed");
    }

    receive() external payable {}
}
