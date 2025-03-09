// Get Firestore instance
const db = window.db;

const defaultGames = [
    { 
        name: 'Billiards', 
        image: '/images/billiards.jpg'},
    { 
        name: 'Table Tennis', 
        image: 'https://picsum.photos/200/150?random=2' 
    },
    { 
        name: 'Air Hockey', 
        image: 'https://picsum.photos/200/150?random=3' 
    },
    { 
        name: 'Chess', 
        image: 'https://picsum.photos/200/150?random=4' 
    }
];

// Global variables
let games = [];
let tables = {};
let sessions = [];
let timers = {};
let clients = [];
let balances = {};
let pendingPayment = null;
let currentGame = null;
let currentEditingGame = null;
let currentUser = null;

// Initialize application
async function initialize() {
    try {
        await loadFromFirebase();
        loadGameCards();
        createGamePages();
        loadClients();
        showPage('homepage');
        attachEventListeners();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Load data from Firebase
async function loadFromFirebase() {
    try {
        // Check if games collection exists and has data
        const gamesSnapshot = await db.collection('games').get();
        
        // Initialize with default games if empty
        if (gamesSnapshot.empty) {
            console.log('Initializing default games...');
            for (const game of defaultGames) {
                await db.collection('games').add(game);
            }
            // Fetch games again after adding defaults
            const newGamesSnapshot = await db.collection('games').get();
            games = [];
            newGamesSnapshot.forEach(doc => {
                games.push({ id: doc.id, ...doc.data() });
            });
        } else {
            // Load existing games
            games = [];
            gamesSnapshot.forEach(doc => {
                games.push({ id: doc.id, ...doc.data() });
            });
        }

        // Load tables
        const tablesSnapshot = await db.collection('tables').get();
        tables = {};
        tablesSnapshot.forEach(doc => {
            const tableData = { id: doc.id, ...doc.data() };
            const gameName = tableData.game;
            if (!tables[gameName]) tables[gameName] = [];
            tables[gameName].push(tableData);
        });

        // Load sessions
        const sessionsSnapshot = await db.collection('sessions').get();
        sessions = [];
        sessionsSnapshot.forEach(doc => {
            sessions.push({ id: doc.id, ...doc.data() });
        });

        // Load clients
        const clientsSnapshot = await db.collection('clients').get();
        clients = [];
        clientsSnapshot.forEach(doc => {
            clients.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Load balances
        const balancesSnapshot = await db.collection('balances').get();
        balances = {};
        balancesSnapshot.forEach(doc => {
            balances[doc.id] = doc.data().balances || {};
        });

        // Real-time updates for tables (optional, limit usage to stay within 100 connections)
        games.forEach(game => {
            const q = db.collection('tables').where('game', '==', game.name);
            q.onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        loadTables(game.name);
                    }
                });
            });
        });
    } catch (error) {
        console.error('Error loading from Firestore:', error);
        throw error; // Propagate error to initialize function
    }
}

async function saveToFirebase(collectionName, data, docId = null) {
    try {
        if (docId) {
            await db.collection(collectionName).doc(docId).set(data);
        } else {
            const docRef = await db.collection(collectionName).add(data);
            return docRef.id;
        }
    } catch (error) {
        console.error(`Error saving to ${collectionName}:`, error);
    }
}

function attachEventListeners() {
    document.getElementById('nav-home').addEventListener('click', (e) => { e.preventDefault(); showPage('homepage'); });
    document.getElementById('nav-clients').addEventListener('click', (e) => { e.preventDefault(); showPage('clients-page'); });
    document.getElementById('nav-payment-reports').addEventListener('click', (e) => { e.preventDefault(); showPage('payment-reports'); });
    document.getElementById('nav-balance-reports').addEventListener('click', (e) => { 
        e.preventDefault(); 
        showBalanceReports(); // Call showBalanceReports directly instead of through showPage
    });
    document.getElementById('add-game-btn').addEventListener('click', showAddGame);
    document.getElementById('submit-game').addEventListener('click', addGame);
    document.getElementById('add-client-btn').addEventListener('click', showAddClient);
    document.getElementById('submit-client').addEventListener('click', addClient);
    document.getElementById('generate-payment-report').addEventListener('click', showPaymentReports);
    document.getElementById('confirm-payment').addEventListener('click', confirmPayment);
    document.getElementById('close-billing').addEventListener('click', closeBillingModal);
    document.getElementById('confirm-best-of-3').addEventListener('click', confirmBestOfThree);
    document.getElementById('cancel-best-of-3').addEventListener('click', cancelBestOfThree);
    document.getElementById('confirm-image-edit').addEventListener('click', updateGameImage);
    document.getElementById('cancel-image-edit').addEventListener('click', closeImageEditor);
    document.getElementById('image-file').addEventListener('change', handleFileSelect);
    document.getElementById('client-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-client')) {
            deleteClient(e.target.dataset.id);
        }
    });
    document.getElementById('logout-btn').addEventListener('click', logout);
}

