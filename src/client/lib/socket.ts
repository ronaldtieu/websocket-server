import { io } from "socket.io-client";

// app and socket server share the same origin, so io() with no args is enough.
export const socket = io();
