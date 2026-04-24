export interface Player {
  id: string;
  name: string;
  avatar: string;
  isCpu?: boolean;
  isHost?: boolean;
}

export interface GameInfo {
  id: string;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  image: string;
}

export interface GameState {
  players: Player[];
  lobbyCode: string;
  status: 'lobby' | 'starting' | 'playing' | 'settings' | 'game-selection';
  selectedGameId: string | null;
  // server-detected LAN URL, e.g. "http://192.168.1.169:3131".
  // null if the server couldn't find a non-loopback IPv4 interface.
  // the QR code should encode this so phones hit the host machine, not themselves.
  lanUrl: string | null;
}

export const MOOD_COLORS = {
  accent: "#FFFFFF",
  accentDark: "#A3A3A3",
  bg: "#0A0A0A",
  card: "rgba(255, 255, 255, 0.03)",
  line: "rgba(255, 255, 255, 0.08)",
  text: "#FFFFFF",
  muted: "#737373",
};
