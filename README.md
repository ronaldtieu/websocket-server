# Websocket Server

a real-time multiplayer websocket server designed for card and board games. this server handles all the networking layer — player connections, game rooms, and event broadcasting — while keeping your game logic completely separate.

## How It Works

think of this as a transport layer for your games. you build your game logic separately (using oop and whatever structure makes sense for your game), then plug it into this server by implementing the `gameinterface` contract.

```
┌─────────────────┐         ┌─────────────────────┐
│   your game     │         │  websocket server   │
│   (separate     │◄────────┤  (this project)     │
│    project)     │  uses   │                     │
│                 │         │ - socket.io          │
│ - game classes  │         │ - connection mgmt    │
│ - rules         │         │ - room management    │
│ - state         │         │ - event broadcasting │
│ - no network!   │         │ - game factory       │
└─────────────────┘         └─────────────────────┘
```

## Tech Stack

| component | what it does |
|-----------|--------------|
| **typescript** | type-safe code that's easy to understand and refactor |
| **socket.io** | real-time bidirectional communication between server and clients |
| **node.js** | javascript runtime for running the server |

## Project Structure

```
websocket-server/
├── src/
│   ├── server.ts              # entry point - starts the http server and socket.io
│   ├── socket/
│   │   └── handler.ts         # socket event handlers (join, leave, actions, etc.)
│   └── games/
│       ├── gameinterface.ts   # contract your game must implement
│       └── gamemanager.ts     # creates and manages game instances
├── public/
│   └── test-client.html       # simple ui for testing the websocket
├── package.json
└── tsconfig.json
```

## Getting Started

### installation

```bash
npm install
```

### running the server

```bash
# development mode (with auto-reload)
npm run dev

# or build and run
npm run build
npm start
```

the server runs on `http://localhost:3000` by default.

### testing

open `http://localhost:3000` in your browser to use the test client. you can:
- connect to the server
- join a game room (enter a game id and player name)
- send test actions
- start the game
- see events in real-time

to test from other devices on your network, use your computer's ip address:
```
http://192.168.x.x:3000
```

## Integrating Your Game

to connect your game library to this server, implement the `gameinterface` in your game project:

```typescript
// in your game library
import type { gameinterface, playeraction, gamestate } from 'websocket-server';

export class myunisexgame implements gameinterface {
  readonly gameid: string;
  private players: map<string, player> = new map();

  constructor(gameid: string) {
    this.gameid = gameid;
  }

  // implement all the interface methods...
  getstate(): gamestate { /* ... */ }
  addplayer(playerid: string, playername: string): boolean { /* ... */ }
  removeplayer(playerid: string): void { /* ... */ }
  handleaction(playerid: string, action: playeraction): gamestate { /* ... */ }
  isfull(): boolean { /* ... */ }
  hasstarted(): boolean { /* ... */ }
  getplayercount(): number { /* ... */ }
  start(playerid: string): boolean { /* ... */ }
}
```

then, in `src/server.ts`, set up the game factory:

```typescript
import { myunisexgame } from 'my-game-library';

gamemanager.setgamefactory((gameid: string) => {
  return new myunisexgame(gameid);
});
```

## Socket Events

### client → server

| event | payload | purpose |
|-------|---------|---------|
| `join_game` | `{ gameid, playername }` | player joins a game room |
| `leave_game` | - | player leaves the current game |
| `game_action` | `{ type, payload }` | player performs an action |
| `start_game` | - | player starts the game |

### server → client

| event | payload | purpose |
|-------|---------|---------|
| `game_state` | `gamestate` | current game state |
| `error` | `{ message }` | something went wrong |
| `player_joined` | `{ playerid, playername }` | new player joined |
| `player_left` | `{ playerid, playername }` | player left |
| `game_started` | `gamestate` | game has started |

## Configuration

you can configure the server using environment variables:

| variable | default | purpose |
|----------|---------|---------|
| `port` | `3000` | port to run the server on |
| `cors_origin` | `*` | which domains can connect (use your frontend domain in production) |

example:
```bash
port=8080 cors_origin=https://mygame.com npm run dev
```

## Deployment Considerations

before deploying to production:

1. **set cors_origin** to your actual frontend domain instead of `*`
2. **add authentication** to verify players (jwt, sessions, etc.)
3. **add rate limiting** to prevent abuse
4. **use https/wss** (secure websockets) in production
5. **consider using a process manager** like pm2 for auto-restart

## License

mit
