// soRandom protocol interface
interface ISoRandom {
    function requestRandom(uint24 _callbackGasLimit) external returns (uint256);

    function clientWithdrawTo(address _to, uint256 _amount) external;
}

// Proxy interface (retrieves the latest contract address)
interface ISRProxy {
    function soRandom() external view returns (address);
}

interface IERC20 {
    function balanceOf(address _owner) external view returns (uint256);

    function transfer(address _to, uint256 _value) external returns (bool);
}

contract ZKoin {
    struct CoinFlipGame {
        address player;
        uint256 wager;
        bool headsTails;
    }

    event Win(address winner, uint256 wager);
    event Lose(address loser, uint256 wager);

    mapping(uint256 => CoinFlipGame) coinFlipGames;
    mapping(uint256 => uint256) VRFGameId;

    ISRProxy proxy = ISRProxy(0x3F580FdDB12dc15F08D25bDFc68bd0F8571682f3);

    function vrfCoin(bool headsTails) external payable {
        address soRandom = proxy.soRandom();
        uint256 id = ISoRandom(soRandom).requestRandom(100000);
        VRFGameId[id] = 1;
        coinFlipGames[id] = CoinFlipGame(msg.sender, msg.value, headsTails);
    }

    function soRandomCallback(uint256 _id, bytes32 _value) external {
        CoinFlipGame storage game = coinFlipGames[_id];
        if (uint256(_value) % 2 == 0) {
            if (game.headsTails) {
                emit Win(game.player, game.wager);
            } else {
                emit Lose(game.player, game.wager);
            }
        } else {
            if (game.headsTails) {
                emit Lose(game.player, game.wager);
            } else {
                emit Win(game.player, game.wager);
            }
        }
    }
}