function showPage(pageId) {
    document.querySelectorAll('section, #game-pages > section').forEach(section => section.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
    
    // Remove the automatic loading of balance reports to prevent recursion
    if (pageId === 'clients-page') {
        loadClients();
    }
    // Only load balance reports when explicitly called from the navigation
    // Remove this line to prevent recursion:
    // if (pageId === 'balance-reports') showBalanceReports();
}

function loadGameCards() {
    const gameCards = document.getElementById('game-cards');
    gameCards.innerHTML = '';
    games.forEach(game => {
        gameCards.innerHTML += `
            <div class="game-card" data-game="${game.name}">
                <div class="game-card-controls">
                    <button class="delete-game" data-id="${game.id}">×</button>
                    <button class="edit-image" data-id="${game.id}">🖼️</button>
                </div>
                <img src="${game.image}" alt="${game.name}">
                <p>${game.name}</p>
            </div>`;
    });
    // Add click handlers for game cards and buttons
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-game') && !e.target.classList.contains('edit-image')) {
                showGamePage(card.dataset.game);
            }
        });
    });
    
    document.querySelectorAll('.delete-game').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteGame(btn.dataset.id, btn.parentElement.parentElement.dataset.game);
        });
    });

    document.querySelectorAll('.edit-image').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showImageEditor(btn.dataset.id);
        });
    });
}

function showAddGame() {
    document.getElementById('add-game-form').classList.toggle('hidden');
}

async function addGame() {
    const newGame = document.getElementById('new-game').value.trim();
    const imageUrl = document.getElementById('new-game-image').value.trim() || 'https://via.placeholder.com/200x150?text=' + newGame;
    if (newGame && !games.some(g => g.name === newGame)) {
        const gameData = { name: newGame, image: imageUrl };
        const docId = await saveToFirebase('games', gameData);
        games.push({ id: docId, ...gameData });
        tables[newGame] = [];
        loadGameCards();
        createGamePages();
        document.getElementById('new-game').value = '';
        document.getElementById('new-game-image').value = '';
        document.getElementById('add-game-form').classList.add('hidden');
    }
}

function showAddClient() {
    document.getElementById('add-client-form').classList.toggle('hidden');
}

async function addClient() {
    const clientName = document.getElementById('new-client').value.trim();
    const clientPhone = document.getElementById('client-phone').value.trim();
    
    if (!clientName) {
        alert('Client name is required');
        return;
    }

    try {
        const clientData = {
            name: clientName,
            phone: clientPhone
        };

        const docRef = await db.collection('clients').add(clientData);
        clients.push({ id: docRef.id, ...clientData });
        
        // Reset form
        document.getElementById('new-client').value = '';
        document.getElementById('client-phone').value = '';
        document.getElementById('add-client-form').classList.add('hidden');
        
        loadClients();
    } catch (error) {
        console.error('Error adding client:', error);
        alert('Failed to add client. Please try again.');
    }
}

function loadClients() {
    const clientList = document.getElementById('client-list');
    clientList.innerHTML = '<h3>Client List</h3>';
    if (clients.length === 0) {
        clientList.innerHTML += '<p>No clients added yet.</p>';
    } else {
        clientList.innerHTML += `
            <div class="client-grid">
                ${clients.map(client => `
                    <div class="client-card">
                        <div class="client-info">
                            <p class="client-name">${client.name}</p>
                            <p class="client-phone">${client.phone || 'No phone'}</p>
                        </div>
                        <button class="delete-client" data-id="${client.id}">×</button>
                    </div>
                `).join('')}
            </div>`;
    }
}

