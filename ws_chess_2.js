const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");
const mysql = require("mysql2");
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config(); 












 // For modality time_per_player :

      // when a player moves his time left is updated to as the time when his movement started in server side but also sent to client(maybe better to send this when his turn begins);so when he moves (so start_movement must be stored0),
      
     


 // For modality time_per_round :

      // when a player moves his time resets to original 
 

 // El ID ha de ser generado por servers


 // al enviar movimiento, delete de minus10, siempre...eso si, primero cambio el undefined y despues deleteo en mins10, no vaya a ser

 const timer_games_plus10 = new Map();
 const timer_games_minus10 = new Map();

 
 
  //    algorithmic_max_time  =>     10.000 + 1 + var_exec + exec_time
 
 const per_player_plus10 = () => {
 
     const currentTime = Date.now();
 
     for (let element of timer_games_plus10) {  
 
       
         if (element[element.currentplayer] - (currentTime - element.timestart) < 15000) {
             timer_games_minus10.push(element);
             element.timestart = undefined;
 
 
         }
     }
 };
 
 const per_player_minus10 = () => {
 
     const currentTime = Date.now();
 
     for (let element of timer_games_minus10) {  
 
       
         if (element[element.currentplayer] - (currentTime - element.timestart) < -0.2) {
             
             
             timer_games_minus10.delete(element);
 
             element.player1.client.send(
                 JSON.stringify({ type: "end_game", payload: {motive : "end_time", currentplayer: element.currentplayer } })
               );
               element.player2.client.send(
                 JSON.stringify({ type: "end_game", payload: {motive : "end_time", currentplayer: element.currentplayer } })
               );
         }
     }
 };
 
 
 
 
 
 
 
 setInterval(() => { per_player_plus10() }, 10000);
 
 setInterval(() => { per_player_minus10() }, 1000);
 
 
 











 function getRandomInt() {
  return Math.floor(Math.random() * 10);
}

function getRandomLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  return letters.charAt(Math.floor(Math.random() * letters.length));
}

function getRandomID() {
     return id = getRandomLetter() + getRandomInt() + "-" +
       getRandomLetter() + getRandomLetter() + getRandomInt() + getRandomLetter() + "-" +
       getRandomLetter() + getRandomLetter() + getRandomInt() + getRandomInt();


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


let clients = new Array(); // Store all connected games

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
              time
              
            ]);

            console.log("Game inserted successfully with ID:", id);
          } catch (error) {
            console.error("Error inserting game:", error);
          }



          
        games.set(payload.id, {
          player1: {
            client: ws,
            name: payload.player1,
            time: payload.countdown_time
          },
          player2: {
            client: undefined,
            name: payload.player2,
            time: payload.countdown_time
          },
          time_modality: payload.time_modality,
          currentplayer: "player1",
          timestart: undefined
        });
        
          
        ws.send(
          JSON.stringify({ type: "ID", payload: id })
        );



          break;

        case "join_game":


        const sql_id = "SELECT * FROM created_games WHERE id = ?";

        const game = await promisePool.query(sql_id, [
          payload.id,
          
        ]);

        console.log(games);


          if (game) {

            const client = games.get(payload.id); // Retrieve the game object by its ID

            console.log(games);
            client.player2.client = ws;
            

            const sendJSON1 = {
              id: game.id,
              player1: game.player1,
              color1: game.color1,
              player2: game.player2,
              color2: game.color2,
              countdown_time: game.countdown_time,
              time_modality: game.time_modality,
              round: 1,
            };
            const sendJSON2 = {
              id: game.id,
              player1: game.player2,
              color1: game.color2,
              player2: game.player1,
              color2: game.color1,
              countdown_time: game.countdown_time,
              time_modality: game.time_modality,
              round: 2,
            };

            client.player1.send(
              JSON.stringify({ type: "start_game", payload: sendJSON1 })
            );
            client.player2.send(
              JSON.stringify({ type: "start_game", payload: sendJSON2 })
            );

            games.get(payload.id).timestart = Date.now();

          } else {
            ws.send(
              JSON.stringify({
                type: "message",
                message: "No such game found.",
              })
            );
          }
          break;

        case "move":

          const client = games.get(payload.id);

          if (client.time_modality == "PerPlayer")   {   element[element.currentplayer].time -= ((Date.now() - client.timestart))      }


           

          const sendJSON = {
            id: payload.id,
            moveA: payload.moveA,
            moveB: payload.moveB,
            turn: payload.turn,
            pawn_promotion: payload.pawn_promotion,
            castling: payload.castle,
            time_left: client.currentplayer === "player1" ? client.time2 : client.time1
          };
          

          if (client.player1 === ws) {
            client.player2.send(
              JSON.stringify({ type: "move", payload: sendJSON })
            );
            client.player1.send(
              JSON.stringify({ type: "time_left", payload: sendJSON.time_left })
            );
          } else {
            client.player1.send(
              JSON.stringify({ type: "move", payload: sendJSON })
            );
              client.player2.send(
                JSON.stringify({ type: "time_left", payload: sendJSON.time_left })
            );
          }

          client.currentplayer = client.currentplayer === "player1" ? "player1" : "player2"
          
          client.timestart = Date.now();  

          timer_games_minus10.delete(payload.id);

          break;
          


          case "recover":
          
          break;


          case "talk":
          
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
