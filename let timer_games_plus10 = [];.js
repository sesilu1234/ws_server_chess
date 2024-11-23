

 // For modality time_per_player :

      // when a player moves his time left is updated to as the time when his movement started in server side but also sent to client(maybe better to send this when his turn begins);so when he moves (so start_movement must be stored0),
      
     


 // For modality time_per_round :

      // when a player moves his time resets to original 
 

 // El ID ha de ser generado por servers


 // al enviar movimiento, delete de minus10, siempre...eso si, primero cambio el undefined y despues deleteo en mins10, no vaya a ser

const timer_games_plus10 = Map();
const timer_games_minus10 = Map();

let ej1 = {
    id: 100, 
    player1: {client: ws1, name: name1, time : time1},
    player2: {client: ws2, name: name2, time : time2}, 
    currentplayer: "player1", 
    timestart: date
};


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