function createGamePages() {
    const gamePages = document.getElementById('game-pages');
    gamePages.innerHTML = '';
    games.forEach(game => {
        gamePages.innerHTML += `
            <section id="${game.name}-page" class="game-page hidden">
                <h2>${game.name} Management</h2>
                <div class="table-controls">
                    <input type="text" id="${game.name}-table-name" placeholder="Table Name">
                    <input type="number" id="${game.name}-rate" placeholder="Rate per minute" step="0.01">
                    <button data-game="${game.name}" class="add-table-btn">Add Table</button>
                </div>
                <div id="${game.name}-tables" class="table-list"></div>
                <div id="${game.name}-best-of-3-controls" class="best-of-3-controls hidden">
                    <button data-game="${game.name}" class="best-of-3 start-match-btn">Start Best of 3 Match</button>
                    <button data-game="${game.name}" class="best-of-3 reset-match-btn">Reset Match</button>
                </div>
                <div id="${game.name}-history" class="report-table-container"></div>
            </section>`;
    });
    document.querySelectorAll('.add-table-btn').forEach(btn => {
        btn.addEventListener('click', () => addTable(btn.dataset.game));
    });
    document.querySelectorAll('.start-match-btn').forEach(btn => {
        btn.addEventListener('click', () => startBestOfThreeMatch(btn.dataset.game));
    });
    document.querySelectorAll('.reset-match-btn').forEach(btn => {
        btn.addEventListener('click', () => resetBestOfThree(btn.dataset.game));
    });
}

function showGamePage(gameName) {
    showPage(`${gameName}-page`);
    loadTables(gameName);
    const bestOfThreeControls = document.getElementById(`${gameName}-best-of-3-controls`);
    bestOfThreeControls.classList.remove('hidden');
}

