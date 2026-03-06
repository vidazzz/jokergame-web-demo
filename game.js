// ==================== 配置 ====================
// 默认配置（当 config.json 加载失败时使用）
var config = {
    game: {
        '负分牌数': 6,
        '正分牌数': 12,
        '初始资金': 50,
        '真相条件牌数量': 5,
        '手牌数量': 5,
        '最大出牌次数': 4,
        '出牌最大张数': 5,
        '参与者数量': 3,
        '玩家专业度': 50,
        '对齐费用': 1,
        '同花倍率': {
            '1': 1,
            '2': 2,
            '3': 4,
            '4': 8,
            '5': 16
        }
    },
    pack: {
        '可选花色': ['♥', '♦', '♣', '♠'],
        '张数范围': [1, 5],
        '开包张数': 1
    }
};

// 加载配置文件（覆盖默认配置）
async function loadConfig() {
    try {
        // 尝试使用 fetch（适用于 HTTP 服务器）
        let loaded = null;
        try {
            const response = await fetch('config.json', { cache: 'no-store' });
            if (response.ok) {
                loaded = await response.json();
            }
        } catch (e) {
            // fetch 失败，尝试 XMLHttpRequest（适用于 file:// 协议）
            loaded = await loadConfigFromFile();
        }

        if (loaded) {
            if (loaded.game) config.game = { ...config.game, ...loaded.game };
            if (loaded.pack) config.pack = { ...config.pack, ...loaded.pack };
            console.log('已加载 config.json:', config.game['初始资金']);
        } else {
            console.log('未加载 config.json，使用默认配置');
        }
    } catch (e) {
        console.log('无法加载config.json，使用默认配置');
    }
    updateRulesDisplay();
}

// 使用 XMLHttpRequest 加载配置文件（适用于 file:// 协议）
function loadConfigFromFile() {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'config.json', true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            }
        };
        xhr.onerror = reject;
        xhr.send();
    });
}

// 更新规则显示
function updateRulesDisplay() {
    const playMax = document.getElementById('rule-play-max');
    const handSize = document.getElementById('rule-hand-size');
    const maxPlays = document.getElementById('rule-max-plays');
    const maxPlaysSuccess = document.getElementById('rule-max-plays-success');
    const maxPlaysFail = document.getElementById('rule-max-plays-fail');

    if (playMax) playMax.textContent = config.game['出牌最大张数'];
    if (handSize) handSize.textContent = config.game['手牌数量'];
    if (maxPlays) maxPlays.textContent = config.game['最大出牌次数'];
    if (maxPlaysSuccess) maxPlaysSuccess.textContent = config.game['最大出牌次数'];
    if (maxPlaysFail) maxPlaysFail.textContent = config.game['最大出牌次数'];
}

// ==================== 游戏状态 ====================
var sourceDeck = [];          // 源头牌堆（正分+负分）
var hand = [];                // 手牌
var table = [];              // 桌面牌
var selectedCards = [];       // 选中的牌
var playedHistory = [];      // 出牌历史
var currentScore = 0;        // 当前分数
var playsRemaining = 4;      // 剩余出牌次数
var gameOver = false;
var gamePhase = 'build';      // build/align/playing/end

// 参与者系统
// ==================== 页面切换 ====================
function switchPage(pageName) {
    // 隐藏所有页面
    document.getElementById('build-page').classList.add('hidden');
    document.getElementById('align-page').classList.add('hidden');
    document.getElementById('playing-page').classList.add('hidden');

    // 显示目标页面
    document.getElementById(pageName + '-page').classList.remove('hidden');
}

var participants = [];        // 参与者数组（含专业度和专精花色）

// 牌包系统
var packs = [];               // 可购买的牌包
var truthConditionCards = []; // 真相条件牌（随机抽取的5张牌）
var truthRevealed = false;    // 真相条件牌是否已全部揭示
var gold = 12;               // 当前资金

