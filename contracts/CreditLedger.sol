// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CreditLedger
 * @dev On-chain credit balance (MON) for Monallo Store. Non-transferable.
 *      User can recharge() with native token (PAS); operator can mintCredit (e.g. after ERC20 payment) and settle.
 *      Owner can set operator, set rate, and withdraw received native token.
 */
contract CreditLedger {
    // 1e6 = 1 MON (6 decimals)
    uint256 public constant MON_DECIMALS = 1e6;

    address public owner;
    address public operator;

    /// @dev rateNum / rateDenom = MON (raw) per wei. e.g. 1e6/1e18 => 1 PAS (1e18 wei) = 1 MON (1e6 raw)
    uint256 public rateNum;
    uint256 public rateDenom;

    mapping(address => uint256) public creditOf;
    mapping(bytes32 => bool) public usedSettlement;

    event Minted(address indexed user, uint256 amountMon);
    event Settled(address indexed user, uint256 amountMon, bytes32 dayId, bytes32 settlementId);
    event OperatorSet(address indexed previousOperator, address indexed newOperator);
    event RateSet(uint256 rateNum, uint256 rateDenom);
    event Recharged(address indexed user, uint256 valueWei, uint256 amountMon);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    constructor(address operator_) {
        owner = msg.sender;
        operator = operator_;
        rateNum = 1e6;
        rateDenom = 1e18;
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "Zero operator");
        address old = operator;
        operator = newOperator;
        emit OperatorSet(old, newOperator);
    }

    function setRate(uint256 rateNum_, uint256 rateDenom_) external onlyOwner {
        require(rateDenom_ != 0, "Zero rateDenom");
        rateNum = rateNum_;
        rateDenom = rateDenom_;
        emit RateSet(rateNum_, rateDenom_);
    }

    /**
     * @dev Disabled. MON is minted only by operator after off-chain payment verification.
     *      This prevents users from bypassing Monallo's official checkout to mint at an arbitrary exchange rate.
     */
    function recharge() external payable {
        revert("Recharge disabled");
    }

    receive() external payable {
        revert("Direct transfer disabled");
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        (bool ok, ) = payable(owner).call{ value: balance }("");
        require(ok, "Transfer failed");
    }

    /**
     * @dev Operator mints MON credit for user (e.g. after off-chain ERC20 payment verification).
     */
    function mintCredit(address user, uint256 amountMon) external onlyOperator {
        require(user != address(0), "Zero user");
        require(amountMon > 0, "Zero amount");
        creditOf[user] += amountMon;
        emit Minted(user, amountMon);
    }

    /**
     * @dev Operator settles daily usage: deduct usage from user's credit.
     *      Idempotent by settlementId.
     */
    function settle(
        address user,
        uint256 amountMon,
        bytes32 dayId,
        bytes32 settlementId
    ) external onlyOperator {
        require(user != address(0), "Zero user");
        require(!usedSettlement[settlementId], "Already settled");
        usedSettlement[settlementId] = true;
        if (amountMon == 0) return;
        uint256 balance = creditOf[user];
        require(balance >= amountMon, "Insufficient balance");
        creditOf[user] = balance - amountMon;
        emit Settled(user, amountMon, dayId, settlementId);
    }

    /**
     * @dev View: credit balance in MON (6 decimals).
     */
    function balanceOf(address user) external view returns (uint256) {
        return creditOf[user];
    }
}
