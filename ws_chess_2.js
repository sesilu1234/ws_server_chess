const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const fs = require('fs');

// Load environment variables from .env file
dotenv.config();





const logStream = fs.createWriteStream('logs_loki/chess_server.log', { flags: 'a' });

const writeLOG = (...args) => {
  logStream.write(`[LOG] ${new Date().toISOString()} - ${args.join(' ')}\n`);
};

const writeERROR = (...args) => {
  logStream.write(`[ERROR] ${new Date().toISOString()} - ${args.join(' ')}\n`);
};

// For modality time_per_player :

// when a player moves his time left is updated to as the time when his movement started in server side but also sent to client(maybe better to send this when his turn begins);so when he moves (so start_movement must be stored0),

// For modality time_per_round :

// when a player moves his time resets to original

// El ID ha de ser generado por servers

// al enviar movimiento, delete de minus10, siempre...eso si, primero cambio el undefined y despues deleteo en mins10, no vaya a ser

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT, 10);

const { MongoClient } = require("mongodb");

// Connection URI with pool size configuration
const uri = process.env.MONGO_DB;
const options = {
    maxPoolSize: 10, // Set the max number of connections in the pool
    minPoolSize: 2, // Optional: Set a minimum pool size
};

const client = new MongoClient(uri, options);

client.connect();

const clients = new Set();

let games = new Map();

let blackList = new Set();

let rateLimit = new Map();

function clear_Limits() {
    blackList.clear();
    rateLimit.clear();
}

setInterval(clear_Limits, 3600000);

async function run_insertMongo(GameState) {
    try {
        

        const database = client.db("chess_recover_games");
        const gamesCollection = database.collection("games");

        const result = await gamesCollection.replaceOne(
            { id: GameState.id },
            GameState,
            { upsert: true },
        );
        
    } catch (error) {
        writeERROR("Error connecting to MongoDB:", error);
    }
}

const games_recover = new Map();

const timer_games_plus10 = new Map();
const timer_games_minus10 = new Map();

const alive_ping = () => {
    for (const client of clients) {
        // Ensure the WebSocket connection is open before sending a ping
        if (client.readyState === WebSocket.OPEN) {
            client.send(
                JSON.stringify({
                    type: "ping_alive",
                    payload: {},
                }),
            );
        }
    }

    
    
};

setInterval(() => {
    alive_ping();
}, 15000);

const clearClients = () => {
    writeLOG(
        "Initiating clearing of clients. Number of clients:",
        clients.size,
    );

    for (const client of clients) {
        if (client.readyState === 3) {
            clients.delete(client);

            for (const [gameId, game] of games) {
                if (
                    game.player1.client === client ||
                    game.player2.client === client
                ) {
                    games.delete(gameId);

                    break;
                }
            }
        }
    }

    writeLOG("Cleared closed clients. Active clients:", clients.size);
    writeLOG("Cleared closed games. Active games:", games.size);
    writeLOG("Blacklist:", blackList);
};

setInterval(clearClients, 3600000);

//    algorithmic_max_time  =>     10.000 + 1 + var_exec + exec_time

const per_player_plus10 = () => {
    const currentTime = Date.now();

    for (let [key, element] of timer_games_plus10) {
        if (
            element[element.currentplayer].time -
                (currentTime - element.timestart) <
            15000
        ) {
            timer_games_minus10.set(key, {
                ...element,
            });
            element.timestart = undefined;
        }
    }
};

const per_player_minus10 = () => {
    const currentTime = Date.now();

    for (let [key, element] of timer_games_minus10) {
        if (
            element[element.currentplayer].time -
                (currentTime - element.timestart) <
            -0.2
        ) {
            element.player1.client.send(
                JSON.stringify({
                    type: "end_game",
                    payload: {
                        motive: "end_time",
                        winner:
                            element.currentplayer === "player1"
                                ? element.player2.name
                                : element.player1.name,
                    },
                }),
            );
            element.player2.client.send(
                JSON.stringify({
                    type: "end_game",
                    payload: {
                        motive: "end_time",
                        winner:
                            element.currentplayer === "player1"
                                ? element.player2.name
                                : element.player1.name,
                    },
                }),
            );

            timer_games_minus10.delete(key);
            timer_games_plus10.delete(key);
        }
    }
};