function loadTables(game) {
    const tableList = document.getElementById(`${game}-tables`);
    tableList.innerHTML = '';
    if (tables[game]) {
        tables[game].forEach((table, index) => {
            tableList.innerHTML += `
                <div class="table-item">
                    ${table.name} - ₹${table.rate}/min
                    ${table.bestOfThree ? 
                        `<span class="best-of-3-score">P1 (${table.bestOfThree.player1}): ${table.bestOfThree.player1Wins} - P2 (${table.bestOfThree.player2}): ${table.bestOfThree.player2Wins}</span>` : 
                        `${table.client ? `(${table.client})` : ''}`}
                    ${table.active ? 
                        `<button class="stop" data-game="${game}" data-index="${index}">Stop</button>` : 
                        (table.pending ? 
                            `<button class="pay" data-game="${game}" data-index="${index}">Pay</button>` : 
                            `<select id="client-${game}-${index}" required>
                                <option value="">Select Client</option>
                                ${clients.map(c => `<option value="${c.name}" ${table.client === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
                            </select>
                            <button class="start" data-game="${game}" data-index="${index}">Start</button>`)}
                    <span class="timer">${table.active ? getTimerDisplay(game, index) : ''}</span>
                    <button class="remove" data-game="${game}" data-index="${index}">Remove</button>
                </div>`;
        });
    }
    document.querySelectorAll('.start').forEach(btn => btn.addEventListener('click', () => startTimer(btn.dataset.game, btn.dataset.index)));
    document.querySelectorAll('.stop').forEach(btn => btn.addEventListener('click', () => stopTimer(btn.dataset.game, btn.dataset.index)));
    document.querySelectorAll('.pay').forEach(btn => btn.addEventListener('click', () => openBillingModal(btn.dataset.game, btn.dataset.index)));
    document.querySelectorAll('.remove').forEach(btn => btn.addEventListener('click', () => removeTable(btn.dataset.game, btn.dataset.index)));
    loadHistory(game);
}

function getTimerDisplay(game, index) {
    const table = tables[game][index];
    if (!table.startTime) return '00:00';
    const start = new Date(table.startTime);
    const now = new Date();
    const diff = Math.floor((now - start) / 1000);
    const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
    const seconds = (diff % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function updateTimer(game, index) {
    const table = tables[game][index];
    if (table.active) {
        const timerSpan = document.querySelector(`#${game}-tables .table-item:nth-child(${parseInt(index) + 1}) .timer`);
        if (timerSpan) timerSpan.textContent = getTimerDisplay(game, index);
    }
}

async function addTable(game) {
    const tableName = document.getElementById(`${game}-table-name`).value.trim();
    const rate = parseFloat(document.getElementById(`${game}-rate`).value);
    if (tableName && rate > 0) {
        if (!tables[game]) tables[game] = [];
        const newTable = { 
            name: tableName, 
            rate, 
            active: false, 
            pending: false, 
            client: null, 
            history: [], 
            bestOfThree: null, 
            game 
        };
        const docId = await saveToFirebase('tables', newTable);
        newTable.id = docId;
        tables[game].push(newTable);
        loadTables(game);
        document.getElementById(`${game}-table-name`).value = '';
        document.getElementById(`${game}-rate`).value = '';
    }
}

async function removeTable(game, index) {
    if (!tables[game][index].active && !tables[game][index].pending) {
        await db.collection('tables').doc(tables[game][index].id).delete();
        tables[game].splice(index, 1);
        loadTables(game);
    }
}

async function startTimer(game, index) {
    const table = tables[game][index];
    if (!table.active) {
        if (table.bestOfThree && table.bestOfThree.rounds.length < 3) {
            table.active = true;
            table.startTime = new Date().toLocaleString();
            table.client = document.getElementById(`client-${game}-${index}`).value;
            timers[`${game}-${index}`] = setInterval(() => updateTimer(game, index), 1000);
            await saveToFirebase('tables', table, table.id);
            loadTables(game);
        } else if (!table.bestOfThree) {
            table.active = true;
            table.startTime = new Date().toLocaleString();
            table.client = document.getElementById(`client-${game}-${index}`).value;
            timers[`${game}-${index}`] = setInterval(() => updateTimer(game, index), 1000);
            await saveToFirebase('tables', table, table.id);
            loadTables(game);
        } else {
            alert('Best of 3 match limit reached or not started. Reset or start a match.');
        }
    }
}

async function stopTimer(game, index) {
    const table = tables[game][index];
    if (table.active) {
        table.active = false;
        table.pending = true;
        table.endTime = new Date().toLocaleString();
        const start = new Date(table.startTime);
        const end = new Date(table.endTime);
        const minutes = (end - start) / (1000 * 60);
        table.charge = (minutes * table.rate).toFixed(2);

        if (table.bestOfThree) {
            table.bestOfThree.rounds.push({
                client: table.client,
                start: table.startTime,
                end: table.endTime,
                charge: table.charge
            });
            const winner = prompt(`Who won this round? Enter "1" for ${table.bestOfThree.player1}, "2" for ${table.bestOfThree.player2}, or "cancel" to skip.`);
            if (winner === "1") {
                table.bestOfThree.player1Wins++;
            } else if (winner === "2") {
                table.bestOfThree.player2Wins++;
            }

            if (table.bestOfThree.player1Wins === 2) {
                alert(`${table.bestOfThree.player1} wins the Best of 3!`);
                table.bestOfThree.rounds = [];
                table.bestOfThree.player1Wins = 0;
                table.bestOfThree.player2Wins = 0;
            } else if (table.bestOfThree.player2Wins === 2) {
                alert(`${table.bestOfThree.player2} wins the Best of 3!`);
                table.bestOfThree.rounds = [];
                table.bestOfThree.player1Wins = 0;
                table.bestOfThree.player2Wins = 0;
            }
        }

        clearInterval(timers[`${game}-${index}`]);
        delete timers[`${game}-${index}`];
        await saveToFirebase('tables', table, table.id);
        loadTables(game);
    }
}

async function openBillingModal(game, index) {
    const table = tables[game][index];
    pendingPayment = { game, index };
    document.getElementById('billing-client').textContent = `Client: ${table.client}`;
    document.getElementById('billing-game').textContent = `Game: ${game}`;
    document.getElementById('billing-table').textContent = `Table: ${table.name}`;
    document.getElementById('billing-start').textContent = `Start: ${table.startTime}`;
    document.getElementById('billing-end').textContent = `End: ${table.endTime}`;
    document.getElementById('billing-amount').textContent = table.charge;
    document.getElementById('billing-paid').value = '';
    document.getElementById('billing-balance').textContent = '0.00';
    document.getElementById('billing-modal').classList.remove('hidden');
}

function updateBalance() {
    const amount = parseFloat(document.getElementById('billing-amount').textContent);
    const paid = parseFloat(document.getElementById('billing-paid').value) || 0;
    const balance = (amount - paid).toFixed(2);
    document.getElementById('billing-balance').textContent = balance > 0 ? balance : '0.00';
}

async function closeBillingModal() {
    if (pendingPayment) {
        const { game, index } = pendingPayment;
        const table = tables[game][index];
        const amount = parseFloat(table.charge);
        const paid = parseFloat(document.getElementById('billing-paid').value) || 0;
        const balance = amount - paid;

        if (balance > 0) {
            if (!balances[table.client]) balances[table.client] = {};
            if (!balances[table.client][game]) balances[table.client][game] = 0;
            balances[table.client][game] += parseFloat(balance.toFixed(2));
            await saveToFirebase('balances', { balances: balances[table.client] }, table.client);
        }

        table.pending = false;
        table.client = null;
        table.startTime = null;
        table.endTime = null;
        table.charge = null;
        await saveToFirebase('tables', table, table.id);
        loadTables(game);
    }
    document.getElementById('billing-modal').classList.add('hidden');
    pendingPayment = null;
}

async function confirmPayment() {
    const { game, index } = pendingPayment;
    const table = tables[game][index];
    const paymentMode = document.getElementById('billing-mode').value;
    const amountPaid = parseFloat(document.getElementById('billing-paid').value) || 0;
    const totalCharge = parseFloat(table.charge);
    const balance = totalCharge - amountPaid;

    const session = {
        start: table.startTime,
        end: table.endTime,
        charge: amountPaid.toFixed(2),
        client: table.client,
        paymentMode,
        game,
        table: table.name
    };
    table.history.push(session);
    if (amountPaid > 0) {
        const sessionId = await saveToFirebase('sessions', session);
        sessions.push({ id: sessionId, ...session });
    }
    if (balance > 0) {
        if (!balances[table.client]) balances[table.client] = {};
        if (!balances[table.client][game]) balances[table.client][game] = 0;
        balances[table.client][game] += parseFloat(balance.toFixed(2));
        await saveToFirebase('balances', { balances: balances[table.client] }, table.client);
    }
    table.pending = false;
    table.client = null;
    table.startTime = null;
    table.endTime = null;
    table.charge = null;
    await saveToFirebase('tables', table, table.id);
    loadTables(game);
    document.getElementById('billing-modal').classList.add('hidden');
    pendingPayment = null;
}

async function loadHistory(game) {
    const historyDiv = document.getElementById(`${game}-history`);
    historyDiv.innerHTML = '<h3>Session History</h3>';
    let hasHistory = false;
    let historyHTML = '<table class="history-table"><tr><th>Table</th><th>Client</th><th>Start</th><th>Stop</th><th>Charge</th><th>Mode</th></tr>';

    // Load from table history
    if (tables[game]) {
        tables[game].forEach(table => {
            table.history.forEach(session => {
                hasHistory = true;
                historyHTML += `
                    <tr>
                        <td>${table.name}</td>
                        <td>${session.client}</td>
                        <td>${session.start}</td>
                        <td>${session.end}</td>
                        <td>₹${session.charge}</td>
                        <td>${session.paymentMode || 'N/A'}</td>
                    </tr>`;
            });
            if (table.bestOfThree) {
                table.bestOfThree.rounds.forEach(round => {
                    hasHistory = true;
                    historyHTML += `
                        <tr>
                            <td>${table.name}</td>
                            <td>${round.client}</td>
                            <td>${round.start}</td>
                            <td>${round.end}</td>
                            <td>₹${round.charge}</td>
                            <td>N/A</td>
                        </tr>`;
                });
            }
        });
    }

    // Load additional sessions from Firestore
    const sessionsSnapshot = await db.collection('sessions').where('game', '==', game).get();
    sessionsSnapshot.forEach(doc => {
        const session = doc.data();
        hasHistory = true;
        historyHTML += `
            <tr>
                <td>${session.table}</td>
                <td>${session.client}</td>
                <td>${session.start}</td>
                <td>${session.end}</td>
                <td>₹${session.charge}</td>
                <td>${session.paymentMode || 'N/A'}</td>
            </tr>`;
    });

    historyHTML += '</table>';
    if (hasHistory) historyDiv.innerHTML += historyHTML;
}

async function showPaymentReports() {
    showPage('payment-reports');
    const from = document.getElementById('payment-from').value ? new Date(document.getElementById('payment-from').value) : null;
    const to = document.getElementById('payment-to').value ? new Date(document.getElementById('payment-to').value) : null;
    const paymentHistory = document.getElementById('payment-history');
    let total = 0;

    paymentHistory.innerHTML = '<h3>Payment Details</h3>';
    let historyHTML = '<table class="report-table"><tr><th>Client</th><th>Game</th><th>Amount</th><th>Mode</th></tr>';
    const sessionsSnapshot = await db.collection('sessions').get();
    sessionsSnapshot.forEach(doc => {
        const session = doc.data();
        const startDate = new Date(session.start);
        if ((!from || startDate >= from) && (!to || startDate <= to)) {
            total += parseFloat(session.charge);
            historyHTML += `
                <tr>
                    <td>${session.client}</td>
                    <td>${session.game}</td>
                    <td>₹${session.charge}</td>
                    <td>${session.paymentMode}</td>
                </tr>`;
        }
    });
    historyHTML += '</table>';
    paymentHistory.innerHTML += historyHTML;
    document.getElementById('payment-revenue-total').textContent = total.toFixed(2);
}

async function showBalanceReports() {
    // First show the page
    document.querySelectorAll('section, #game-pages > section').forEach(section => section.classList.add('hidden'));
    document.getElementById('balance-reports').classList.remove('hidden');

    // Then load the balance data
    const balanceHistory = document.getElementById('balance-history');
    balanceHistory.innerHTML = '<h3>Outstanding Balances</h3>';

    let hasBalances = false;
    let balanceHTML = '<table class="report-table"><tr><th>Client</th><th>Game</th><th>Amount Owed</th></tr>';
    
    try {
        const balancesSnapshot = await db.collection('balances').get();
        balancesSnapshot.forEach(doc => {
            const client = doc.id;
            const clientBalances = doc.data().balances || {};
            for (const game in clientBalances) {
                hasBalances = true;
                balanceHTML += `
                    <tr>
                        <td>${client}</td>
                        <td>${game}</td>
                        <td>₹${clientBalances[game].toFixed(2)}</td>
                    </tr>`;
            }
        });
        balanceHTML += '</table>';
        balanceHistory.innerHTML += hasBalances ? balanceHTML : '<p>No outstanding balances.</p>';
    } catch (error) {
        console.error('Error loading balances:', error);
        balanceHistory.innerHTML += '<p class="error">Error loading balances. Please try again.</p>';
    }
}

function startBestOfThreeMatch(game) {
    document.getElementById('best-of-3-modal').classList.remove('hidden');
    updateBestOfThreeSelects();
    currentGame = game;
}

async function confirmBestOfThree() {
    const player1 = document.getElementById('best-of-3-player1').value;
    const player2 = document.getElementById('best-of-3-player2').value;
    if (player1 && player2 && player1 !== player2) {
        tables[currentGame].forEach(table => {
            table.bestOfThree = { player1, player2, player1Wins: 0, player2Wins: 0, rounds: [] };
            saveToFirebase('tables', table, table.id);
        });
        loadTables(currentGame);
        document.getElementById('best-of-3-modal').classList.add('hidden');
    } else {
        alert('Please select two different clients for the match.');
        
    }
}

function cancelBestOfThree() {
    document.getElementById('best-of-3-modal').classList.add('hidden');
}

async function resetBestOfThree(game) {
    tables[game].forEach(table => {
        table.bestOfThree = null;
        saveToFirebase('tables', table, table.id);
    });
    loadTables(game);
}

function updateBestOfThreeSelects() {
    const player1Select = document.getElementById('best-of-3-player1');
    const player2Select = document.getElementById('best-of-3-player2');
    if (player1Select && player2Select) {
        player1Select.innerHTML = clients.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        player2Select.innerHTML = clients.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
}

// Remove LocalStorage functions
function loadFromStorage() {}
function saveToStorage() {}

// Authentication functions
async function loginUser(username, password) {
    try {
        const usersSnapshot = await db.collection('users').where('username', '==', username).get();
        
        if (usersSnapshot.empty) {
            throw new Error('User not found');
        }

        const userDoc = usersSnapshot.docs[0];
        const userData = userDoc.data();
        
        if (userData.password !== password) { // In production, use proper password hashing
            throw new Error('Invalid password');
        }

        currentUser = {
            id: userDoc.id,
            username: userData.username,
            isAdmin: userData.isAdmin || false
        };

        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showMainApplication();
    } catch (error) {
        showAuthError(error.message);
    }
}

async function registerUser(username, password) {
    try {
        // Check if username exists
        const existingUser = await db.collection('users').where('username', '==', username).get();
        if (!existingUser.empty) {
            throw new Error('Username already exists');
        }

        // Create new user
        const userRef = await db.collection('users').add({
            username,
            password, // In production, use proper password hashing
            isAdmin: false,
            createdAt: new Date().toISOString()
        });

        currentUser = {
            id: userRef.id,
            username,
            isAdmin: false
        };

        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showMainApplication();
    } catch (error) {
        showAuthError(error.message);
    }
}

function showAuthError(message) {
    const errorElement = document.getElementById('auth-error');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}

function showMainApplication() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    initialize();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
}

// Update window.onload to handle async initialization
window.onload = () => {
    // Check for existing session
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainApplication();
    }

    // Add auth event listeners
    document.getElementById('login-btn').addEventListener('click', () => {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!username || !password) {
            showAuthError('Please enter both username and password');
            return;
        }
        loginUser(username, password);
    });

    document.getElementById('register-btn').addEventListener('click', () => {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        if (!username || !password) {
            showAuthError('Please enter both username and password');
            return;
        }
        registerUser(username, password);
    });
};