// 花色和点数
const suits = ['♥', '♦', '♣', '♠'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const suitNames = { '♥': '红桃', '♦': '方块', '♣': '梅花', '♠': '黑桃' };
const rankNames = { 'A': 'A', 'J': 'J', 'Q': 'Q', 'K': 'K' };

// ==================== 工具函数 ====================
function getRankValue(rank) {
    if (rank === 'A') return 1;
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    return parseInt(rank);
}

function shuffle(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function randomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ==================== 参与者系统 ====================
function generateParticipants() {
    var participantCount = config.game['参与者数量'] || 3;
    participants = [];

    for (var i = 0; i < participantCount; i++) {
        // 随机分配专精花色
        var specialtySuit = randomItem(suits);

        // 专精花色专业度随机 [51, 100]
        var specialtyExpertise = Math.floor(Math.random() * 50) + 51;

        // 剩余3个花色的专业度总和 = 随机 [0, 专精专业度]
        var remainingTotal = Math.floor(Math.random() * (specialtyExpertise + 1));

        // 随机分配给剩余3个花色
        var otherSuits = suits.filter(s => s !== specialtySuit);
        var otherExpertises = [];
        for (var j = 0; j < 3; j++) {
            if (j === 2) {
                // 最后一个取剩余值
                otherExpertises[j] = remainingTotal;
            } else {
                var maxRemaining = remainingTotal - (2 - j);
                var minRemaining = 0;
                var exp = Math.floor(Math.random() * (maxRemaining - minRemaining + 1)) + minRemaining;
                otherExpertises[j] = exp;
                remainingTotal -= exp;
            }
        }

        // 构建专业度对象
        var expertise = {};
        expertise[specialtySuit] = specialtyExpertise;
        otherSuits.forEach(function(suit, index) {
            expertise[suit] = otherExpertises[index];
        });

        // 每个参与者从原始牌堆抽取3-8张牌作为知晓的牌
        var knownCardCount = Math.floor(Math.random() * 6) + 3; // 3-8张
        var shuffledSourceDeck = shuffle([...sourceDeck]);
        var knownCards = shuffledSourceDeck.slice(0, knownCardCount);

        participants.push({
            id: i,
            specialtySuit: specialtySuit,
            expertise: expertise,
            knownCards: knownCards // 知晓的牌
        });
    }
    console.log('参与者:', participants.map(p => ({
        specialty: p.specialtySuit,
        expertise: p.expertise,
        knownCardCount: p.knownCards.length
    })));
}

// 玩家发起标记
function initiateMark(cardIndex) {
    var markCost = config.game['标记费用'] || 1;
    if (gold < markCost) {
        showMessage('资金不足', 'warning');
        return;
    }

    var card = hand[cardIndex];
    // 检查是否已经尝试过标记（无论成功与否）
    if (!card || card.markAttempted) {
        return;
    }

    gold -= markCost;

    // 标记为已尝试
    card.markAttempted = true;

    console.log('===== 标记结果 =====');
    console.log('牌: ' + card.suit + card.value + ' (ID: ' + card.id + ')');

    // 每位观众按概率放置标记
    var audienceCount = config.game['观众数量'] || 3;
    var marksAdded = 0;

    for (var i = 0; i < audienceCount; i++) {
        var prob = (suitProbabilities[i] && suitProbabilities[i][card.suit]) || 0.5;
        var random = Math.random();
        var success = random < prob;
        if (success) {
            marksAdded++;
        }
        console.log('观众' + (i + 1) + ': 概率' + Math.round(prob * 100) + '% -> ' + (success ? '成功✓' : '失败✗'));
    }

    console.log('总计: ' + marksAdded + '个标记');

    // 累加标记（多位观众可同时标记同一张牌）
    card.markCount = (card.markCount || 0) + marksAdded;

    // 标记后立即刷新，移除可点击状态
    renderMarkPhase();
    updateGoldDisplay();
}

// ==================== 源头牌堆初始化 ====================
function initSourceDeck() {
    var negCount = config.game['负分牌数'] || 6;
    var posCount = config.game['正分牌数'] || 12;
    var suitOptions = config.pack['可选花色'];
    var cardId = 0;

    var allCards = [];

    // 生成正分牌
    // 每种花色最多一张10分
    var tenValueAssigned = {};
    suitOptions.forEach(s => tenValueAssigned[s] = false);

    for (var i = 0; i < posCount; i++) {
        var suit = randomItem(suitOptions);
        // 如果该花色还没分配10分牌，且随机到10，则分配10分
        var value;
        if (!tenValueAssigned[suit] && Math.random() < 0.3) {
            value = 10;
            tenValueAssigned[suit] = true;
        } else {
            value = 1;
        }
        allCards.push({
            id: 'card_' + cardId++,
            suit: suit,
            value: value,
            isRed: suit === '♥' || suit === '♦',
            isNegative: false,
            revealed: false,        // 是否已揭示（玩家是否知晓）
            evaluationScore: null, // 评估分数
            importantWeight: 0,     // 重要权重
            notImportantWeight: 0,   // 不重要权重
            playerVoted: false      // 玩家是否已投票
        });
    }

    // 生成负分牌
    // 每种花色最多一张-10分
    var negTenValueAssigned = {};
    suitOptions.forEach(s => negTenValueAssigned[s] = false);

    for (var i = 0; i < negCount; i++) {
        var suit = randomItem(suitOptions);
        // 如果该花色还没分配-10分牌，且随机到-10，则分配-10分
        var value;
        if (!negTenValueAssigned[suit] && Math.random() < 0.3) {
            value = -10;
            negTenValueAssigned[suit] = true;
        } else {
            value = -1;
        }
        allCards.push({
            id: 'card_' + cardId++,
            suit: suit,
            value: value,
            isRed: suit === '♥' || suit === '♦',
            isNegative: true,
            revealed: false,
            evaluationScore: null,
            importantWeight: 0,
            notImportantWeight: 0,
            playerVoted: false
        });
    }

    sourceDeck = shuffle(allCards);
}

// ==================== 牌包系统 ====================
function generatePacks() {
    packs = [];
    var suits = ['♥', '♦', '♣', '♠'];
    var cardsPerPack = config.pack['开包张数'] || 5;
    var pricePerCard = 2;

    // 创建4种花色牌包
    suits.forEach(function(suit, index) {
        packs.push({
            id: index,
            suit: suit,
            cardsPerPack: cardsPerPack,
            price: cardsPerPack * pricePerCard,
            openedCount: 0  // 已开次数
        });
    });
}

function buyPack(packId) {
    var pack = packs.find(p => p.id === packId);
    if (!pack || gold < pack.price) return false;

    gold -= pack.price;

    // 从源头牌堆中获取对应花色的牌
    var suitCards = sourceDeck.filter(c => c.suit === pack.suit);

    // 打乱后取前N张
    var shuffledSuitCards = shuffle([...suitCards]);
    var drawnCardIds = shuffledSuitCards.slice(0, pack.cardsPerPack).map(c => c.id);

    // 标记源头牌堆中的牌为揭示
    var addedCount = 0;
    drawnCardIds.forEach(function(cardId) {
        var card = sourceDeck.find(c => c.id === cardId);
        if (card && !card.revealed) {
            card.revealed = true;
            addedCount++;
        }
    });
    console.log(`开包揭示${addedCount}张牌`);

    // 检查是否揭示了所有真相条件牌
    if (!truthRevealed) {
        var revealedConditionCount = 0;
        truthConditionCards.forEach(function(tc) {
            var sourceCard = sourceDeck.find(c => c.id === tc.id);
            if (sourceCard && sourceCard.revealed) {
                revealedConditionCount++;
            }
        });
        if (revealedConditionCount >= 5) {
            truthRevealed = true;
            console.log('真相条件牌已全部揭示！');
        }
    }

    pack.openedCount++;

    renderBuildPhase();
    return true;
}

// ==================== 揭示阶段渲染 ====================
function renderBuildPhase() {
    // 更新资金显示
    document.getElementById('gold-count').textContent = gold;

    // 渲染牌包
    renderPacks();

    // 渲染揭示的牌（正分+负分）
    renderRevealedCards();

}

function renderPacks() {
    var container = document.getElementById('packs-container');
    container.innerHTML = '';

    // 统计每个花色在源头牌堆中的总牌数
    var suitTotalCards = {};
    ['♥', '♦', '♣', '♠'].forEach(s => suitTotalCards[s] = 0);
    sourceDeck.forEach(card => {
        suitTotalCards[card.suit]++;
    });

    // 统计每个花色已揭示的牌数
    var suitRevealedCards = {};
    ['♥', '♦', '♣', '♠'].forEach(s => suitRevealedCards[s] = 0);
    sourceDeck.forEach(card => {
        if (card.revealed) {
            suitRevealedCards[card.suit]++;
        }
    });

    packs.forEach(pack => {
        var totalInSuit = suitTotalCards[pack.suit];
        var revealedInSuit = suitRevealedCards[pack.suit];
        var allRevealed = revealedInSuit >= totalInSuit;
        var canBuy = !allRevealed && gold >= pack.price;

        // 统计该花色中的真相条件牌数量
        // 统计该花色中已揭示的真相条件牌数量
        var truthConditionTotal = truthConditionCards.filter(tc => tc.suit === pack.suit).length;
        var truthConditionRevealed = truthConditionCards.filter(tc =>
            tc.suit === pack.suit && sourceDeck.some(c => c.id === tc.id && c.revealed)
        ).length;

        var div = document.createElement('div');
        div.className = 'pack-card' + (canBuy ? '' : ' disabled');
        div.innerHTML = `
            <div class="pack-suits">${pack.suit}</div>
            <div class="pack-info">
                <div>已揭示${revealedInSuit}/${totalInSuit}</div>
                ${truthConditionTotal > 0 ? '<div style="color: #00ffff;">真相' + truthConditionRevealed + '/' + truthConditionTotal + '</div>' : ''}
            </div>
        `;
        if (canBuy) {
            div.onclick = () => {
                buyPack(pack.id);
            };
        }
        container.appendChild(div);
    });
}

function renderRevealedCards() {
    var container = document.getElementById('revealed-cards-container');
    container.innerHTML = '';

    // 从源头牌堆获取已揭示的牌
    var allRevealed = sourceDeck.filter(card => card.revealed);

    allRevealed.forEach(card => {
        var div = createCardElement(card, () => {});
        // 检查是否是真相条件牌
        var isTruthCondition = truthConditionCards.some(tc => tc.id === card.id);
        if (isTruthCondition) {
            div.classList.add('truth-condition-card');
        }
        container.appendChild(div);
    });
}

// 渲染真相条件牌
function renderTruthConditionCards() {
    var container = document.getElementById('truth-condition-container');
    var statusEl = document.getElementById('truth-reveal-status');
    container.innerHTML = '';

    // 检查已揭示的条件牌数量
    var revealedCount = 0;
    truthConditionCards.forEach(function(tc) {
        var sourceCard = sourceDeck.find(c => c.id === tc.id);
        if (sourceCard && sourceCard.revealed) {
            revealedCount++;
        }
    });

    // 更新状态显示
    statusEl.textContent = '(' + revealedCount + '/5)';

    // 始终显示真相条件牌信息
    var conditionStr = truthConditionCards.map(c => c.suit).join(', ');
    var infoDiv = document.createElement('div');
    infoDiv.className = 'truth-info';
    infoDiv.innerHTML = '<span class="truth-label">真相条件: </span><span class="truth-effect">' + conditionStr + '</span>';
}

// ==================== 对齐阶段 ====================
function startAlignPhase() {
    gamePhase = 'align';

    // 生成参与者专业度
    generateParticipants();

    // 玩家知晓在构建阶段揭示的牌
    var playerKnownCards = sourceDeck.filter(c => c.revealed);

    // 合并所有知晓的牌（包括玩家和NPC）
    var allKnownCardIds = new Set();
    playerKnownCards.forEach(c => allKnownCardIds.add(c.id));
    participants.forEach(p => {
        p.knownCards.forEach(c => allKnownCardIds.add(c.id));
    });

    // 获取所有被知晓的牌
    var votableCards = sourceDeck.filter(c => allKnownCardIds.has(c.id));

    // 对齐阶段使用所有被知晓的牌
    hand = votableCards;

    // 切换到对齐阶段页面
    switchPage('align');

    // NPC自动投票
    runNPCVotes();

    // 初始化玩家的默认投票（所有玩家知晓的牌默认为不重要）
    initializePlayerVotes();

    // 渲染对齐阶段
    renderAlignPhase();
}

// 初始化玩家的默认投票（默认投不重要）
function initializePlayerVotes() {
    var playerExpertise = config.game['玩家专业度'] || 50;
    var playerKnownCards = sourceDeck.filter(c => c.revealed);

    playerKnownCards.forEach(function(card) {
        // 玩家默认投不重要
        card.playerVoted = false;
        card.notImportantWeight = (card.notImportantWeight || 0) + playerExpertise;
        // 根据当前权重计算评估分数
        recalculateEvaluationScore(card);
    });
}

// 获取可以被投票的牌（有人知晓的牌）
function getVotableCards() {
    // 玩家知晓的牌（构建阶段揭示的牌）
    var playerKnownCards = sourceDeck.filter(c => c.revealed);

    // 合并所有知晓的牌
    var allKnownCardIds = new Set();
    playerKnownCards.forEach(c => allKnownCardIds.add(c.id));
    participants.forEach(p => {
        if (p.knownCards) {
            p.knownCards.forEach(c => allKnownCardIds.add(c.id));
        }
    });

    // 返回所有被知晓的牌
    return sourceDeck.filter(c => allKnownCardIds.has(c.id));
}

// NPC自动投票
function runNPCVotes() {
    console.log('===== NPC投票开始 =====');

    // 获取可以被投票的牌
    var votableCards = getVotableCards();

    votableCards.forEach(function(card) {
        // 如果已经有评估分数，跳过
        if (card.evaluationScore !== null) return;

        var importantWeight = 0;
        var notImportantWeight = 0;

        // 每个参与者投票（只对自己知晓的牌投票）
        participants.forEach(function(participant) {
            // 检查参与者是否知晓这张牌
            var knowsCard = participant.knownCards && participant.knownCards.some(kc => kc.id === card.id);
            if (!knowsCard) return;

            var expertise = participant.expertise[card.suit];

            // TODO: NPC投票倾向性应该根据参与者对牌本身的了解程度决定，而非专业度
            // TODO: 暂时用随机占位，之后需要实现真正的倾向性逻辑
            // 随机决定投重要还是不重要
            var votesImportant = Math.random() > 0.5;

            if (votesImportant) {
                importantWeight += expertise;
                console.log('参与者' + (participant.id + 1) + ' [' + card.suit + '专业度:' + expertise + '%] -> 投重要');
            } else {
                notImportantWeight += expertise;
                console.log('参与者' + (participant.id + 1) + ' [' + card.suit + '专业度:' + expertise + '%] -> 投不重要');
            }
        });

        // 计算结果
        var isImportant = importantWeight >= notImportantWeight;
        var score;
        if (card.isNegative) {
            score = isImportant ? -10 : -1;
        } else {
            score = isImportant ? 10 : 1;
        }

        console.log('投票结果: 重要权重=' + importantWeight + ', 不重要权重=' + notImportantWeight + ' -> ' + (isImportant ? '重要' : '不重要') + ', 分数=' + score);

        // 存储投票权重（用于显示得票情况）
        card.importantWeight = importantWeight;
        card.notImportantWeight = notImportantWeight;
        // 设置评估分数
        card.evaluationScore = score;
    });

    console.log('===== NPC投票结束 =====');
}

function renderAlignPhase() {
    // 更新资金显示
    document.getElementById('align-gold-count').textContent = gold;

    // 渲染玩家专业度
    renderPlayerInfo();

    // 渲染参与者专业度
    renderParticipants();

    // 渲染投票区域（显示所有可投票的牌，点击投票）
    renderAlignHand();
}

function renderPlayerInfo() {
    var container = document.getElementById('player-info');
    container.innerHTML = '';

    var playerExpertise = config.game['玩家专业度'] || 50;
    var playerKnownCount = sourceDeck.filter(c => c.revealed).length;

    var div = document.createElement('div');
    div.className = 'player-section';
    div.innerHTML = '<div class="player-title">玩家 (专业度: ' + playerExpertise + '%, 知晓牌数: ' + playerKnownCount + ')</div>';
    container.appendChild(div);
}

function renderParticipants() {
    var container = document.getElementById('participant-probs');
    container.innerHTML = '';

    participants.forEach(function(participant, index) {
        var knownCount = participant.knownCards ? participant.knownCards.length : 0;
        var div = document.createElement('div');
        div.className = 'participant-section';
        // 只显示专精花色和知晓牌数，不显示详细专业度
        div.innerHTML = '<div class="participant-title">参与者' + (index + 1) + ' (专精' + participant.specialtySuit + ', 知晓' + knownCount + '张牌)</div>';

        container.appendChild(div);
    });
}

function renderAlignHand() {
    var container = document.getElementById('align-hand-container');
    container.innerHTML = '';

    // 获取所有可投票的牌
    var votableCards = getVotableCards();

    if (votableCards.length === 0) {
        container.innerHTML = '<p style="color: #888;">暂无可投票的牌</p>';
        return;
    }

    // 分类：玩家知晓的牌 vs 玩家不知晓的牌
    var playerKnownCardIds = new Set(sourceDeck.filter(c => c.revealed).map(c => c.id));
    var playerVotableCards = votableCards.filter(c => playerKnownCardIds.has(c.id));
    var npcOnlyCards = votableCards.filter(c => !playerKnownCardIds.has(c.id));

    // 玩家可投票的牌区域
    if (playerVotableCards.length > 0) {
        var playerSection = document.createElement('div');
        playerSection.className = 'align-section';
        playerSection.innerHTML = '<h4>你的投票（点击选择重要）</h4>';
        var playerCardsDiv = document.createElement('div');
        playerCardsDiv.className = 'cards-row';

        playerVotableCards.forEach(function(card) {
            var div = createCardElement(card, function() {
                togglePlayerVote(card.id);
            }, true);
            div.classList.add('can-vote');
            if (card.playerVoted) {
                div.classList.add('player-voted-important');
            }
            playerCardsDiv.appendChild(div);
        });

        playerSection.appendChild(playerCardsDiv);
        container.appendChild(playerSection);
    }

    // NPC投票的牌区域（玩家不能投票）
    if (npcOnlyCards.length > 0) {
        var npcSection = document.createElement('div');
        npcSection.className = 'align-section';
        npcSection.innerHTML = '<h4>其他投票（无法参与）</h4>';
        var npcCardsDiv = document.createElement('div');
        npcCardsDiv.className = 'cards-row';

        npcOnlyCards.forEach(function(card) {
            var div = createCardElement(card, function() {}, true);
            div.classList.add('cannot-vote');
            npcCardsDiv.appendChild(div);
        });

        npcSection.appendChild(npcCardsDiv);
        container.appendChild(npcSection);
    }

    // 添加结束投票按钮到页面底部
    var buttonsContainer = document.getElementById('align-buttons');
    buttonsContainer.innerHTML = '';
    var endBtn = document.createElement('button');
    endBtn.className = 'btn btn-primary';
    endBtn.textContent = '结束投票';
    endBtn.onclick = function() {
        finishVoting();
    };
    buttonsContainer.appendChild(endBtn);
}

function renderPlayerVoteButtons() {
    // 投票UI已合并到 renderAlignHand 中
    var container = document.getElementById('player-vote-container');
    container.innerHTML = '';
}

// 切换玩家投票状态
function togglePlayerVote(cardId) {
    // 直接从sourceDeck获取最新的牌数据
    var card = sourceDeck.find(c => c.id === cardId);
    if (!card) {
        return;
    }

    // 玩家只能对自己知晓的牌投票
    if (!card.revealed) {
        showMessage('只能对已揭示的牌投票', 'warning');
        return;
    }

    var playerExpertise = config.game['玩家专业度'] || 50;

    // 切换投票状态
    if (card.playerVoted) {
        // 取消选择：从重要转为不重要
        card.playerVoted = false;
        // 移除重要权重，增加不重要权重
        card.importantWeight = Math.max(0, (card.importantWeight || 0) - playerExpertise);
        card.notImportantWeight = (card.notImportantWeight || 0) + playerExpertise;
    } else {
        // 选择投票重要：从不重要转为重要
        card.playerVoted = true;
        // 移除不重要权重，增加重要权重
        card.notImportantWeight = Math.max(0, (card.notImportantWeight || 0) - playerExpertise);
        card.importantWeight = (card.importantWeight || 0) + playerExpertise;
    }

    // 根据当前总权重重新计算评估分数
    recalculateEvaluationScore(card);

    renderAlignPhase();
}

// 根据当前权重重新计算评估分数
function recalculateEvaluationScore(card) {
    var importantWeight = card.importantWeight || 0;
    var notImportantWeight = card.notImportantWeight || 0;

    // 重要权重 >= 不重要权重 → 重要
    if (importantWeight >= notImportantWeight) {
        card.evaluationScore = card.isNegative ? -10 : 10;
    } else {
        card.evaluationScore = card.isNegative ? -1 : 1;
    }
}

// 完成投票
function finishVoting() {
    // 玩家投票已在初始化和选择/取消时处理完成，直接进入游戏阶段
    startGamePhase();
}

// ==================== 游戏阶段转换 ====================
function startGamePhase() {
    // 从构建阶段进入对齐阶段
    if (gamePhase === 'build') {
        startAlignPhase();
        return;
    }

    // 从对齐阶段进入进行阶段
    if (gamePhase === 'align') {
        gamePhase = 'playing';

        // 揭示所有未揭示的牌
        sourceDeck.forEach(function(card) {
            card.revealed = true;
            // 给没有评估分数的牌设置默认分数（不重要=1或-1）
            if (card.evaluationScore === null) {
                card.evaluationScore = card.isNegative ? -1 : 1;
            }
        });

        // 从源头牌堆随机抽取初始手牌（先负分牌，后正分牌）
        var handSize = config.game['手牌数量'] || 5;
        var negativeCards = shuffle(sourceDeck.filter(c => c.isNegative));
        var positiveCards = shuffle(sourceDeck.filter(c => !c.isNegative));
        var allCards = [...negativeCards, ...positiveCards];
        hand = [];

        // 用shift从开头抽取，确保先抽负分牌
        for (var i = 0; i < handSize && allCards.length > 0; i++) {
            var card = allCards.shift();
            card.isNew = true;
            hand.push(card);
        }

        // 重置状态
        currentScore = 0;
        playsRemaining = config.game['最大出牌次数'];
        gameOver = false;
        selectedCards = [];
        playedHistory = [];
        table = [];

        // 切换到进行阶段页面
        switchPage('playing');

        // 重置按钮显示
        var btns = document.querySelectorAll('#action-buttons button');
        if (btns.length >= 3) {
            btns[0].style.display = ''; // 打出选中的牌
            btns[1].style.display = ''; // 取消选择
            btns[2].style.display = ''; // 推荐出牌
        }

        // 更新UI
        renderHand();
        renderTable();
        updateUI();
        showMessage('选择要打出的牌', 'info');
        autoSelectBestCards();
    }
}

// ==================== 得分计算 ====================

// 获取翻倍倍数
function getMultiplier(count) {
    var multiplierConfig = config.game['同花倍率'] || {
        "1": 1,
        "2": 2,
        "3": 4,
        "4": 8,
        "5": 16
    };
    // 从配置中查找对应的倍率
    if (count >= 5 && multiplierConfig["5"]) return multiplierConfig["5"];
    if (count >= 4 && multiplierConfig["4"]) return multiplierConfig["4"];
    if (count >= 3 && multiplierConfig["3"]) return multiplierConfig["3"];
    if (count >= 2 && multiplierConfig["2"]) return multiplierConfig["2"];
    return multiplierConfig["1"] || 1;
}

// 计算得分
// updateState: 是否更新全局状态，默认false
function calculateScore(cards, updateState) {
    if (cards.length === 0) return { score: 0, multiplier: 1, message: '' };

    // 按花色分组
    var suitGroups = {};
    for (var i = 0; i < suits.length; i++) {
        suitGroups[suits[i]] = cards.filter(function(c) { return c.suit === suits[i]; });
    }

    // 找到最大同花色组
    var maxCount = 0;
    var maxSuit = null;
    var maxGroup = [];

    for (var i = 0; i < suits.length; i++) {
        if (suitGroups[suits[i]].length > maxCount) {
            maxCount = suitGroups[suits[i]].length;
            maxSuit = suits[i];
            maxGroup = suitGroups[suits[i]];
        }
    }

    var multiplier = getMultiplier(maxCount);

    // 真相条件牌加分（需要全部揭示才能生效）
    var truthBonus = 0;
    if (truthRevealed) {
        var conditionCardsInPlay = 0;
        truthConditionCards.forEach(function(tc) {
            if (cards.some(c => c.id === tc.id)) {
                conditionCardsInPlay++;
            }
        });
        if (conditionCardsInPlay >= 3) {
            if (conditionCardsInPlay === 3) truthBonus = 50;
            else if (conditionCardsInPlay === 4) truthBonus = 100;
            else if (conditionCardsInPlay === 5) truthBonus = 200;
        }
    }

    // 计算基础分（使用投票确定的评估分数作为牌面分）
    var baseScore = 0;
    var cardsForDisplay = []; // 用于显示的卡片数据
    for (var i = 0; i < cards.length; i++) {
        // 评估分数就是牌面分（重要=10/不重要=1，负分牌为-10/-1）
        var cardValue = cards[i].evaluationScore || 1;

        baseScore += cardValue;
        // 保存显示信息
        cardsForDisplay.push({
            value: cardValue,
            evaluationScore: cardValue
        });
    }

    var totalScore = baseScore * multiplier;

    // 构建各牌基础分列表
    var baseValues = cardsForDisplay.map(function(c) {
        var evalStr = c.evaluationScore > 0 ? '+' + c.evaluationScore : c.evaluationScore;
        return '<span style="color: #00bfff;">' + evalStr + '</span>';
    }).join('+');

    // 真相加分显示
    var truthEffect = '';
    if (truthBonus > 0) {
        truthEffect = '<span style="color: #ffd700;">+' + truthBonus + '</span>';
    }

    // 基础倍率
    var multiplierPart = '×' + multiplier;

    var message = '(' + baseValues + truthEffect + ')' + multiplierPart + '=' + totalScore;

    return {
        score: totalScore,
        multiplier: multiplier,
        message: message
    };
}

// 自动选择最佳出牌策略
function autoSelectBestCards() {
    // 使用所有手牌
    var allCards = [...hand];
    if (allCards.length === 0) return;

    var suits = ['♥', '♦', '♣', '♠'];

    // 计算每种花色的得分
    var bestSuit = null;
    var bestScore = -Infinity;
    var bestCards = [];

    // 尝试每种花色的组合
    for (var i = 0; i < suits.length; i++) {
        var suit = suits[i];
        var suitCards = allCards.filter(c => c.suit === suit);
        if (suitCards.length === 0) continue;

        var result = calculateScore(suitCards);
        if (result.score > bestScore) {
            bestScore = result.score;
            bestSuit = suit;
            bestCards = suitCards;
        }
    }

    // 如果单张最高分牌比同花色更好，也考虑单张
    for (var i = 0; i < allCards.length; i++) {
        var card = allCards[i];
        var result = calculateScore([card]);
        if (result.score > bestScore) {
            bestScore = result.score;
            bestSuit = card.suit;
            bestCards = [card];
        }
    }

    // 自动选择最佳组合
    selectedCards = bestCards;
    renderHand();
    updatePreview();
}

// 创建卡片元素
function createCardElement(card, onClick, forceShowValue) {
    const div = document.createElement('div');

    // 未被揭示的牌隐藏花色和颜色，但forceShowValue可以强制显示
    var isRevealed = card.revealed === true || forceShowValue;

    let className = '';
    if (isRevealed) {
        if (card.isNegative) {
            className = 'negative';
        } else {
            className = card.isRed ? 'red' : 'black';
        }
    }
    if (card.isNew) className += ' animate';
    div.className = `card ${className}`;

    // 花色始终显示
    let displaySuit = card.suit;
    // 未投票的牌不显示分数（显示?）
    // 有评估分数的牌显示评估分数
    let displayValue = '?';

    // 对齐阶段：根据投票结果显示对应分数
    // 正分牌：重要=10，不重要=1
    // 负分牌：重要=-10，不重要=-1
    if (gamePhase === 'align' && card.evaluationScore !== null) {
        displayValue = card.evaluationScore;
    }

    // 进行阶段：使用投票确定的分数
    if (gamePhase === 'playing' && card.evaluationScore !== null) {
        displayValue = card.evaluationScore;
    }

    if (card.isNegative && card.markCount && card.markCount > 0) {
        displayValue = Math.min(0, card.value + card.markCount);
    }

    // 标记加分显示（仅已揭示的牌）
    const markBonus = isRevealed && card.markCount && card.markCount > 0 ? `+${card.markCount}` : '';

    // 投票权重显示（对齐阶段显示投票权重）
    let evalScoreText = '';
    if (isRevealed && gamePhase === 'align' && (card.importantWeight > 0 || card.notImportantWeight > 0)) {
        evalScoreText = `<span class="eval-score weight">👍${card.importantWeight || 0} 👎${card.notImportantWeight || 0}</span>`;
    }

    div.innerHTML = `
        <div class="suit">${displaySuit}</div>
        <div class="rank">${displayValue}<span class="mark-bonus">${markBonus}</span>${evalScoreText}</div>
    `;

    div.onclick = () => onClick(card);
    return div;
}

// 清除新卡牌标记
function clearNewFlags() {
    hand.forEach(c => c.isNew = false);
    table.forEach(c => c.isNew = false);
}

// 渲染负分牌（合并到renderHand中，此函数保留兼容）
function renderNegativeCard() {
    renderHand();
}

// 渲染手牌（合并负分牌）
function renderHand() {
    const handRow = document.getElementById('hand-row');
    // 保留标题
    const title = handRow.querySelector('.row-header');
    handRow.innerHTML = '';
    handRow.appendChild(title);

    // 创建内容容器
    const contentDiv = document.createElement('div');
    contentDiv.className = 'hand-row-content';

    // 渲染正常手牌
    hand.forEach(card => {
        const isSelected = selectedCards.some(c => c.id === card.id);
        const div = createCardElement(card, () => toggleSelect(card));
        if (isSelected) div.classList.add('selected');
        // 检查是否是真相条件牌
        if (truthConditionCards.some(tc => tc.id === card.id)) {
            div.classList.add('truth-condition-card');
        }
        contentDiv.appendChild(div);
    });

    handRow.appendChild(contentDiv);

    // 清除新卡标记
    clearNewFlags();

    // 更新按钮状态
    updateButtons();
}

// 更新按钮状态（根据是否选中牌显示推荐或取消选择）
function updateButtons() {
    const btnClear = document.getElementById('btn-clear');
    const btnSuggest = document.getElementById('btn-suggest');

    // 游戏结束时隐藏所有操作按钮
    if (gameOver) {
        btnClear.style.display = 'none';
        btnSuggest.style.display = 'none';
        return;
    }

    if (selectedCards.length === 0) {
        btnClear.style.display = 'none';
        btnSuggest.style.display = '';
    } else {
        btnClear.style.display = '';
        btnSuggest.style.display = 'none';
    }
}

// 推荐最佳出牌策略
function suggestBestCards() {
    autoSelectBestCards();
}

// 渲染桌面（按轮次分组）
function renderTable() {
    const tableRow = document.getElementById('table-row');
    tableRow.innerHTML = '';
    tableRow.innerHTML = '<div class="row-header"><div class="row-label">桌面上的牌</div></div>';

    // 按轮次分组显示
    playedHistory.forEach(round => {
        // 每轮的容器
        const roundContainer = document.createElement('div');
        roundContainer.className = 'round-container';

        // 轮次标签
        const roundDiv = document.createElement('div');
        roundDiv.className = 'round-label';
        roundDiv.innerHTML = `第${round.round}轮 <span class="round-score">+${round.score}</span>`;
        roundContainer.appendChild(roundDiv);

        // 该轮的牌（打出时显示真实分数）
        round.cards.forEach(card => {
            const div = createCardElement(card, () => {}, true);
            // 检查是否是真相条件牌
            if (truthConditionCards.some(tc => tc.id === card.id)) {
                div.classList.add('truth-condition-card');
            }
            roundContainer.appendChild(div);
        });

        tableRow.appendChild(roundContainer);
    });

    // 清除新卡标记
    clearNewFlags();
}

// 切换选择
function toggleSelect(card) {
    const index = selectedCards.findIndex(c => c.id === card.id);
    if (index >= 0) {
        selectedCards.splice(index, 1);
    } else {
        const maxCards = config.game['出牌最大张数'] || 5;
        if (selectedCards.length >= maxCards) {
            showMessage('最多只能选择' + maxCards + '张牌', 'warning');
            return;
        }
        selectedCards.push(card);
    }
    renderHand();
    updatePreview();
}

// 取消选择
function clearSelected() {
    selectedCards = [];
    renderHand();
    updatePreview();
}

// 更新预览
function updatePreview() {
    if (selectedCards.length === 0) {
        showMessage('选择要打出的牌', 'info');
        return;
    }

    // 检查是否有未揭示的牌
    var hasUnrevealed = selectedCards.some(c => c.revealed !== true);
    if (hasUnrevealed) {
        showMessage('选择要打出的牌', 'info');
        return;
    }

    const result = calculateScore(selectedCards);
    showMessage(result.message, 'success');
}

// 打出选中的牌（自动结算并抽牌）
function playCards() {
    if (selectedCards.length === 0) {
        showMessage('请先选择要打出的牌', 'warning');
        return;
    }

    // 检查游戏是否已结束
    if (gameOver) {
        showMessage('游戏已结束，请重新开始', 'warning');
        return;
    }

    // 检查是否还有出牌次数
    if (playsRemaining <= 0) {
        showMessage('出牌次数已用完!', 'warning');
        return;
    }

    const result = calculateScore(selectedCards, true);

    // 更新分数
    currentScore += result.score;

    // 从手牌中移除
    selectedCards.forEach(selected => {
        const index = hand.findIndex(c => c.id === selected.id);
        if (index >= 0) {
            hand.splice(index, 1);
        }
    });

    // 将当前出牌添加到历史记录
    playedHistory.push({
        round: config.game['最大出牌次数'] - playsRemaining + 1,
        cards: [...selectedCards],
        score: result.score
    });

    selectedCards = [];

    // 出牌次数减1
    playsRemaining--;

    // 渲染桌面（显示历史出牌）
    renderTable();

    // 从源头牌堆随机抽取补牌
    var handSize = config.game['手牌数量'] || 5;

    // 获取所有已打出的牌的ID
    var playedCardIds = new Set();
    playedHistory.forEach(function(round) {
        round.cards.forEach(function(card) {
            playedCardIds.add(card.id);
        });
    });

    // 过滤可用牌：不在手牌中，不在已打出的牌中
    var availableCards = sourceDeck.filter(function(c) {
        var inHand = hand.some(h => h.id === c.id);
        var played = playedCardIds.has(c.id);
        return !inHand && !played;
    });

    // 检查源头牌堆中是否还有未发出的负分牌
    var remainingNegativeCards = sourceDeck.filter(function(c) {
        var inHand = hand.some(h => h.id === c.id);
        var played = playedCardIds.has(c.id);
        return c.isNegative && !inHand && !played;
    });

    // 如果还有负分牌，只发负分牌；负分牌发完后再发正分牌
    var drawCards;
    if (remainingNegativeCards.length > 0) {
        drawCards = shuffle([...remainingNegativeCards]);
    } else {
        drawCards = shuffle(availableCards.filter(c => !c.isNegative));
    }

    // 用shift从开头抽取
    while (hand.length < handSize && drawCards.length > 0) {
        var card = drawCards.shift();
        card.isNew = true;
        hand.push(card);
    }

    // 检查是否达到出牌次数上限
    if (playsRemaining === 0) {
        // 游戏结束
        endGame();
    } else {
        // 继续游戏
        renderHand();
        updateUI();
        autoSelectBestCards();
    }
}

// 游戏结束判断
function endGame() {
    gameOver = true;

    // 计算成功分数要求
    var negCount = config.game['负分牌数'] || 6;
    var posCount = config.game['正分牌数'] || 12;
    var successScore = (posCount - negCount) * 50;

    var success = currentScore >= successScore;

    // 隐藏手牌
    document.getElementById('hand-row').style.display = 'none';
    // 渲染桌面（显示所有历史出牌）
    renderTable();
    // 更新分数显示
    updateUI();

    // 只显示重新开始按钮
    document.getElementById('action-buttons').style.display = 'flex';
    // 隐藏"打出选中的牌"和"取消选择"按钮，只留"重新开始"
    var btns = document.querySelectorAll('#action-buttons button');
    if (btns.length >= 3) {
        btns[0].style.display = 'none'; // 打出选中的牌
        btns[1].style.display = 'none'; // 取消选择
        btns[2].style.display = 'none'; // 推荐出牌
    }

    // 游戏结束，显示总分和成功/失败
    if (success) {
        showMessage(`游戏结束！成功！总分: ${currentScore} (要求: ${successScore})`, 'success');
    } else {
        showMessage(`游戏结束！失败！总分: ${currentScore} (要求: ${successScore})`, 'error');
    }

    renderHand();
}

// 更新UI
function updateUI() {
    document.getElementById('current-score').textContent = currentScore;
    document.getElementById('plays-left').textContent = playsRemaining;

    // 计算剩余牌数（sourceDeck中不在手牌和桌上的牌）
    var usedCardIds = new Set([
        ...hand.map(c => c.id),
        ...table.map(c => c.id),
        ...playedHistory.flatMap(r => r.cards).map(c => c.id)
    ]);
    var remainingCards = sourceDeck.filter(c => !usedCardIds.has(c.id));
    document.getElementById('cards-left').textContent = remainingCards.length;

    // 计算当前桌面牌的翻倍倍数（不更新状态）
    if (table.length > 0) {
        var result = calculateScore(table, false);
        document.getElementById('multiplier').textContent = 'x' + result.multiplier;
    } else {
        document.getElementById('multiplier').textContent = 'x1';
    }

    // 更新各花色剩余牌数
    updateSuitCounts();
}

// 更新花色剩余牌数（仅统计牌堆）
function updateSuitCounts() {
    var counts = {
        '♥': 0,
        '♦': 0,
        '♣': 0,
        '♠': 0
    };

    // 统计剩余牌的花色（不在手牌和桌上的牌）
    var usedCardIds = new Set([
        ...hand.map(c => c.id),
        ...table.map(c => c.id),
        ...playedHistory.flatMap(r => r.cards).map(c => c.id)
    ]);
    sourceDeck.forEach(function(card) {
        if (!usedCardIds.has(card.id) && counts.hasOwnProperty(card.suit)) {
            counts[card.suit]++;
        }
    });

    document.getElementById('count-hearts').textContent = counts['♥'];
    document.getElementById('count-diamonds').textContent = counts['♦'];
    document.getElementById('count-clubs').textContent = counts['♣'];
    document.getElementById('count-spades').textContent = counts['♠'];
}

// 显示消息
function showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.innerHTML = text;
    msg.className = `message ${type}`;
}

// 重置游戏
async function resetGame() {
    // 确保配置已加载
    await loadConfig();

    // 初始化揭示阶段
    gamePhase = 'build';
    gold = config.game['初始资金'];
    truthRevealed = false;

    // 初始化源头牌堆
    initSourceDeck();

    // 生成真相条件牌（从源头牌堆的正分牌中随机抽取5张）
    var positiveCards = sourceDeck.filter(c => !c.isNegative);
    truthConditionCards = shuffle([...positiveCards]).slice(0, 5).map(c => ({...c}));
    console.log('真相条件牌:', truthConditionCards.map(c => c.suit + c.value));

    // 生成牌包
    generatePacks();

    // 重置游戏状态
    hand = [];
    table = [];
    selectedCards = [];
    playedHistory = [];
    currentScore = 0;
    gameOver = false;
    markedCards = [];
    suitProbabilities = {};
    participants = [];
    truthConditionCards = [];

    // 恢复手牌行显示
    document.getElementById('hand-row').style.display = '';

    // 切换到构建阶段页面
    switchPage('build');

    // 渲染构建阶段
    renderBuildPhase();
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        playCards();
    } else if (e.key === 'Escape') {
        clearSelected();
    } else if (e.key === 'r' || e.key === 'R') {
        resetGame();
    }
});

// 初始化游戏
loadConfig().then(() => resetGame());