setInterval(() => {
    per_player_plus10();
}, 10000);

setInterval(() => {
    per_player_minus10();
}, 1000);

function getRandomInt() {
    return Math.floor(Math.random() * 10);
}

function getRandomLetter() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    return letters.charAt(Math.floor(Math.random() * letters.length));
}

function getRandomID() {
    return (id =
        getRandomLetter() +
        getRandomInt() +
        "-" +
        getRandomLetter() +
        getRandomLetter() +
        getRandomInt() +
        getRandomLetter() +
        "-" +
        getRandomLetter() +
        getRandomLetter() +
        getRandomInt() +
        getRandomInt());
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: process.env.DB_CONNECTION_LIMIT,
    queueLimit: process.env.DB_QUEUE_LIMIT,
});

// Optional: Promisify the pool for async/await support
const promisePool = pool.promise();

// Read the SSL certificate files from the certbot folder
const server = http.createServer({});

// Create a secure WebSocket server on top of the HTTPS server
const wss = new WebSocket.Server({
    server,
});

wss.on("connection", (ws, req) => {

    const real_ip = req.headers['x-real-ip']

   

    if (blackList.has(real_ip)) {
        ws.close();
    } else {
        if (!rateLimit.has(real_ip)) {
            rateLimit.set(real_ip, { count: 0 });
        }
    }
    

    
    

    clients.add(ws);

    ws.on("message", async (data) => {
        try {
            const ip_sum1 = rateLimit.get(real_ip);

            if (ip_sum1) {
                if (ip_sum1.count >= RATE_LIMIT) {
                    ws.close();
                    blackList.add(real_ip);
                } else {
                    ip_sum1.count += 1;
                }
            } else {
                // Initialize rate limit tracking for this IP
                rateLimit.set(real_ip, { count: 0 });
            }

            const message = JSON.parse(data);
            const payload = message.payload;

            switch (message.type) {
                case "feedback": {
                    const sql_1 = `
                        INSERT INTO feedback_messages (message, ip_address)
                        VALUES (?, ?)
                    `;

                    const ipAddress = ws._socket.remoteAddress; // Assuming you're using WebSocket with the "ws" library
                    const message = payload.text;

                    await promisePool.query(sql_1, [message, ipAddress]);

                    break;
                }

                case "create_game":
                    const now = new Date();
                    const isoString = now.toISOString();
                    const time = isoString.replace("T", " ").substring(0, 19);

                    id = getRandomID();

                    const sql = "CALL insert_game_1(?, ?, ?, ?, ?, ?, ?, ?)";

                    try {
                        const [rows] = await promisePool.query(sql, [
                            id,
                            payload.player1,
                            payload.color1,
                            payload.player2,
                            payload.color2,
                            payload.countdown_time,
                            payload.time_modality,
                            time,
                        ]);

                        
                    } catch (error) {
                        writeERROR("Error inserting game:", error);
                    }

                    games.set(id, {
                        player1: {
                            client: ws,
                            name: payload.player1,
                            time: payload.countdown_time,
                        },
                        player2: {
                            client: undefined,
                            name: payload.player2,
                            time: payload.countdown_time,
                        },
                        time_modality: payload.time_modality,
                        currentplayer: "player1",
                        timestart: undefined,
                    });

                    ws.send(
                        JSON.stringify({
                            type: "ID",
                            payload: id,
                        }),
                    );

                    break;

                case "join_game":




                const sql_recover = "SELECT * FROM recover_game WHERE id = ?";

                const game_sql_recover = await promisePool.query(sql_recover, [
                    payload.id,
                ]);


                if (game_sql_recover[0].length > 0) {


                    ws.send(
                        JSON.stringify({
                            type: "recover_click",
                           
                        }),
                    );


                }

                else{


                    const sql_id = "SELECT * FROM created_games WHERE id = ?";

                    const game_sql = await promisePool.query(sql_id, [
                        payload.id,
                    ]);

                    if (game_sql[0].length > 0) {
                        const match = game_sql[0][0];

                        const game = games.get(payload.id); // Retrieve the game object by its ID

                        game.player2.client = ws;

                        const sendJSON1 = {
                            id: match.id,
                            player1: match.player1,
                            color1: match.color1,
                            player2: match.player2,
                            color2: match.color2,
                            countdown_time: match.countdown_time,
                            time_modality: match.time_modality,
                            round: 1,
                        };
                        const sendJSON2 = {
                            id: match.id,
                            player1: match.player2,
                            color1: match.color2,
                            player2: match.player1,
                            color2: match.color1,
                            countdown_time: match.countdown_time,
                            time_modality: match.time_modality,
                            round: 2,
                        };

                        game.player1.client.send(
                            JSON.stringify({
                                type: "start_game",
                                found: true,
                                payload: sendJSON1,
                            }),
                        );
                        game.player2.client.send(
                            JSON.stringify({
                                type: "start_game",
                                found: true,
                                payload: sendJSON2,
                            }),
                        );

                        game.timestart = Date.now();

                        const x = [match.id, game];
                        timer_games_plus10.set(x[0], x[1]);
                    } else {
                        ws.send(
                            JSON.stringify({
                                type: "start_game",
                                found: false,
                            }),
                        );
                    }}
                    break;

                case "move":
                    const game = games.get(payload.id);

                    if (game.time_modality == "perPlayer") {
                        game[game.currentplayer].time -=
                            Date.now() - game.timestart;
                    }

                    const sendJSON = {
                        id: payload.id,
                        moveA: payload.moveA,
                        moveB: payload.moveB,
                        turn: payload.turn,
                        pawn_promotion: payload.pawn_promotion,
                        castling: payload.castle,
                        time_left:
                            game.currentplayer === "player1"
                                ? game.player2.time
                                : game.player1.time,
                    };

                    if (game.player1.client === ws) {
                        game.player2.client.send(
                            JSON.stringify({
                                type: "move",
                                payload: sendJSON,
                            }),
                        );
                        game.player1.client.send(
                            JSON.stringify({
                                type: "time_left",
                                payload: sendJSON.time_left,
                            }),
                        );
                    } else {
                        game.player1.client.send(
                            JSON.stringify({
                                type: "move",
                                payload: sendJSON,
                            }),
                        );
                        game.player2.client.send(
                            JSON.stringify({
                                type: "time_left",
                                payload: sendJSON.time_left,
                            }),
                        );
                    }

                    game.currentplayer =
                        game.currentplayer === "player1"
                            ? "player2"
                            : "player1";

                    game.timestart = Date.now();

                    timer_games_minus10.delete(payload.id);

                    break;

                case "recover_game":
                    switch (payload.type) {
                        case "rg1":
                            const sql_id =
                                "SELECT * FROM recover_game WHERE id = ?";

                            const game_sql = await promisePool.query(sql_id, [
                                payload.id,
                            ]);

                            const names_match = game_sql[0][0];

                            if (game_sql[0].length > 0) {
                                const game_to_recover = games_recover.get(
                                    payload.id,
                                );

                                if (
                                    game_to_recover &&
                                    game_to_recover.ws_client != ws &&
                                    game_to_recover.ws_client.readyState == 1
                                ) 
                                     {   game_to_recover.ws_client_opponent = ws;

                                        games_recover.set(
                                            payload.id,
                                            game_to_recover,
                                        );

                                        game_to_recover.ws_client.send(
                                            JSON.stringify({
                                                type: "rg_ping",
                                                payload: {
                                                    id: payload.id,
                                                },
                                            }),
                                        );
                                   
                                } else {
                                    ws.send(
                                        JSON.stringify({
                                            type: "rg1",
                                            payload: {
                                                found: true,
                                                player1: names_match.player1,
                                                player2: names_match.player2,
                                            },
                                        }),
                                    );
                                }
                            } else {
                                ws.send(
                                    JSON.stringify({
                                        type: "rg1",
                                        payload: {
                                            found: false,
                                        },
                                    }),
                                );
                                
                            }

                            break;

                        case "rg2":
                            const now = new Date();
                            const isoString = now.toISOString();
                            const time = isoString
                                .replace("T", " ")
                                .substring(0, 19);

                            games_recover.set(payload.id, {
                                ws_client_name: payload.ws_client_name,
                                date: time,
                                ws_client: ws,
                            });

                            break;

                        case "rg_pong":
                            const game_opponent = games_recover.get(payload.id);

                            const database = client.db("chess_recover_games");
                            const gamesCollection =
                                database.collection("games");

                            const game_recover = await gamesCollection.findOne({
                                id: payload.id,
                            });

                            const player1_data = {
                                id: game_recover.id,

                                player1: structuredClone(game_recover.player1),

                                player2: structuredClone(game_recover.player2),

                                turn:
                                    game_recover.currentplayer === "player1"
                                        ? true
                                        : false,

                                time_modality: game_recover.time_modality,
                            };

                            const player2_data = {
                                id: game_recover.id,

                                player1: structuredClone(game_recover.player2),

                                player2: structuredClone(game_recover.player1),

                                turn:
                                    game_recover.currentplayer === "player1"
                                        ? false
                                        : true,

                                time_modality: game_recover.time_modality,
                            };

                            if (game_recover.sending_player === "player1") {
                                Object.keys(
                                    player2_data.player1.pieces,
                                ).forEach((key) => {
                                    player2_data.player1.pieces[key] =
                                        player2_data.player1.pieces[key].map(
                                            (x) => {
                                                if (key === "pawns") {
                                                    return [99 - x[0], x[1]];
                                                }
                                                return 99 - x;
                                            },
                                        );
                                });

                                Object.keys(
                                    player2_data.player2.pieces,
                                ).forEach((key) => {
                                    player2_data.player2.pieces[key] =
                                        player2_data.player2.pieces[key].map(
                                            (x) => {
                                                if (key === "pawns") {
                                                    return [99 - x[0], x[1]];
                                                }
                                                return 99 - x;
                                            },
                                        );
                                });
                            } else {
                                Object.keys(
                                    player1_data.player1.pieces,
                                ).forEach((key) => {
                                    player1_data.player1.pieces[key] =
                                        player1_data.player1.pieces[key].map(
                                            (x) => {
                                                if (key === "pawns") {
                                                    return [99 - x[0], x[1]];
                                                }
                                                return 99 - x;
                                            },
                                        );
                                });

                                Object.keys(
                                    player1_data.player2.pieces,
                                ).forEach((key) => {
                                    player1_data.player2.pieces[key] =
                                        player1_data.player2.pieces[key].map(
                                            (x) => {
                                                if (key === "pawns") {
                                                    return [99 - x[0], x[1]];
                                                }
                                                return 99 - x;
                                            },
                                        );
                                });
                            }

                            games.set(game_recover.id, {
                                player1: {
                                    client:
                                        game_opponent.ws_client_name ===
                                        game_recover.player1.name
                                            ? game_opponent.ws_client
                                            : game_opponent.ws_client_opponent,
                                    name: game_recover.player1.name,
                                    time: game_recover.player1.time,
                                },
                                player2: {
                                    client:
                                        game_opponent.ws_client_name ===
                                        game_recover.player1.name
                                            ? game_opponent.ws_client_opponent
                                            : game_opponent.ws_client,
                                    name: game_recover.player2.name,
                                    time: game_recover.player2.time,
                                },
                                time_modality: game_recover.time_modality,
                                currentplayer: game_recover.currentplayer,
                                timestart: Date.now(),
                            });

                            const game = games.get(payload.id);

                            const x = [game_recover.id, game];

                            game_opponent.ws_client.send(
                                JSON.stringify({
                                    type: "recovering_game",

                                    payload: {
                                        player_data:
                                            game_opponent.ws_client_name ===
                                            player1_data.player1.name
                                                ? player1_data
                                                : player2_data,
                                    },
                                }),
                            );

                            game_opponent.ws_client_opponent.send(
                                JSON.stringify({
                                    type: "recovering_game",

                                    payload: {
                                        player_data:
                                            game_opponent.ws_client_name ===
                                            player1_data.player1.name
                                                ? player2_data
                                                : player1_data,
                                    },
                                }),
                            );

                            timer_games_plus10.set(x[0], x[1]);

                            games_recover.delete(payload.id);

                            const sql_id_2 = `
                                                UPDATE recover_game 
                                                SET joined = NOW()
                                                WHERE ID = ?
                                            `;

                            await promisePool.query(
                                sql_id_2,
                                [payload.id], // Pass the parameter here
                            );

                            break;
                    }

                    break;

                case "talk":
                    const game_1 = games.get(payload.id);

                    if (game_1) {
                        if (game_1.player1.client === ws) {
                            game_1.player2.client.send(
                                JSON.stringify({
                                    type: "talk",
                                    payload: payload.text,
                                }),
                            );
                        } else {
                            game_1.player1.client.send(
                                JSON.stringify({
                                    type: "talk",
                                    payload: payload.text,
                                }),
                            );
                        }
                    }

                    break;

                case "options":
                    const game_2 = games.get(payload.id);

                    if (game_2) {
                        switch (payload.type) {
                            case "save_and_resume":
                                switch (payload.way) {
                                    case "way_1":
                                        if (game_2) {
                                            if (game_2.player1.client === ws) {
                                                game_2.player2.client.send(
                                                    JSON.stringify({
                                                        type: "save_and_resume",
                                                        payload: {
                                                            way: "way_1",
                                                        },
                                                    }),
                                                );
                                            } else {
                                                game_2.player1.client.send(
                                                    JSON.stringify({
                                                        type: "save_and_resume",
                                                        payload: {
                                                            way: "way_1",
                                                        },
                                                    }),
                                                );
                                            }
                                        }

                                        break;

                                    case "way_2":
                                        switch (payload.accepted) {
                                            case true:
                                                const GameState = {
                                                    id: undefined, // Make sure to replace "gameId" with your actual game ID
                                                    player1: {
                                                        pieces: undefined,
                                                        name: undefined,
                                                        color: undefined,
                                                        time: undefined,
                                                        castling: true,
                                                    },
                                                    player2: {
                                                        pieces: undefined,
                                                        name: undefined,
                                                        color: undefined,
                                                        time: undefined,
                                                        castling: true,
                                                    },
                                                    currentplayer: undefined,
                                                    time_modality: undefined,
                                                    sending_player: undefined,
                                                };

                                                const sql_id =
                                                    "SELECT * FROM created_games WHERE id = ?";

                                                const game_sql =
                                                    await promisePool.query(
                                                        sql_id,
                                                        [payload.id],
                                                    );

                                                const match = game_sql[0][0];

                                                GameState.id = match.id;

                                                GameState.player1.name =
                                                    match.player1;
                                                GameState.player1.color =
                                                    match.color1;
                                                GameState.player1.castling =
                                                    payload.pieces_state.player1.castling;

                                                GameState.player2.name =
                                                    match.player2;
                                                GameState.player2.color =
                                                    match.color2;
                                                GameState.player2.castling =
                                                    payload.pieces_state.player2.castling;

                                                GameState.player1.time =
                                                    game_2.player1.time;
                                                GameState.player2.time =
                                                    game_2.player2.time;

                                                GameState.time_modality =
                                                    game_2.time_modality;
                                                GameState.currentplayer =
                                                    game_2.currentplayer;

                                                if (
                                                    game_2.player1.client === ws
                                                ) {
                                                    GameState.player1.pieces =
                                                        payload.pieces_state.player1.pieces;
                                                    GameState.player2.pieces =
                                                        payload.pieces_state.player2.pieces;
                                                    GameState.sending_player =
                                                        "player1";
                                                } else {
                                                    GameState.player1.pieces =
                                                        payload.pieces_state.player2.pieces;
                                                    GameState.player2.pieces =
                                                        payload.pieces_state.player1.pieces;
                                                    GameState.sending_player =
                                                        "player2";
                                                }

                                                GameState[
                                                    GameState.currentplayer
                                                ].time -=
                                                    Date.now() -
                                                    game_2.timestart;

                                                run_insertMongo(GameState);

                                                const sql_id_2 = `
                                                INSERT INTO recover_game (ID, player1, player2, date_savedgame, joined) 
                                                VALUES (?, ?, ?, NOW(), NULL) 
                                                ON DUPLICATE KEY UPDATE 
                                                player1 = VALUES(player1), 
                                                player2 = VALUES(player2), 
                                                date_savedgame = VALUES(date_savedgame),
                                                joined = NULL;
                                            `;

                                                await promisePool.query(
                                                    sql_id_2,
                                                    [
                                                        match.id,
                                                        match.player1,
                                                        match.player2,
                                                    ],
                                                );

                                                game_2.player2.client.send(
                                                    JSON.stringify({
                                                        type: "save_and_resume",
                                                        payload: {
                                                            way: "way_2",
                                                            accepted:
                                                                payload.accepted,
                                                        },
                                                    }),
                                                );

                                                game_2.player1.client.send(
                                                    JSON.stringify({
                                                        type: "save_and_resume",
                                                        payload: {
                                                            way: "way_2",
                                                            accepted:
                                                                payload.accepted,
                                                        },
                                                    }),
                                                );

                                                break;

                                            case false:
                                                break;
                                        }

                                        break;

                                    default:
                                        
                                        break;
                                }

                                break;

                            case "draw":
                                const game_3 = games.get(payload.id);

                                switch (payload.way) {
                                    case "way_1":
                                        if (game_3) {
                                            if (game_3.player1.client === ws) {
                                                game_3.player2.client.send(
                                                    JSON.stringify({
                                                        type: "draw",
                                                        payload: {
                                                            way: payload.way,
                                                        },
                                                    }),
                                                );
                                            } else {
                                                game_3.player1.client.send(
                                                    JSON.stringify({
                                                        type: "draw",
                                                        payload: {
                                                            way: payload.way,
                                                        },
                                                    }),
                                                );
                                            }
                                        }

                                        break;

                                    case "way_2":
                                        switch (payload.accepted) {
                                            case true:
                                                if (game_3) {
                                                    game_3.player2.client.send(
                                                        JSON.stringify({
                                                            type: "draw",
                                                            payload: {
                                                                way: payload.way,
                                                                accepted:
                                                                    payload.accepted,
                                                            },
                                                        }),
                                                    );

                                                    game_3.player1.client.send(
                                                        JSON.stringify({
                                                            type: "draw",
                                                            payload: {
                                                                way: payload.way,
                                                                accepted:
                                                                    payload.accepted,
                                                            },
                                                        }),
                                                    );
                                                    timer_games_minus10.delete(
                                                        payload.id,
                                                    );
                                                    timer_games_plus10.delete(
                                                        payload.id,
                                                    );
                                                }

                                                break;

                                            case false:
                                                if (game_3) {
                                                    if (
                                                        game_3.player1
                                                            .client === ws
                                                    ) {
                                                        game_3.player2.client.send(
                                                            JSON.stringify({
                                                                type: "draw",
                                                                payload: {
                                                                    way: payload.way,
                                                                    accepted:
                                                                        payload.accepted,
                                                                },
                                                            }),
                                                        );
                                                    } else {
                                                        game_3.player1.client.send(
                                                            JSON.stringify({
                                                                type: "draw",
                                                                payload: {
                                                                    way: payload.way,
                                                                    accepted:
                                                                        payload.accepted,
                                                                },
                                                            }),
                                                        );
                                                    }
                                                }

                                                break;

                                            default:
                                                

                                        }

                                        break;

                                    default:
                                       
                                        break;
                                }

                                break;

                            case "resign":
                                game_2.player2.client.send(
                                    JSON.stringify({
                                        type: "resign",
                                        payload: {
                                            winner: payload.winner,
                                            looser: payload.looser,
                                        },
                                    }),
                                );

                                game_2.player1.client.send(
                                    JSON.stringify({
                                        type: "resign",
                                        payload: {
                                            winner: payload.winner,
                                            looser: payload.looser,
                                        },
                                    }),
                                );

                                timer_games_minus10.delete(payload.id);
                                timer_games_plus10.delete(payload.id);

                                break;

                            default:
                               
                                break;
                        }
                    }

                    break;

                case "alive_pong":
                    break;

                default:
                    writeLOG("Unknown action:", message.type);
                    break;
            }
        } catch (error) {
            
                writeERROR('An error occurred:', error);
            
            
        }
    });

    ws.on("close", () => {});
});

// Start the HTTPS server
server.listen(8080, () => {
    writeLOG("WebSocket server is running on wss://localhost:8080");
});