async function deleteGame(gameId, gameName) {
    if (!confirm(`Are you sure you want to delete ${gameName}? This will also delete all associated tables and history.`)) {
        return;
    }

    try {
        // Delete the game document
        await db.collection('games').doc(gameId).delete();

        // Delete associated tables
        if (tables[gameName]) {
            for (const table of tables[gameName]) {
                await db.collection('tables').doc(table.id).delete();
            }
        }

        // Remove from local arrays
        games = games.filter(g => g.id !== gameId);
        delete tables[gameName];

        // Refresh UI
        loadGameCards();
        createGamePages();
        showPage('homepage');

    } catch (error) {
        console.error('Error deleting game:', error);
        alert('Failed to delete game. Please try again.');
    }
}

function showImageEditor(gameId) {
    currentEditingGame = gameId;
    const game = games.find(g => g.id === gameId);
    const modal = document.getElementById('edit-image-modal');
    const input = document.getElementById('edit-game-image');
    const fileInput = document.getElementById('image-file');
    
    input.value = game.image;
    fileInput.value = ''; // Reset file input
    
    // Add file input handler
    fileInput.onchange = handleFileSelect;
    
    modal.classList.remove('hidden');
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('edit-game-image').value = e.target.result;
        };
        reader.onerror = function() {
            alert('Error reading file');
        };
        reader.readAsDataURL(file);
    }
}

