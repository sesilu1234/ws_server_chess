const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const mysql = require("mysql2");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

// For modality time_per_player :

// when a player moves his time left is updated to as the time when his movement started in server side but also sent to client(maybe better to send this when his turn begins);so when he moves (so start_movement must be stored0),

// For modality time_per_round :

// when a player moves his time resets to original

// El ID ha de ser generado por servers

// al enviar movimiento, delete de minus10, siempre...eso si, primero cambio el undefined y despues deleteo en mins10, no vaya a ser

const { MongoClient } = require("mongodb");

// Connection URI with pool size configuration
const uri =
  "mongodb+srv://sesilu1234:Emilborel1234@cluster0.kwper.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const options = {
  maxPoolSize: 10, // Set the max number of connections in the pool
  minPoolSize: 2, // Optional: Set a minimum pool size
};

const client = new MongoClient(uri, options);

client.connect();





async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const database = client.db("chess_recover_games"); // Correct database name
    const gamesCollection = database.collection("games"); // Correct collection name

    // Insert the initial game state into the database
    const result = await gamesCollection.insertOne(initialGameState);
    console.log(`Game state inserted with ID: ${result.insertedId}`);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    await client.close(); // Close the connection when done
  }
}

const games_recover = new Map();

const timer_games_plus10 = new Map();
const timer_games_minus10 = new Map();

//    algorithmic_max_time  =>     10.000 + 1 + var_exec + exec_time

const per_player_plus10 = () => {
  const currentTime = Date.now();

  for (let [key, element] of timer_games_plus10) {
    if (
      element[element.currentplayer].time - (currentTime - element.timestart) <
      15000
    ) {
      timer_games_minus10.set(key, { ...element });
      element.timestart = undefined;
    }
  }
};