async function updateGameImage() {
    if (!currentEditingGame) return;
    
    try {
        const newImageUrl = document.getElementById('edit-game-image').value.trim();
        if (!newImageUrl) {
            alert('Please enter a valid image URL or upload an image');
            return;
        }

        // Update in Firebase first
        await db.collection('games').doc(currentEditingGame).update({
            image: newImageUrl
        });

        // If Firebase update successful, update local state
        const game = games.find(g => g.id === currentEditingGame);
        if (game) {
            game.image = newImageUrl;
            loadGameCards(); // Refresh the UI
        }
        
        // Close modal
        closeImageEditor();
        
    } catch (error) {
        console.error('Error updating game image:', error);
        if (error.code === 'permission-denied') {
            alert('Permission denied. Please check your Firebase rules.');
        } else {
            alert(`Error updating image: ${error.message}`);
        }
    }
}

function closeImageEditor() {
    currentEditingGame = null;
    document.getElementById('edit-image-modal').classList.add('hidden');
}

async function deleteClient(clientId) {
    if (!confirm('Are you sure you want to delete this client?')) {
        return;
    }

    try {
        await db.collection('clients').doc(clientId).delete();
        clients = clients.filter(client => client.id !== clientId);
        loadClients();
    } catch (error) {
        console.error('Error deleting client:', error);
        alert('Failed to delete client. Please try again.');
    }
}