const per_player_minus10 = () => {
  const currentTime = Date.now();

  for (let [key, element] of timer_games_minus10) {
    if (
      element[element.currentplayer].time - (currentTime - element.timestart) <
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
const server = https.createServer({
  cert: fs.readFileSync("../certbot/fullchain.pem"),
  key: fs.readFileSync("../certbot/privkey.pem"),
});

// Create a secure WebSocket server on top of the HTTPS server
const wss = new WebSocket.Server({ server });

let clients = new Array(); // Store all connected ips

let games = new Map(); // Store all connected games

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("Client connected. Total games:", clients.length);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data);
      const payload = message.payload;

      switch (message.type) {
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

            console.log("Game inserted successfully with ID:", id);
          } catch (error) {
            console.error("Error inserting game:", error);
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

          ws.send(JSON.stringify({ type: "ID", payload: id }));

          break;

        case "join_game":
          const sql_id = "SELECT * FROM created_games WHERE id = ?";

          const game_sql = await promisePool.query(sql_id, [payload.id]);

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
              JSON.stringify({ type: "start_game", payload: sendJSON1 }),
            );
            game.player2.client.send(
              JSON.stringify({ type: "start_game", payload: sendJSON2 }),
            );

            game.timestart = Date.now();

            const x = [match.id, game];
            timer_games_plus10.set(x[0], x[1]);
          } else {
            ws.send(
              JSON.stringify({
                type: "message",
                message: "No such game found.",
              }),
            );
          }
          break;

        case "move":
          const game = games.get(payload.id);

          if (game.time_modality == "perPlayer") {
            game[game.currentplayer].time -= Date.now() - game.timestart;
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
              JSON.stringify({ type: "move", payload: sendJSON }),
            );
            game.player1.client.send(
              JSON.stringify({
                type: "time_left",
                payload: sendJSON.time_left,
              }),
            );
          } else {
            game.player1.client.send(
              JSON.stringify({ type: "move", payload: sendJSON }),
            );
            game.player2.client.send(
              JSON.stringify({
                type: "time_left",
                payload: sendJSON.time_left,
              }),
            );
          }

          game.currentplayer =
            game.currentplayer === "player1" ? "player2" : "player1";

          game.timestart = Date.now();

          timer_games_minus10.delete(payload.id);

          

          break;

        case "recover_game":
          switch (payload.type) {
            case "rg1":
              const database = client.db("chess_recover_games"); // Correct database name
              const gamesCollection = database.collection("games"); // Correct collection name

              const searchId = payload.id_to_recover; // Replace with the ID you want to search for

              // Find the document with the matching id
              const game_to_recover = await gamesCollection.findOne({
                id: searchId,
              });

              if (game_to_recover) {
                console.log("Game found:", game_to_recover);

                ws.send(
                  JSON.stringify({
                    type: "rg1",
                    payload: {
                      player1: game_to_recover.player1.name,
                      player2: game_to_recover.player2.name,
                    },
                  }),
                );
              } else {
                console.log("No game found with the given ID.");
              }

              break;
          }

          break;

        case "talk":
          const game_1 = games.get(payload.id);

          if (game_1) {
            if (game_1.player1.client === ws) {
              game_1.player2.client.send(
                JSON.stringify({ type: "talk", payload: payload.text }),
              );
            } else {
              game_1.player1.client.send(
                JSON.stringify({ type: "talk", payload: payload.text }),
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
                      JSON.stringify({ type: "save_and_resume", payload: { way: "way_1" }}),
                    );
                  } else {
                    game_2.player1.client.send(
                      JSON.stringify({ type: "save_and_resume", payload: { way: "way_1" } }),
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
                        
                      };


                      const sql_id = "SELECT * FROM created_games WHERE id = ?";

                      const game_sql = await promisePool.query(sql_id, [payload.id]);

                      const match = game_sql[0][0];
        
                      
                     

                              GameState.id = match.id;

                              GameState.player1.name = match.player1;
                              GameState.player1.color = match.color1;
                              GameState.player1.castling = payload.pieces_state.player1.castling;
                              


                              GameState.player2.name = match.player2;
                              GameState.player2.color = match.color2;
                              GameState.player2.castling = payload.pieces_state.player2.castling;
                              

                              GameState.player1.time = game_2.player1.time;
                              GameState.player2.time = game_2.player2.time;

                              GameState.time_modality = game_2.time_modality;
                              GameState.currentplayer = game_2.currentplayer;




                              if (game_2.player1.client === ws) {

                              GameState.player1.pieces = payload.pieces_state.player1.pieces;
                              GameState.player2.pieces = payload.pieces_state.player2.pieces;

                              }

                              else {

                                GameState.player1.pieces = payload.pieces_state.player2.pieces;
                                GameState.player2.pieces = payload.pieces_state.player1.pieces;


                              }

                              GameState[GameState.currentplayer].time -= (Date.now() - game_2.timestart);

                              console.log(GameState);


                      game_2.player2.client.send(
                        JSON.stringify({ type: "save_and_resume", payload:{ way : "way_2", accepted: payload.accepted }}),
                      );
                   
                      game_2.player1.client.send(
                        JSON.stringify({ type: "save_and_resume", payload:{ way : "way_2", accepted: payload.accepted } }),
                      );



                      break


                      case false:



                      break





                  }



                  break;


                  default:
                    console.log("Unknown action:");
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
                              JSON.stringify({ type: "draw", payload: { way: payload.way }}),
                            );
                          } else {
                            game_3.player1.client.send(
                              JSON.stringify({ type: "draw", payload: { way: payload.way } }),
                            );
                          }
                        }










                            break


                        case "way_2":


                              switch (payload.accepted) {


                                    case true:




                                    if (game_3) {
                                      
                                      game_3.player2.client.send(
                                          JSON.stringify({ type: "draw", payload:{ way : payload.way, accepted: payload.accepted }}),
                                        );
                                     
                                        game_3.player1.client.send(
                                          JSON.stringify({ type: "draw", payload:{ way : payload.way, accepted: payload.accepted } }),
                                        );
                                      
                                    }




                                        break



                                    case false:



                                    if (game_3) {
                                      if (game_3.player1.client === ws) {
                                        game_3.player2.client.send(
                                          JSON.stringify({ type: "draw", payload:{ way : payload.way, accepted: payload.accepted } }),
                                        );
                                      } else {
                                        game_3.player1.client.send(
                                          JSON.stringify({ type: "draw", payload:{ way : payload.way, accepted: payload.accepted } }),
                                        );
                                      }
                                    }







                                        break



                                        default:
                                          
                                          console.log("Accepted has an unexpected value");


                              }






                            break



                        default:
                          console.log("Unknown action:");
                          break;


                }





                break;

              case "resign":
                game_2.player2.client.send(
                  JSON.stringify({
                    type: "resign",
                    payload: { winner: payload.winner, looser: payload.looser },
                  }),
                );

                game_2.player1.client.send(
                  JSON.stringify({
                    type: "resign",
                    payload: { winner: payload.winner, looser: payload.looser },
                  }),
                );

                break;

              default:
                console.log("Unknown action:");
                break;
            }
          }

          break;

        default:
          console.log("Unknown action:", message.type);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client gone, now games and games length is: ", games.length);
  });
});

// Start the HTTPS server
server.listen(8080, () => {
  console.log("WebSocket server is running on wss://localhost:8080");
});
